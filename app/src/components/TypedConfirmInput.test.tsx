import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TypedConfirmInput } from "./TypedConfirmInput.js";

describe("TypedConfirmInput", () => {
  it("renders unmatched until the value equals the expected token", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    let value = "";
    const { rerender } = render(
      <TypedConfirmInput
        expected="FORCE-EXIT"
        value={value}
        onChange={(next) => {
          value = next;
          onChange(next);
        }}
      />,
    );
    expect(screen.getByTestId("typed-confirm-input").dataset.matched).toBe(
      "false",
    );
    const input = screen.getByPlaceholderText("FORCE-EXIT");
    await user.type(input, "FORCE-EXIT");
    expect(onChange).toHaveBeenCalledTimes("FORCE-EXIT".length);
    rerender(
      <TypedConfirmInput
        expected="FORCE-EXIT"
        value="FORCE-EXIT"
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("typed-confirm-input").dataset.matched).toBe(
      "true",
    );
  });

  it("does not match on trailing whitespace or lowercase", () => {
    const onChange = vi.fn();
    render(
      <TypedConfirmInput
        expected="FORCE-EXIT"
        value="force-exit"
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("typed-confirm-input").dataset.matched).toBe(
      "false",
    );
  });

  it("freezes input when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TypedConfirmInput
        expected="FORCE-EXIT"
        value=""
        onChange={onChange}
        disabled
      />,
    );
    const input = screen.getByPlaceholderText("FORCE-EXIT");
    await user.type(input, "F");
    expect(onChange).not.toHaveBeenCalled();
  });
});
