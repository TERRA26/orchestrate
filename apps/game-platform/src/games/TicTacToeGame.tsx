import { useCallback, useEffect, useState } from "react";

import {
  checkWinner,
  emptyBoard,
  getBestMove,
  isBoardFull,
  opposite,
  type Board,
  type Cell,
  type Player,
  type WinResult,
} from "./tic-tac-toe/logic";

// ─── Types ───────────────────────────────────────────────────────────────────

type GameMode = "pvp" | "pva";
type FirstMover = "human" | "ai";

interface Scores {
  X: number;
  O: number;
  draws: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const X_COLOR = "#f43f5e";
const O_COLOR = "#38bdf8";
const X_GLOW = "rgba(244, 63, 94, 0.65)";
const O_GLOW = "rgba(56, 189, 248, 0.65)";

function playerColor(p: Player): string {
  return p === "X" ? X_COLOR : O_COLOR;
}

function playerGlow(p: Player): string {
  return p === "X" ? X_GLOW : O_GLOW;
}

function getStartingPlayer(mode: GameMode, humanPlayer: Player, firstMover: FirstMover): Player {
  if (mode === "pvp") return "X";
  return firstMover === "human" ? humanPlayer : opposite(humanPlayer);
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TicTacToeGame() {
  // --- Settings (changing these resets the round) ---
  const [mode, setMode] = useState<GameMode>("pvp");
  const [humanPlayer, setHumanPlayer] = useState<Player>("X");
  const [firstMover, setFirstMover] = useState<FirstMover>("human");

  const aiPlayer = opposite(humanPlayer);

  // --- Live game state ---
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("X");
  const [winResult, setWinResult] = useState<WinResult | null>(null);
  const [isDraw, setIsDraw] = useState(false);
  const [scores, setScores] = useState<Scores>({ X: 0, O: 0, draws: 0 });

  const isGameOver = winResult !== null || isDraw;

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Resets the board for a new round. Accepts optional override arguments so
   * callers can pass the "next" setting values before React batches the setState.
   */
  const resetRound = useCallback(
    (m: GameMode = mode, hp: Player = humanPlayer, fm: FirstMover = firstMover) => {
      setBoard(emptyBoard());
      setWinResult(null);
      setIsDraw(false);
      setCurrentPlayer(getStartingPlayer(m, hp, fm));
    },
    [mode, humanPlayer, firstMover],
  );

  const resetAll = useCallback(() => {
    setScores({ X: 0, O: 0, draws: 0 });
    resetRound();
  }, [resetRound]);

  // ─── Settings handlers (each updates state + resets round atomically) ─────

  const handleModeChange = useCallback(
    (newMode: GameMode) => {
      setMode(newMode);
      resetRound(newMode, humanPlayer, firstMover);
    },
    [humanPlayer, firstMover, resetRound],
  );

  const handleHumanPlayerChange = useCallback(
    (hp: Player) => {
      setHumanPlayer(hp);
      resetRound(mode, hp, firstMover);
    },
    [mode, firstMover, resetRound],
  );

  const handleFirstMoverChange = useCallback(
    (fm: FirstMover) => {
      setFirstMover(fm);
      resetRound(mode, humanPlayer, fm);
    },
    [mode, humanPlayer, resetRound],
  );

  // ─── Human move ──────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (index: number) => {
      if (isGameOver) return;
      if (board[index] != null) return;
      if (mode === "pva" && currentPlayer !== humanPlayer) return;

      const newBoard = [...board] as Board;
      newBoard[index] = currentPlayer;

      const winner = checkWinner(newBoard);
      const draw = !winner && isBoardFull(newBoard);

      setBoard(newBoard);

      if (winner) {
        setWinResult(winner);
        setScores((s) => ({ ...s, [winner.player]: s[winner.player] + 1 }));
      } else if (draw) {
        setIsDraw(true);
        setScores((s) => ({ ...s, draws: s.draws + 1 }));
      } else {
        setCurrentPlayer(opposite(currentPlayer));
      }
    },
    [isGameOver, board, mode, currentPlayer, humanPlayer],
  );

  // ─── AI move ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "pva") return;
    if (isGameOver) return;
    if (currentPlayer !== aiPlayer) return;

    // Short delay so the move feels intentional rather than instant.
    const timer = setTimeout(() => {
      // Pass a copy so getBestMove's internal mutations don't touch React state.
      const move = getBestMove([...board], aiPlayer);
      if (move === -1) return;

      const newBoard = [...board] as Board;
      newBoard[move] = aiPlayer;

      const winner = checkWinner(newBoard);
      const draw = !winner && isBoardFull(newBoard);

      setBoard(newBoard);

      if (winner) {
        setWinResult(winner);
        setScores((s) => ({ ...s, [winner.player]: s[winner.player] + 1 }));
      } else if (draw) {
        setIsDraw(true);
        setScores((s) => ({ ...s, draws: s.draws + 1 }));
      } else {
        setCurrentPlayer(humanPlayer);
      }
    }, 420);

    return () => clearTimeout(timer);
  }, [board, currentPlayer, mode, aiPlayer, humanPlayer, isGameOver]);

  // ─── Status text ─────────────────────────────────────────────────────────

  let statusText: string;
  let statusColor: string;

  if (winResult) {
    if (mode === "pva") {
      statusText = winResult.player === humanPlayer ? "You win! 🎉" : "AI wins!";
    } else {
      statusText = `${winResult.player} wins!`;
    }
    statusColor = playerColor(winResult.player);
  } else if (isDraw) {
    statusText = "It's a draw!";
    statusColor = "#94a3b8";
  } else if (mode === "pva" && currentPlayer === aiPlayer) {
    statusText = "AI is thinking…";
    statusColor = playerColor(aiPlayer);
  } else if (mode === "pva") {
    statusText = "Your turn";
    statusColor = playerColor(humanPlayer);
  } else {
    statusText = `${currentPlayer}'s turn`;
    statusColor = playerColor(currentPlayer);
  }

  const isAiThinking = mode === "pva" && !isGameOver && currentPlayer === aiPlayer;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {/* Title */}
      <div className="text-center">
        <h1
          className="mb-1 text-4xl font-extrabold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #f43f5e, #fb7185)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Tic-Tac-Toe
        </h1>
      </div>

      {/* Mode Toggle */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {(["pvp", "pva"] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className="rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-200 active:scale-95"
            style={
              mode === m
                ? {
                    background: "linear-gradient(135deg, #f43f5e, #e11d48)",
                    color: "#fff",
                    boxShadow: "0 0 14px rgba(244,63,94,0.45)",
                  }
                : { color: "#64748b" }
            }
          >
            {m === "pvp" ? "Player vs Player" : "Player vs AI"}
          </button>
        ))}
      </div>

      {/* PvAI settings */}
      {mode === "pva" && (
        <div className="flex flex-col items-center gap-4">
          {/* Play as */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: "#94a3b8" }}>
              Play as:
            </span>
            <ToggleGroup>
              {(["X", "O"] as const).map((p) => (
                <ToggleButton
                  key={p}
                  active={humanPlayer === p}
                  onClick={() => handleHumanPlayerChange(p)}
                  activeStyle={{
                    background: playerColor(p),
                    color: "#fff",
                    boxShadow: `0 0 10px ${playerGlow(p)}`,
                  }}
                >
                  {p}
                </ToggleButton>
              ))}
            </ToggleGroup>
          </div>

          {/* Who goes first */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: "#94a3b8" }}>
              Goes first:
            </span>
            <ToggleGroup>
              {(["human", "ai"] as const).map((fm) => (
                <ToggleButton
                  key={fm}
                  active={firstMover === fm}
                  onClick={() => handleFirstMoverChange(fm)}
                  activeStyle={{
                    background: "linear-gradient(135deg, #f43f5e, #e11d48)",
                    color: "#fff",
                    boxShadow: "0 0 10px rgba(244,63,94,0.45)",
                  }}
                >
                  {fm === "human" ? "You" : "AI"}
                </ToggleButton>
              ))}
            </ToggleGroup>
          </div>
        </div>
      )}

      {/* Scoreboard */}
      <div
        className="flex overflow-hidden rounded-xl"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <ScoreBlock
          label={mode === "pva" && humanPlayer === "X" ? "You" : "X"}
          value={scores.X}
          color={X_COLOR}
        />
        <div className="self-stretch" style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
        <ScoreBlock label="Draws" value={scores.draws} color="#64748b" />
        <div className="self-stretch" style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
        <ScoreBlock
          label={mode === "pva" && humanPlayer === "O" ? "You" : "O"}
          value={scores.O}
          color={O_COLOR}
        />
      </div>

      {/* Board */}
      <div
        style={{
          opacity: isAiThinking ? 0.7 : 1,
          transition: "opacity 0.25s",
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          {board.map((cell, i) => {
            const isWinning = winResult?.line.includes(i) ?? false;
            const canInteract =
              !isGameOver && cell == null && (mode !== "pva" || currentPlayer === humanPlayer);
            return (
              <BoardCell
                key={i}
                cell={cell}
                isWinning={isWinning}
                canInteract={canInteract}
                onClick={() => handleCellClick(i)}
                aria-label={`Cell ${i + 1}: ${cell ?? "empty"}`}
              />
            );
          })}
        </div>
      </div>

      {/* Status */}
      <p
        className="text-xl font-bold transition-colors duration-300"
        style={{ color: statusColor, minHeight: "1.75rem" }}
      >
        {statusText}
      </p>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => resetRound()}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #f43f5e, #e11d48)",
            boxShadow: "0 4px 15px rgba(244,63,94,0.3)",
          }}
        >
          Reset Round
        </button>
        <button
          onClick={resetAll}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:brightness-125 active:scale-95"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "#64748b",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Reset Scores
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface BoardCellProps {
  cell: Cell;
  isWinning: boolean;
  canInteract: boolean;
  onClick: () => void;
  "aria-label": string;
}

function BoardCell({
  cell,
  isWinning,
  canInteract,
  onClick,
  "aria-label": ariaLabel,
}: BoardCellProps) {
  const isEmpty = cell == null;

  const borderColor = isWinning && cell ? playerColor(cell) : "rgba(255,255,255,0.1)";

  const bgColor =
    isWinning && cell
      ? `rgba(${cell === "X" ? "244,63,94" : "56,189,248"}, 0.12)`
      : "rgba(255,255,255,0.03)";

  const boxShadow =
    isWinning && cell
      ? `0 0 28px ${playerGlow(cell)}, 0 0 8px ${playerGlow(cell)}, inset 0 0 20px rgba(${cell === "X" ? "244,63,94" : "56,189,248"}, 0.06)`
      : "none";

  return (
    <button
      onClick={onClick}
      disabled={!canInteract && isEmpty ? false : !canInteract}
      aria-label={ariaLabel}
      className={[
        "flex h-24 w-24 items-center justify-center rounded-xl text-4xl font-extrabold",
        "transition-all duration-200 sm:h-28 sm:w-28",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500",
        canInteract && isEmpty ? "hover:brightness-150" : "",
        !canInteract ? "cursor-default" : "cursor-pointer",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        color: cell ? playerColor(cell) : "transparent",
        background: bgColor,
        border: `2px solid ${borderColor}`,
        boxShadow,
      }}
    >
      {cell}
    </button>
  );
}

function ToggleGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-1 rounded-lg p-1"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  activeStyle: React.CSSProperties;
  children: React.ReactNode;
}

function ToggleButton({ active, onClick, activeStyle, children }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded px-4 py-1.5 text-sm font-bold transition-all duration-200 active:scale-95"
      style={active ? activeStyle : { color: "#64748b" }}
    >
      {children}
    </button>
  );
}

interface ScoreBlockProps {
  label: string;
  value: number;
  color: string;
}

function ScoreBlock({ label, value, color }: ScoreBlockProps) {
  return (
    <div
      className="flex min-w-[88px] flex-col items-center gap-1 px-6 py-3"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <span
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: "#475569" }}
      >
        {label}
      </span>
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
