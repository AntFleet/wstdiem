import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MevModeSelector } from "./MevModeSelector.js";
import { MevWaiverBit } from "@wstdiem/sdk";

describe("MevModeSelector", () => {
  it("defaults to PRIVATE_BUILDER and hides the waiver section", () => {
    render(
      <MevModeSelector
        mode="PRIVATE_BUILDER"
        onModeChange={vi.fn()}
        waiverBits={0}
        onWaiverChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mev-mode-selector").dataset.mode).toBe(
      "PRIVATE_BUILDER",
    );
    expect(screen.getByTestId("mev-mode-selector").dataset.waiversOk).toBe(
      "true",
    );
    expect(
      screen.queryByTestId("mev-waiver-section"),
    ).not.toBeInTheDocument();
  });

  it("reveals the waiver section when mode requires waiver bits", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const { rerender } = render(
      <MevModeSelector
        mode="PRIVATE_BUILDER"
        onModeChange={(next) => {
          onModeChange(next);
          rerender(
            <MevModeSelector
              mode={next}
              onModeChange={onModeChange}
              waiverBits={0}
              onWaiverChange={vi.fn()}
            />,
          );
        }}
        waiverBits={0}
        onWaiverChange={vi.fn()}
      />,
    );
    await user.click(
      screen.getByTestId("mev-mode-option-PUBLIC").querySelector("input")!,
    );
    expect(
      screen.getByTestId("mev-waiver-section"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mev-mode-selector").dataset.waiversOk).toBe(
      "false",
    );
    expect(
      screen.getByTestId("mev-waiver-blocked"),
    ).toBeInTheDocument();
  });

  it("clears the blocked indicator when the required waiver is checked", () => {
    render(
      <MevModeSelector
        mode="PUBLIC"
        onModeChange={vi.fn()}
        waiverBits={MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN}
        onWaiverChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mev-mode-selector").dataset.waiversOk).toBe(
      "true",
    );
    expect(
      screen.queryByTestId("mev-waiver-blocked"),
    ).not.toBeInTheDocument();
  });
});
