/**
 * Pinball Game – Static file server (Bun)
 *
 * Usage:
 *   bun run pinball/server.ts            # default port 3737
 *   PORT=8080 bun run pinball/server.ts  # custom port
 */

import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 3737;
const DIR = dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === "/") pathname = "/index.html";

    const filePath = resolve(DIR, `.${pathname}`);

    // Prevent directory traversal
    if (!filePath.startsWith(DIR)) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";

    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  },
});

console.log(`\n  🎯 Neon Pinball server running at:\n\n     http://localhost:${PORT}\n`);
