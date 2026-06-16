import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  evaluateChecklist,
  PerBitChecklist,
  type BitDescriptor,
} from "./PerBitChecklist.js";

const REGISTRY: readonly BitDescriptor[] = [
  { mask: 1 << 0, name: "BIT_A", plainLanguage: "First bit" },
  { mask: 1 << 1, name: "BIT_B", plainLanguage: "Second bit" },
  { mask: 1 << 2, name: "BIT_C", plainLanguage: "Third bit" },
];

describe("evaluateChecklist", () => {
  it("returns allChecked=false when no bits are set", () => {
    const r = evaluateChecklist(REGISTRY, 0, 0);
    expect(r.allChecked).toBe(false);
    expect(r.setBitDescriptors).toHaveLength(0);
  });

  it("returns allChecked=false when not every set bit is checked", () => {
    const r = evaluateChecklist(REGISTRY, 0b011, 0b001);
    expect(r.allChecked).toBe(false);
  });

  it("returns allChecked=true when every set bit is checked", () => {
    const r = evaluateChecklist(REGISTRY, 0b101, 0b101);
    expect(r.allChecked).toBe(true);
    expect(r.setBitDescriptors.map((b) => b.name)).toEqual([
      "BIT_A",
      "BIT_C",
    ]);
  });

  it("ignores extra checked bits not in the bitmap", () => {
    const r = evaluateChecklist(REGISTRY, 0b001, 0b111);
    expect(r.allChecked).toBe(true);
  });
});

describe("PerBitChecklist component", () => {
  it("renders empty state when no bits are set", () => {
    const onChange = vi.fn();
    render(
      <PerBitChecklist
        registry={REGISTRY}
        bitmap={0}
        checked={0}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByTestId("per-bit-checklist-empty"),
    ).toBeInTheDocument();
  });

  it("renders one row per set bit and reflects checked state via data attrs", () => {
    const onChange = vi.fn();
    render(
      <PerBitChecklist
        registry={REGISTRY}
        bitmap={0b011}
        checked={0b010}
        onChange={onChange}
      />,
    );
    const list = screen.getByTestId("per-bit-checklist");
    expect(list.dataset.bitsSet).toBe("2");
    expect(list.dataset.bitsChecked).toBe("1");
    expect(screen.getByTestId("per-bit-checklist-row-BIT_A").dataset.checked).toBe(
      "false",
    );
    expect(screen.getByTestId("per-bit-checklist-row-BIT_B").dataset.checked).toBe(
      "true",
    );
  });

  it("toggles bits via the checkbox click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PerBitChecklist
        registry={REGISTRY}
        bitmap={0b111}
        checked={0}
        onChange={onChange}
      />,
    );
    const row = screen.getByTestId("per-bit-checklist-row-BIT_B");
    await user.click(row.querySelector("input")!);
    expect(onChange).toHaveBeenLastCalledWith(0b010);
  });
});
