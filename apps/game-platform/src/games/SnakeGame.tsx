import { type ReactNode, useEffect, useRef } from "react";
import { CELL_PX, GRID_COLS, GRID_ROWS } from "./snake/logic";
import { useSnakeGame } from "./snake/useSnakeGame";
import type { GameState } from "./snake/types";

// ---------------------------------------------------------------------------
// Canvas dimensions
// ---------------------------------------------------------------------------

const CANVAS_W = GRID_COLS * CELL_PX;
const CANVAS_H = GRID_ROWS * CELL_PX;

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

/** Draw a filled rounded rectangle without relying on ctx.roundRect (compat). */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawFrame(ctx: CanvasRenderingContext2D, state: GameState) {
  // Background
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle grid
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 0.5;
  for (let col = 0; col <= GRID_COLS; col++) {
    ctx.beginPath();
    ctx.moveTo(col * CELL_PX, 0);
    ctx.lineTo(col * CELL_PX, CANVAS_H);
    ctx.stroke();
  }
  for (let row = 0; row <= GRID_ROWS; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * CELL_PX);
    ctx.lineTo(CANVAS_W, row * CELL_PX);
    ctx.stroke();
  }

  // Food — glowing rose orb
  {
    const fx = state.food.x * CELL_PX + CELL_PX / 2;
    const fy = state.food.y * CELL_PX + CELL_PX / 2;
    ctx.save();
    ctx.shadowColor = "#f43f5e";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#f43f5e";
    ctx.beginPath();
    ctx.arc(fx, fy, CELL_PX / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Snake — neon green segments with head glow
  const snakeLen = state.snake.length;
  for (let i = snakeLen - 1; i >= 0; i--) {
    const p = state.snake[i]!;
    const isHead = i === 0;
    const pad = isHead ? 1 : 2;

    ctx.save();
    if (isHead) {
      ctx.shadowColor = "#10b981";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "#10b981";
    } else {
      // Gently fade body toward the tail
      const fade = Math.max(0.35, 1 - (i / snakeLen) * 0.55);
      ctx.fillStyle = `rgba(16, 185, 129, ${fade})`;
    }
    fillRoundRect(
      ctx,
      p.x * CELL_PX + pad,
      p.y * CELL_PX + pad,
      CELL_PX - pad * 2,
      CELL_PX - pad * 2,
      4,
    );
    ctx.restore();
  }
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

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4"
      style={{
        background: "rgba(10, 10, 15, 0.88)",
        backdropFilter: "blur(4px)",
      }}
    >
      {children}
    </div>
  );
}

function NeonButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-8 py-3 text-base font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
      style={{
        background: "linear-gradient(135deg, #10b981, #0d9488)",
        boxShadow: "0 4px 20px rgba(16, 185, 129, 0.45)",
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, bestScore, start, restart } = useSnakeGame();

  // Draw every time state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, state);
  }, [state]);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Page header */}
      <div className="text-center">
        <h1
          className="mb-1 text-4xl font-extrabold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #10b981, #34d399)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Snake
        </h1>
        <p className="text-sm" style={{ color: "#64748b" }}>
          Arrow keys / WASD to move &middot; Space to pause
        </p>
      </div>

      {/* Score strip */}
      <div className="flex gap-4">
        <ScoreBox label="Score" value={state.score} glowHex="#10b981" />
        <ScoreBox label="Best" value={bestScore} glowHex="#a78bfa" />
      </div>

      {/* Game canvas + overlays */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          boxShadow: "0 0 48px rgba(16, 185, 129, 0.12), 0 0 0 1px rgba(16, 185, 129, 0.18)",
        }}
      >
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="block" />

        {/* Idle overlay — shown before the first game */}
        {state.status === "idle" && (
          <Overlay>
            <span className="text-5xl">🐍</span>
            <h2
              className="text-3xl font-extrabold"
              style={{
                background: "linear-gradient(90deg, #10b981, #34d399)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Snake
            </h2>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              Eat, grow, and survive.
            </p>
            <NeonButton onClick={start}>Start Game</NeonButton>
          </Overlay>
        )}

        {/* Pause overlay */}
        {state.status === "paused" && (
          <Overlay>
            <span className="text-5xl">⏸</span>
            <h2
              className="text-2xl font-extrabold"
              style={{
                background: "linear-gradient(90deg, #10b981, #34d399)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Paused
            </h2>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              Press Space to resume
            </p>
          </Overlay>
        )}

        {/* Game-over overlay */}
        {state.status === "over" && (
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
              Score: <span style={{ color: "#10b981" }}>{state.score}</span>
            </p>
            <NeonButton onClick={restart}>Play Again</NeonButton>
          </Overlay>
        )}
      </div>
    </div>
  );
}
