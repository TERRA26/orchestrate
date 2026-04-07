import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PREFERRED_PORT = 3333;
const htmlPath = join(__dirname, "index.html");

let html;
try {
  html = fs.readFileSync(htmlPath, "utf-8");
} catch (err) {
  console.error(`Failed to read ${htmlPath}:`, err.message);
  process.exit(1);
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // Preferred port taken — let the OS assign one
    server.listen(0, "127.0.0.1");
  } else {
    console.error("Server error:", err.message);
    process.exit(1);
  }
});

server.on("listening", () => {
  const { port } = server.address();
  console.log(`http://localhost:${port}`);
});

server.listen(PREFERRED_PORT, "127.0.0.1");
