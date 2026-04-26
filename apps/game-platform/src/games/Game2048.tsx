import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  type Board,
  type Direction,
  applyMove,
  createEmptyBoard,
  has2048,
  isGameOver,
  spawnTile,
} from "./2048/logic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_BEST_KEY = "arcade:2048:best";

// ---------------------------------------------------------------------------
// Tile appearance palette (dark/neon arcade aesthetic)
// ---------------------------------------------------------------------------

interface TileStyle {
  bg: string;
  text: string;
  glow: string;
}

const TILE_PALETTE: Record<number, TileStyle> = {
  2: { bg: "#1e1b4b", text: "#c4b5fd", glow: "rgba(196, 181, 253, 0.35)" },
  4: { bg: "#2e1065", text: "#a78bfa", glow: "rgba(167, 139, 250, 0.4)" },
  8: { bg: "#4a1d96", text: "#ddd6fe", glow: "rgba(167, 139, 250, 0.55)" },
  16: { bg: "#831843", text: "#f9a8d4", glow: "rgba(249, 168, 212, 0.4)" },
  32: { bg: "#9d174d", text: "#fb7185", glow: "rgba(251, 113, 133, 0.45)" },
  64: { bg: "#881337", text: "#fca5a5", glow: "rgba(244, 63, 94, 0.5)" },
  128: { bg: "#064e3b", text: "#6ee7b7", glow: "rgba(110, 231, 183, 0.5)" },
  256: { bg: "#134e4a", text: "#5eead4", glow: "rgba(94, 234, 212, 0.5)" },
  512: { bg: "#0c4a6e", text: "#7dd3fc", glow: "rgba(125, 211, 252, 0.5)" },
  1024: { bg: "#1e3a8a", text: "#93c5fd", glow: "rgba(147, 197, 253, 0.5)" },
  2048: { bg: "#78350f", text: "#fcd34d", glow: "rgba(252, 211, 77, 0.7)" },
};

function getTileStyle(value: number): TileStyle {
  if (value in TILE_PALETTE) return TILE_PALETTE[value] as TileStyle;
  if (value >= 4096) return { bg: "#172554", text: "#bfdbfe", glow: "rgba(191, 219, 254, 0.5)" };
  return { bg: "#1e293b", text: "#e2e8f0", glow: "rgba(226, 232, 240, 0.3)" };
}

function getTileFontSize(value: number): string {
  if (value < 100) return "1.75rem";
  if (value < 1000) return "1.4rem";
  if (value < 10000) return "1.1rem";
  return "0.85rem";
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

type GameStatus = "idle" | "playing" | "won" | "over";

interface GameState {
  board: Board;
  score: number;
  status: GameStatus;
  /** True once the player has dismissed the "You won!" overlay — allows playing past 2048. */
  wonAcknowledged: boolean;
}

function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(LS_BEST_KEY);
    if (raw === null) return 0;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number): void {
  try {
    localStorage.setItem(LS_BEST_KEY, String(score));
  } catch {
    // storage unavailable — ignore
  }
}

function createNewGame(): GameState {
  const empty = createEmptyBoard();
  const board = spawnTile(spawnTile(empty));
  return { board, score: 0, status: "playing", wonAcknowledged: false };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBox({ label, value, glowHex }: { label: string; value: number; glowHex: string }) {
  return (
    <div
      className="flex min-w-24 flex-col items-center rounded-xl px-5 py-3"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 0 20px ${glowHex}22`,
      }}
    >
      <span
        className="mb-0.5 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "#64748b" }}
      >
        {label}
      </span>
      <span
        className="text-2xl font-bold tabular-nums"
        style={{
          background: `linear-gradient(90deg, ${glowHex}, ${glowHex}bb)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function NeonButton({
  children,
  onClick,
  gradient = "linear-gradient(135deg, #a78bfa, #7c3aed)",
  glow = "rgba(167, 139, 250, 0.45)",
}: {
  children: ReactNode;
  onClick: () => void;
  gradient?: string;
  glow?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-7 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
      style={{
        background: gradient,
        boxShadow: `0 4px 20px ${glow}`,
      }}
    >
      {children}
    </button>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl"
      style={{
        background: "rgba(10, 10, 15, 0.88)",
        backdropFilter: "blur(4px)",
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Game2048() {
  const [gameState, setGameState] = useState<GameState>({
    board: createEmptyBoard(),
    score: 0,
    status: "idle",
    wonAcknowledged: false,
  });
  const [bestScore, setBestScore] = useState<number>(loadBestScore);

  const updateBest = useCallback((score: number): void => {
    setBestScore((prev) => {
      if (score > prev) {
        saveBestScore(score);
        return score;
      }
      return prev;
    });
  }, []);

  const handleMove = useCallback(
    (direction: Direction): void => {
      setGameState((prev) => {
        if (prev.status !== "playing") return prev;

        const result = applyMove(prev.board, direction);
        if (!result.moved) return prev;

        const newScore = prev.score + result.score;
        const boardWithTile = spawnTile(result.board);

        let status: GameStatus = "playing";
        if (!prev.wonAcknowledged && has2048(boardWithTile)) {
          status = "won";
        } else if (isGameOver(boardWithTile)) {
          status = "over";
        }

        updateBest(newScore);

        return {
          board: boardWithTile,
          score: newScore,
          status,
          wonAcknowledged: prev.wonAcknowledged,
        };
      });
    },
    [updateBest],
  );

  const startGame = useCallback((): void => {
    setGameState(createNewGame());
  }, []);

  const keepPlaying = useCallback((): void => {
    setGameState((prev) => ({ ...prev, status: "playing", wonAcknowledged: true }));
  }, []);

  // Keyboard listener — cleaned up on unmount
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      let dir: Direction | null = null;
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          dir = "left";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dir = "right";
          break;
        case "ArrowUp":
        case "w":
        case "W":
          dir = "up";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dir = "down";
          break;
        default:
          break;
      }
      if (dir !== null) {
        e.preventDefault();
        handleMove(dir);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleMove]);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Page header */}
      <div className="text-center">
        <h1
          className="mb-1 text-4xl font-extrabold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #a78bfa, #c4b5fd)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          2048
        </h1>
        <p className="text-sm" style={{ color: "#64748b" }}>
          Arrow keys / WASD to shift tiles &middot; merge to reach 2048
        </p>
      </div>

      {/* Score strip + new game button */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ScoreBox label="Score" value={gameState.score} glowHex="#a78bfa" />
        <ScoreBox label="Best" value={bestScore} glowHex="#fcd34d" />
        <NeonButton onClick={startGame}>New Game</NeonButton>
      </div>

      {/* Game board */}
      <div
        className="relative rounded-2xl p-3"
        style={{
          background: "rgba(15, 15, 25, 0.95)",
          boxShadow: "0 0 48px rgba(167, 139, 250, 0.12), 0 0 0 1px rgba(167, 139, 250, 0.18)",
        }}
      >
        {/* 4×4 tile grid */}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            width: "min(480px, 90vw)",
          }}
        >
          {gameState.board.map((value, index) => {
            const style = getTileStyle(value);
            return (
              <div
                key={index}
                className="flex aspect-square items-center justify-center rounded-xl font-extrabold tabular-nums"
                style={
                  value === 0
                    ? {
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }
                    : {
                        background: style.bg,
                        color: style.text,
                        fontSize: getTileFontSize(value),
                        boxShadow: `0 0 18px ${style.glow}`,
                        border: `1px solid ${style.glow}`,
                      }
                }
              >
                {value !== 0 ? value : null}
              </div>
            );
          })}
        </div>

        {/* ── Idle overlay ── */}
        {gameState.status === "idle" && (
          <Overlay>
            <span className="text-5xl">🔢</span>
            <h2
              className="text-3xl font-extrabold"
              style={{
                background: "linear-gradient(90deg, #a78bfa, #c4b5fd)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              2048
            </h2>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              Slide and merge tiles to reach 2048.
            </p>
            <NeonButton onClick={startGame}>Start Game</NeonButton>
          </Overlay>
        )}

        {/* ── You won overlay ── */}
        {gameState.status === "won" && (
          <Overlay>
            <span className="text-5xl">🏆</span>
            <h2
              className="text-2xl font-extrabold"
              style={{
                background: "linear-gradient(90deg, #fbbf24, #fcd34d)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              You reached 2048!
            </h2>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              Score:{" "}
              <span style={{ color: "#a78bfa" }} className="font-bold">
                {gameState.score}
              </span>
            </p>
            <div className="flex gap-3">
              <NeonButton
                onClick={keepPlaying}
                gradient="linear-gradient(135deg, #fbbf24, #f59e0b)"
                glow="rgba(251, 191, 36, 0.5)"
              >
                Keep Playing
              </NeonButton>
              <NeonButton onClick={startGame}>New Game</NeonButton>
            </div>
          </Overlay>
        )}

        {/* ── Game over overlay ── */}
        {gameState.status === "over" && (
          <Overlay>
            <span className="text-5xl">💀</span>
            <h2
              className="text-2xl font-extrabold"
              style={{
                background: "linear-gradient(90deg, #f43f5e, #fb7185)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Game Over
            </h2>
            <p className="text-base font-semibold" style={{ color: "#94a3b8" }}>
              Score:{" "}
              <span style={{ color: "#a78bfa" }} className="font-bold">
                {gameState.score}
              </span>
            </p>
            <NeonButton onClick={startGame}>Play Again</NeonButton>
          </Overlay>
        )}
      </div>
    </div>
  );
}
