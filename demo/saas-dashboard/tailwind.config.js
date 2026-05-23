/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0A0A0F",
        surface: "#111118",
        panel: "#18181F",
        border: "#252530",
        "border-light": "#2E2E3A",
        "ink-primary": "#F2EDE3",
        "ink-secondary": "#9B97A8",
        "ink-muted": "#5C5870",
        amber: "#E8A020",
        "amber-dim": "#C4861A",
        "amber-glow": "#F0B840",
        "green-pos": "#22C55E",
        "green-dim": "#16A34A",
        "red-neg": "#EF4444",
        "red-dim": "#DC2626",
        "yellow-warn": "#EAB308",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        mono: ['"DM Mono"', '"Fira Mono"', "monospace"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
