import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface Game {
  id: string;
  title: string;
  description: string;
  path: string;
  gradient: string;
  glowColor: string;
  emoji: string;
}

const GAMES: Game[] = [
  {
    id: "snake",
    title: "Snake",
    description: "Eat, grow, and survive as long as you can.",
    path: "/games/snake",
    gradient: "linear-gradient(135deg, #10b981, #0d9488)",
    glowColor: "rgba(16, 185, 129, 0.35)",
    emoji: "🐍",
  },
  {
    id: "2048",
    title: "2048",
    description: "Slide and merge tiles to reach the legendary 2048.",
    path: "/games/2048",
    gradient: "linear-gradient(135deg, #a78bfa, #7c3aed)",
    glowColor: "rgba(167, 139, 250, 0.35)",
    emoji: "🔢",
  },
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    description: "Classic 3×3 strategy — first to three wins.",
    path: "/games/tic-tac-toe",
    gradient: "linear-gradient(135deg, #f43f5e, #e11d48)",
    glowColor: "rgba(244, 63, 94, 0.35)",
    emoji: "✕",
  },
  {
    id: "memory-match",
    title: "Memory Match",
    description: "Flip cards to find matching pairs.",
    path: "/games/memory-match",
    gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
    glowColor: "rgba(245, 158, 11, 0.35)",
    emoji: "🃏",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero heading */}
      <div className="mb-12 text-center">
        <h1
          className="mb-3 text-5xl font-extrabold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #a78bfa, #c4b5fd 60%, #e2e8f0)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Pick a Game
        </h1>
        <p className="text-lg" style={{ color: "#94a3b8" }}>
          Four classics, one arcade. Choose your challenge.
        </p>
      </div>

      {/* Game cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl p-px transition-all duration-300"
      style={{
        background: "rgba(255,255,255,0.06)",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.08)`,
      }}
    >
      {/* Gradient border on hover via pseudo-element simulation */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: game.gradient,
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "1px",
        }}
      />

      <div
        className="relative flex flex-1 flex-col rounded-2xl p-6 transition-transform duration-300 group-hover:-translate-y-0.5"
        style={{
          background: "linear-gradient(145deg, #13131f, #0f0f1a)",
          boxShadow: `0 20px 40px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Emoji icon */}
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl text-2xl"
          style={{
            background: "rgba(255,255,255,0.05)",
            boxShadow: `0 0 20px ${game.glowColor}`,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {game.emoji}
        </div>

        {/* Title */}
        <h2
          className="mb-2 text-xl font-bold"
          style={{
            background: game.gradient,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {game.title}
        </h2>

        {/* Description */}
        <p className="mb-6 flex-1 text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
          {game.description}
        </p>

        {/* Play button */}
        <Link
          to={game.path}
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:gap-3 hover:brightness-110 active:scale-95"
          style={{
            background: game.gradient,
            boxShadow: `0 4px 15px ${game.glowColor}`,
          }}
        >
          Play
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
