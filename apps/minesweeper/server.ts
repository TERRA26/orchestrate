import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

Bun.serve({
  port: 3333,
  fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const ext = pathname.slice(pathname.lastIndexOf("."));
    const contentType = mimeTypes[ext];

    if (!contentType) {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const filePath = join(dir, pathname.slice(1));
      const content = readFileSync(filePath);
      return new Response(content, {
        headers: { "Content-Type": contentType },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  },
});

console.log("Minesweeper running at http://localhost:3333");
