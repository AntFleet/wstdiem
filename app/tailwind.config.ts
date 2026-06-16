import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Theme tokens — values resolved at runtime via CSS variables in globals.css.
        // This indirection lets light/dark swap cleanly with `data-theme` toggle (G.2).
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--color-surface-raised) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        "text-muted": "rgb(var(--color-text-muted) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        // Risk colors — HF gauge thresholds (synthesis A.1).
        // Red ≤ 1.05, amber ≤ 1.15, green > 1.15.
        risk: {
          green: "rgb(var(--color-risk-green) / <alpha-value>)",
          amber: "rgb(var(--color-risk-amber) / <alpha-value>)",
          red: "rgb(var(--color-risk-red) / <alpha-value>)",
        },
        // Force-exit warning chrome — high-contrast for §6.3 phishing-resistance.
        warning: {
          border: "rgb(var(--color-warning-border) / <alpha-value>)",
          surface: "rgb(var(--color-warning-surface) / <alpha-value>)",
          text: "rgb(var(--color-warning-text) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      // ≥3-second dwell countdown animation (§6.3, used by ForceExitConfirmPanel).
      animation: {
        "dwell-countdown": "dwell-progress 3s linear forwards",
      },
      keyframes: {
        "dwell-progress": {
          "0%": { width: "0%" },
          "100%": { width: "100%" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
