# demo-fullstack

A minimal full-stack demo: an Express todos API (backend) paired with a dark arcade-themed React UI (frontend), wired together with Vite's dev proxy.

## What it is

- **Backend** — Express + TypeScript, in-memory todo store, no database or auth.
- **Frontend** — React + Vite + Tailwind, dark arcade aesthetic (neon-on-black palette, pixel-style accents).
- **Monorepo workspace** — lives under `apps/demo-fullstack` in the Orchestrate turborepo.

## Install

Dependencies are declared in `apps/demo-fullstack/package.json` and resolved by the workspace root:

```bash
bun install
```

## Run (dev)

```bash
bun run --cwd apps/demo-fullstack dev
```

Starts both processes concurrently:

- **server** on `http://localhost:4000` (tsx watch)
- **web** on `http://localhost:5175` (Vite dev server, proxies `/api` to the server)

## Test

```bash
bun run --cwd apps/demo-fullstack test
```

## Type-check

```bash
bun run --cwd apps/demo-fullstack typecheck
```

## API Endpoints

| Method   | Path             | Body               | Response                             |
| -------- | ---------------- | ------------------ | ------------------------------------ |
| `POST`   | `/api/todos`     | `{ text: string }` | `201 Todo` or `400` if text is empty |
| `GET`    | `/api/todos`     | —                  | `200 Todo[]` (insertion order)       |
| `DELETE` | `/api/todos/:id` | —                  | `204` on success, `404` if not found |

**Todo shape:**

```ts
{
  id: string;
  text: string;
  done: boolean;
}
```
