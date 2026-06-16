import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PolicyEditor } from "./PolicyEditor.js";

describe("PolicyEditor", () => {
  it("defaults to REBALANCE policy class and hides the acknowledged-risks section", () => {
    render(<PolicyEditor onSignPolicy={vi.fn()} />);
    expect(
      screen.getByTestId("policy-class-REBALANCE").dataset.selected,
    ).toBe("true");
    expect(
      screen.queryByTestId("acknowledged-risks-section"),
    ).not.toBeInTheDocument();
  });

  it("reveals the acknowledged-risks section when FORCE_EXIT is selected", async () => {
    const user = userEvent.setup();
    render(<PolicyEditor onSignPolicy={vi.fn()} />);
    await user.click(
      screen.getByTestId("policy-class-FORCE_EXIT").querySelector("input")!,
    );
    expect(
      screen.getByTestId("acknowledged-risks-section"),
    ).toBeInTheDocument();
  });

  it("calls onSignPolicy with the current draft when Sign policy is clicked", async () => {
    const user = userEvent.setup();
    const onSignPolicy = vi.fn();
    render(<PolicyEditor onSignPolicy={onSignPolicy} />);
    await user.click(screen.getByTestId("sign-policy-cta"));
    expect(onSignPolicy).toHaveBeenCalledTimes(1);
    const draft = onSignPolicy.mock.calls[0]![0];
    expect(draft.policyClass).toBe("REBALANCE");
    expect(draft.mevProtectionMode).toBe("PRIVATE_BUILDER");
  });
});
