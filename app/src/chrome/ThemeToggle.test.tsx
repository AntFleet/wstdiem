import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle.js";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark per synthesis G.2", async () => {
    render(<ThemeToggle />);
    // useEffect synchronously applies in jsdom via React 18 batching
    await act(async () => {});
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByTestId("theme-toggle")).toHaveTextContent(/dark/i);
  });

  it("toggles to light and persists the selection", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByTestId("theme-toggle"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("wstdiem.theme")).toBe("light");
    expect(screen.getByTestId("theme-toggle")).toHaveTextContent(/light/i);
  });

  it("respects a previously-persisted selection", async () => {
    window.localStorage.setItem("wstdiem.theme", "light");
    render(<ThemeToggle />);
    await act(async () => {});
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
