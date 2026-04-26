import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: "dist",
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
