import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateBitGrid } from "./StateBitGrid.js";
import { StateBit } from "@wstdiem/sdk";

describe("StateBitGrid", () => {
  it("renders all 16 cells including reserved slots", () => {
    render(<StateBitGrid bitmap={0} />);
    for (let i = 0; i < 16; i++) {
      expect(
        screen.getByTestId(`state-bit-cell-${i}`),
      ).toBeInTheDocument();
    }
  });

  it("marks reserved cells with reserved state", () => {
    render(<StateBitGrid bitmap={0} />);
    expect(screen.getByTestId("state-bit-cell-11").dataset.state).toBe(
      "reserved",
    );
    expect(screen.getByTestId("state-bit-cell-15").dataset.state).toBe(
      "reserved",
    );
  });

  it("marks the audit-gate cell as set when bit 0 is on", () => {
    render(<StateBitGrid bitmap={StateBit.AUDIT_GATE_CLOSED} />);
    const cell = screen.getByTestId("state-bit-cell-0");
    expect(cell.dataset.state).toBe("set");
    expect(cell.dataset.bitName).toBe("AUDIT_GATE_CLOSED");
  });

  it("marks named cells as unset when bitmap=0", () => {
    render(<StateBitGrid bitmap={0} />);
    expect(screen.getByTestId("state-bit-cell-0").dataset.state).toBe(
      "unset",
    );
    expect(screen.getByTestId("state-bit-cell-10").dataset.state).toBe(
      "unset",
    );
  });

  it("renders the unknown state when bitmap is undefined", () => {
    render(<StateBitGrid bitmap={undefined} />);
    expect(screen.getByTestId("state-bit-cell-0").dataset.state).toBe(
      "unknown",
    );
  });

  it("renders multi-bit bitmaps correctly", () => {
    const bm =
      StateBit.AUDIT_GATE_CLOSED |
      StateBit.SEQUENCER_DOWN_OR_GRACE |
      StateBit.VAULT_EVIDENCE_MISSING;
    render(<StateBitGrid bitmap={bm} />);
    expect(screen.getByTestId("state-bit-cell-0").dataset.state).toBe("set");
    expect(screen.getByTestId("state-bit-cell-7").dataset.state).toBe("set");
    expect(screen.getByTestId("state-bit-cell-10").dataset.state).toBe(
      "set",
    );
    expect(screen.getByTestId("state-bit-cell-3").dataset.state).toBe(
      "unset",
    );
  });
});

// m-do-8 closure: per-bit individual fixtures. Iterate over every named
// StateBit, render a bitmap with ONLY that bit set, and assert the
// corresponding grid cell is `set` while every other named cell is `unset`.
const NAMED_STATE_BITS = [
  { index: 0, name: "AUDIT_GATE_CLOSED", mask: StateBit.AUDIT_GATE_CLOSED },
  { index: 1, name: "CONFIG_INTEGRITY_FAILURE", mask: StateBit.CONFIG_INTEGRITY_FAILURE },
  { index: 2, name: "PAUSE_OPEN_INCREASE", mask: StateBit.PAUSE_OPEN_INCREASE },
  { index: 3, name: "ORACLE_DEGRADED", mask: StateBit.ORACLE_DEGRADED },
  { index: 4, name: "CURVE_LIQUIDITY_INSUFFICIENT", mask: StateBit.CURVE_LIQUIDITY_INSUFFICIENT },
  { index: 5, name: "FLASH_LIQUIDITY_UNAVAILABLE", mask: StateBit.FLASH_LIQUIDITY_UNAVAILABLE },
  { index: 6, name: "MORPHO_OWNER_EVIDENCE_MISSING", mask: StateBit.MORPHO_OWNER_EVIDENCE_MISSING },
  { index: 7, name: "SEQUENCER_DOWN_OR_GRACE", mask: StateBit.SEQUENCER_DOWN_OR_GRACE },
  { index: 8, name: "INCIDENT_INVESTIGATING", mask: StateBit.INCIDENT_INVESTIGATING },
  { index: 9, name: "INCIDENT_MITIGATING", mask: StateBit.INCIDENT_MITIGATING },
  { index: 10, name: "VAULT_EVIDENCE_MISSING", mask: StateBit.VAULT_EVIDENCE_MISSING },
] as const;

describe.each(NAMED_STATE_BITS)(
  "StateBitGrid per-bit fixture",
  ({ index, name, mask }) => {
    it(`renders only bit ${index} (${name}) as set when bitmap=${name}`, () => {
      render(<StateBitGrid bitmap={mask} />);
      // The target cell is set.
      expect(screen.getByTestId(`state-bit-cell-${index}`).dataset.state).toBe(
        "set",
      );
      expect(screen.getByTestId(`state-bit-cell-${index}`).dataset.bitName).toBe(
        name,
      );
      // Every other named cell is unset.
      for (const other of NAMED_STATE_BITS) {
        if (other.index === index) continue;
        expect(
          screen.getByTestId(`state-bit-cell-${other.index}`).dataset.state,
        ).toBe("unset");
      }
      // Reserved cells stay reserved.
      for (let i = 11; i < 16; i++) {
        expect(screen.getByTestId(`state-bit-cell-${i}`).dataset.state).toBe(
          "reserved",
        );
      }
    });
  },
);
