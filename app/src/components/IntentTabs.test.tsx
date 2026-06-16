import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntentTabs } from "./IntentTabs.js";

describe("IntentTabs", () => {
  it("renders four tabs and reflects the active intent", () => {
    render(
      <IntentTabs activeIntent="earn-spread" onChange={vi.fn()} />,
    );
    for (const id of [
      "earn-spread",
      "increase-exposure",
      "reduce-risk",
      "exit",
    ] as const) {
      expect(screen.getByTestId(`intent-tab-${id}`)).toBeInTheDocument();
    }
    expect(
      screen.getByTestId("intent-tab-earn-spread").dataset.active,
    ).toBe("true");
  });

  it("calls onChange when a tab is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <IntentTabs activeIntent="earn-spread" onChange={onChange} />,
    );
    await user.click(screen.getByTestId("intent-tab-reduce-risk"));
    expect(onChange).toHaveBeenLastCalledWith("reduce-risk");
  });

  it("hides the advanced/raw link by default", () => {
    render(
      <IntentTabs activeIntent="earn-spread" onChange={vi.fn()} />,
    );
    expect(
      screen.queryByTestId("intent-advanced-link"),
    ).not.toBeInTheDocument();
  });

  it("shows the advanced/raw link when showAdvancedLink is true", () => {
    render(
      <IntentTabs
        activeIntent="earn-spread"
        onChange={vi.fn()}
        showAdvancedLink
      />,
    );
    expect(
      screen.getByTestId("intent-advanced-link"),
    ).toBeInTheDocument();
  });
});
