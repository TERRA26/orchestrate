import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Epilogue", "system-ui", "sans-serif"],
        sans: ["Epilogue", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
