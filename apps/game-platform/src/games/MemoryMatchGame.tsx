import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkMatch,
  createDeck,
  createInitialState,
  flipCard,
  isWon,
  shuffle,
  type Card,
  type MemoryGameState,
} from "./memory-match/logic.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newGame(): MemoryGameState {
  return createInitialState(shuffle(createDeck()));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CardTileProps {
  card: Card;
  isFlipping: boolean;
  onClick: () => void;
}

function CardTile({ card, isFlipping, onClick }: CardTileProps) {
  const faceUp = card.flipped || card.matched;

  const baseStyle: React.CSSProperties = {
    perspective: "600px",
    cursor: faceUp || isFlipping ? "default" : "pointer",
  };

  const innerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    transition: "transform 0.35s ease",
    transform: faceUp ? "rotateY(180deg)" : "rotateY(0deg)",
  };

  const faceBg = card.matched
    ? "linear-gradient(135deg, #064e3b, #065f46)"
    : "linear-gradient(135deg, #1e1b4b, #312e81)";

  const faceGlow = card.matched ? "rgba(110, 231, 183, 0.5)" : "rgba(167, 139, 250, 0.5)";

  const frontStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    borderRadius: "0.75rem",
    background: "linear-gradient(135deg, #1e293b, #0f172a)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
  };

  const backStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    transform: "rotateY(180deg)",
    borderRadius: "0.75rem",
    background: faceBg,
    border: `1px solid ${faceGlow}`,
    boxShadow: card.matched ? `0 0 18px ${faceGlow}` : "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.75rem",
  };

  return (
    <div
      style={baseStyle}
      className="aspect-square w-full select-none"
      onClick={onClick}
      role="button"
      aria-label={faceUp ? `Card: ${card.symbol}` : "Hidden card"}
      tabIndex={faceUp ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div style={innerStyle}>
        {/* Front (face-down) */}
        <div style={frontStyle}>🂠</div>
        {/* Back (face-up) */}
        <div style={backStyle}>{card.symbol}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MemoryMatchGame() {
  const [state, setState] = useState<MemoryGameState>(newGame);
  /** Index currently being auto-unflipped after a mismatch. */
  const unflipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether we are in the ~800 ms "cooling off" window after a mismatch. */
  const [locked, setLocked] = useState(false);

  // Clean up any pending timer on unmount
  useEffect(() => {
    return () => {
      if (unflipTimer.current !== null) clearTimeout(unflipTimer.current);
    };
  }, []);

  const handleCardClick = useCallback(
    (index: number) => {
      // Block interaction while waiting for a mismatch to unflip
      if (locked) return;

      setState((prev) => {
        // Already 2 face-up: ignore (shouldn't happen while locked, but guard anyway)
        if (prev.flippedIndices.length >= 2) return prev;

        const next = flipCard(prev, index);

        // Second card flipped → evaluate match
        if (next.flippedIndices.length === 2) {
          const evaluated = checkMatch(next);
          const wasMatch = evaluated.cards[next.flippedIndices[0]!]?.matched ?? false;

          if (!wasMatch) {
            // Mismatch: lock the board, show cards briefly, then unflip
            setLocked(true);
            // Keep cards face-up to let the player see them
            // We'll apply checkMatch (which flips back) after the timeout
            const snapshot = next; // cards still face-up
            unflipTimer.current = setTimeout(() => {
              setState(checkMatch(snapshot));
              setLocked(false);
            }, 800);
            return next; // show face-up state immediately
          }

          // Match found — apply immediately
          return evaluated;
        }

        return next;
      });
    },
    [locked],
  );

  const handleReset = useCallback(() => {
    if (unflipTimer.current !== null) {
      clearTimeout(unflipTimer.current);
      unflipTimer.current = null;
    }
    setLocked(false);
    setState(newGame());
  }, []);

  const won = isWon(state);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Title */}
      <div className="text-center">
        <h1
          className="mb-1 text-4xl font-extrabold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Memory Match
        </h1>
        <p className="text-sm" style={{ color: "#64748b" }}>
          Flip cards to find all 8 matching pairs
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4">
        <div
          className="flex flex-col items-center rounded-xl px-6 py-3"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "#64748b" }}
          >
            Moves
          </span>
          <span
            className="text-2xl font-bold tabular-nums"
            style={{
              background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {state.moves}
          </span>
        </div>

        <div
          className="flex flex-col items-center rounded-xl px-6 py-3"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "#64748b" }}
          >
            Pairs
          </span>
          <span
            className="text-2xl font-bold tabular-nums"
            style={{
              background: "linear-gradient(90deg, #6ee7b7, #34d399)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {state.cards.filter((c) => c.matched).length / 2} / 8
          </span>
        </div>

        <button
          onClick={handleReset}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            boxShadow: "0 4px 15px rgba(245, 158, 11, 0.3)",
          }}
        >
          New Game
        </button>
      </div>

      {/* Win banner */}
      {won && (
        <div
          className="rounded-2xl px-8 py-5 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(6,78,59,0.8), rgba(6,95,70,0.8))",
            border: "1px solid rgba(110, 231, 183, 0.4)",
            boxShadow: "0 0 40px rgba(110, 231, 183, 0.15)",
          }}
        >
          <div className="mb-1 text-4xl">🏆</div>
          <p
            className="text-xl font-extrabold"
            style={{
              background: "linear-gradient(90deg, #6ee7b7, #a7f3d0)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            You matched all pairs!
          </p>
          <p className="mt-1 text-sm" style={{ color: "#94a3b8" }}>
            Completed in <span style={{ color: "#fbbf24" }}>{state.moves}</span> moves
          </p>
        </div>
      )}

      {/* 4×4 card grid */}
      <div
        className="grid gap-3 rounded-2xl p-4"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
          width: "min(480px, 92vw)",
          background: "rgba(15,15,25,0.95)",
          boxShadow: "0 0 48px rgba(245,158,11,0.08), 0 0 0 1px rgba(245,158,11,0.14)",
        }}
      >
        {state.cards.map((card, index) => (
          <CardTile
            key={card.id}
            card={card}
            isFlipping={locked}
            onClick={() => handleCardClick(index)}
          />
        ))}
      </div>
    </div>
  );
}
