import type { Config } from "tailwindcss";

const uewNavy = {
  50: "#f2f3fc",
  100: "#e5e7f8",
  200: "#cfd2f1",
  300: "#aeb3e6",
  400: "#858bd7",
  500: "#555bb5",
  600: "#292b7c",
  700: "#23256c",
  800: "#1c1e5b",
  900: "#17194c",
  950: "#0f1030",
};

const config: Config = {
  // ─── Dark mode ────────────────────────────────────────────────────────────
  //
  // "class" strategy: dark mode is enabled by toggling the "dark" class
  // on <html>. The AppShell component manages this via localStorage.
  darkMode: "class",

  // ─── Content ──────────────────────────────────────────────────────────────
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        indigo: uewNavy,
        blue: uewNavy,
        sky: uewNavy,
        violet: uewNavy,
      },
      // ─── Animations ───────────────────────────────────────────────────────
      keyframes: {
        "slide-in": {
          "0%":   { opacity: "0", transform: "translateX(1rem)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-out": {
          "0%":   { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(1rem)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "slide-in":  "slide-in 0.2s ease-out",
        "slide-out": "slide-out 0.15s ease-in",
        "fade-in":   "fade-in 0.15s ease-out",
      },
    },
  },

  plugins: [],
};

export default config;
