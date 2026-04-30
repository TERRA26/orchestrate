import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(__dirname, "index.html"), path.join(__dirname, "src/**/*.{ts,tsx}")],
  theme: {
    extend: {
      colors: {
        saas: {
          bg: "#f6f8fb",
          border: "#dbe3ef",
          ink: "#172033",
          muted: "#64748b",
          blue: "#2563eb",
          emerald: "#059669",
          amber: "#d97706",
          rose: "#e11d48",
        },
      },
      fontFamily: {
        arcade: ['"Press Start 2P"', "monospace"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      keyframes: {
        flicker: {
          "0%, 89%, 91%, 93%, 100%": { opacity: "1" },
          "90%": { opacity: "0.75" },
          "92%": { opacity: "0.9" },
          "94%": { opacity: "0.82" },
        },
        "pulse-glow-magenta": {
          "0%, 100%": {
            boxShadow: "0 0 8px rgba(255,45,120,0.25), 0 0 16px rgba(255,45,120,0.1)",
          },
          "50%": {
            boxShadow:
              "0 0 18px rgba(255,45,120,0.55), 0 0 36px rgba(255,45,120,0.25), 0 0 60px rgba(255,45,120,0.1)",
          },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        scan: {
          "0%": { top: "-2px" },
          "100%": { top: "100vh" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "glitch-in": {
          "0%": { opacity: "0", transform: "skewX(-10deg) translateX(-6px)" },
          "60%": { opacity: "1", transform: "skewX(2deg) translateX(2px)" },
          "100%": { opacity: "1", transform: "skewX(0) translateX(0)" },
        },
      },
      animation: {
        flicker: "flicker 12s ease-in-out infinite",
        "pulse-glow": "pulse-glow-magenta 2s ease-in-out infinite",
        "slide-in": "slide-in 0.25s ease-out forwards",
        scan: "scan 7s linear infinite",
        blink: "blink 1s step-end infinite",
        "glitch-in": "glitch-in 0.35s ease-out forwards",
      },
    },
  },
  plugins: [],
};
