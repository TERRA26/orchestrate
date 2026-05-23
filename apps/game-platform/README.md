# 🕹️ Arcade — Game Platform

A browser-based mini-arcade built with React 19, Vite 8, and Tailwind CSS v4.  
Four classic games, one dark-neon UI.

---

## Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | React 19, React Router v7, Tailwind CSS v4    |
| Bundler  | Vite 8 (`@tailwindcss/vite` — no config file) |
| Backend  | Bun native HTTP server (`server.ts`)          |
| Runtime  | Bun                                           |
| Tests    | Vitest                                        |

---

## Install

```bash
bun install
```

---

## Dev

```bash
bun run dev
```

This starts **both** servers concurrently:

| Server  | URL                   | Role                                     |
| ------- | --------------------- | ---------------------------------------- |
| Vite    | http://localhost:5173 | React dev server with HMR                |
| API/Bun | http://localhost:3001 | REST API (`/api/games`, static fallback) |

Vite proxies all `/api/*` requests to the Bun server automatically — no CORS config needed.

---

## Build

```bash
bun run build
```

Outputs a production bundle to `dist/`.  
Run `bun run start` to serve the built app on port 3001.

---

## Available Games

| Emoji | Game         | Path                  |
| ----- | ------------ | --------------------- |
| 🐍    | Snake        | `/games/snake`        |
| 🔢    | 2048         | `/games/2048`         |
| ✕     | Tic-Tac-Toe  | `/games/tic-tac-toe`  |
| 🃏    | Memory Match | `/games/memory-match` |

---

## How to Add a New Game

1. **Logic** — Create `src/games/<slug>/logic.ts` with pure functions and a matching `logic.test.ts`.
2. **Component** — Create `src/games/<Name>Game.tsx` using the logic, styled with Tailwind.
3. **Wire up** — Add a `<Route path="/games/<slug>" element={<NameGame />} />` in `src/App.tsx` and add an entry to the `GAMES` array in both `src/pages/Home.tsx` and `server.ts`.
