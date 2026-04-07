import { readFileSync, existsSync } from "fs";
import { createServer } from "http";
import { join, extname } from "path";

const PORT = parseInt(process.env.PORT || "3333", 10);
const DIR = import.meta.dirname ?? __dirname;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;

  // Prevent directory traversal
  const safePath = join(DIR, pathname.replace(/\.\./g, ""));

  if (!existsSync(safePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
    return;
  }

  const ext = extname(safePath);
  const contentType = MIME[ext] || "application/octet-stream";

  try {
    const data = readFileSync(safePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("500 Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`🕹️  Pinball game server running at http://localhost:${PORT}`);
});
