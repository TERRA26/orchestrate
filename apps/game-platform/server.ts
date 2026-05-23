/**
 * Development / production server for game-platform.
 *
 * In development (`bun run dev`), this runs alongside the Vite dev server on
 * port 3001 and exposes the REST API.  Vite proxies `/api/*` requests here.
 *
 * In production, set PORT to whatever you need and point a reverse-proxy at
 * this process; static assets are served from ./dist with SPA fallback.
 */
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Games catalog (single source of truth — mirrored in src/pages/Home.tsx for
// client-side rendering, but this API is the authoritative list).
// ---------------------------------------------------------------------------

interface GameEntry {
  id: string;
  title: string;
  emoji: string;
  description: string;
  status: "playable" | "coming-soon";
  path: string;
}

const GAMES: GameEntry[] = [
  {
    id: "snake",
    title: "Snake",
    emoji: "🐍",
    description: "Eat, grow, and survive as long as you can.",
    status: "playable",
    path: "/games/snake",
  },
  {
    id: "2048",
    title: "2048",
    emoji: "🔢",
    description: "Slide and merge tiles to reach the legendary 2048.",
    status: "playable",
    path: "/games/2048",
  },
  {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    emoji: "✕",
    description: "Classic 3×3 strategy — first to three wins.",
    status: "playable",
    path: "/games/tic-tac-toe",
  },
  {
    id: "memory-match",
    title: "Memory Match",
    emoji: "🃏",
    description: "Flip cards to find matching pairs.",
    status: "playable",
    path: "/games/memory-match",
  },
];

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const distDir = join(import.meta.dir, "dist");
const port = Number(process.env["PORT"] ?? 3001);

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // ── API routes ──────────────────────────────────────────────────────────

    if (pathname === "/api/games") {
      return Response.json(GAMES);
    }

    // ── Static file serving (production) ───────────────────────────────────

    let filePath = pathname === "/" || pathname === "" ? "/index.html" : pathname;

    const file = Bun.file(join(distDir, filePath));
    const exists = await file.exists();

    if (exists) {
      return new Response(file);
    }

    // SPA fallback: let React Router handle unknown paths
    const indexFile = Bun.file(join(distDir, "index.html"));
    const indexExists = await indexFile.exists();
    if (indexExists) {
      return new Response(indexFile);
    }

    // dist not built yet (dev mode — Vite serves the frontend)
    return new Response("API server running. Start Vite for the frontend.", { status: 200 });
  },
});

console.log(`🕹️  Arcade API running at http://localhost:${port}`);
