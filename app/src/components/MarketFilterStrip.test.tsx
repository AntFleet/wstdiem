import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MarketFilterStrip,
  DEFAULT_FILTERS,
} from "./MarketFilterStrip.js";

describe("MarketFilterStrip", () => {
  it("starts with audit-gate filter enabled by default (DEFAULT_FILTERS)", () => {
    render(
      <MarketFilterStrip filters={DEFAULT_FILTERS} onChange={vi.fn()} />,
    );
    const audit = screen.getByTestId("filter-audit-gate-only-open");
    expect(audit.dataset.checked).toBe("true");
    const state = screen.getByTestId("filter-state-only-clear");
    expect(state.dataset.checked).toBe("false");
    const automation = screen.getByTestId("filter-automation-only");
    expect(automation.dataset.checked).toBe("false");
  });

  it("emits the new filter shape when audit toggle flipped off", () => {
    const onChange = vi.fn();
    render(
      <MarketFilterStrip filters={DEFAULT_FILTERS} onChange={onChange} />,
    );
    const audit = screen.getByTestId("filter-audit-gate-only-open");
    const input = audit.querySelector("input");
    expect(input).not.toBeNull();
    fireEvent.click(input as HTMLInputElement);
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      auditGateOnlyOpen: false,
    });
  });

  it("emits the new filter shape when state toggle flipped on", () => {
    const onChange = vi.fn();
    render(
      <MarketFilterStrip filters={DEFAULT_FILTERS} onChange={onChange} />,
    );
    const state = screen.getByTestId("filter-state-only-clear");
    const input = state.querySelector("input");
    fireEvent.click(input as HTMLInputElement);
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      stateOnlyClear: true,
    });
  });

  it("emits the new filter shape when automation toggle flipped on", () => {
    const onChange = vi.fn();
    render(
      <MarketFilterStrip filters={DEFAULT_FILTERS} onChange={onChange} />,
    );
    const automation = screen.getByTestId("filter-automation-only");
    const input = automation.querySelector("input");
    fireEvent.click(input as HTMLInputElement);
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      automationOnly: true,
    });
  });

  it("Show-all-including-closed button clears every filter at once", () => {
    const onChange = vi.fn();
    render(
      <MarketFilterStrip
        filters={{
          auditGateOnlyOpen: true,
          stateOnlyClear: true,
          automationOnly: true,
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("filter-show-all"));
    expect(onChange).toHaveBeenCalledWith({
      auditGateOnlyOpen: false,
      stateOnlyClear: false,
      automationOnly: false,
    });
  });
});
