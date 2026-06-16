// ThemeToggle — dark <-> light via data-theme attribute. Synthesis G.2.

import { useTheme } from "../hooks/useTheme.js";

export function ThemeToggle(): JSX.Element {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted hover:text-text hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      data-testid="theme-toggle"
    >
      <span aria-hidden="true">{isDark ? "☾" : "☀"}</span>
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
