import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  GATE_REGISTRY,
  GPmGateChecklist,
  allGatesClear,
} from "./GPmGateChecklist.js";

describe("GATE_REGISTRY", () => {
  it("has the six post-matrix gates G-PM-1..6", () => {
    expect(GATE_REGISTRY).toHaveLength(6);
    const ids = GATE_REGISTRY.map((g) => g.id);
    expect(ids).toContain("G_PM_1_HARVEST_CONVERGENCE");
    expect(ids).toContain("G_PM_2_INDEXER_ANCHOR_STALE");
    expect(ids).toContain("G_PM_3_RPC_QUORUM_NOT_INDEPENDENT");
    expect(ids).toContain("G_PM_4_EIP1271_PREIMAGE");
    expect(ids).toContain("G_PM_5_MEV_WAIVER");
    expect(ids).toContain("G_PM_6_AUTOMATION_THROTTLE");
  });
});

describe("allGatesClear", () => {
  it("returns false when gates are undefined", () => {
    expect(allGatesClear(undefined)).toBe(false);
  });

  it("returns false when any gate is fail", () => {
    expect(
      allGatesClear([
        { gate: "G_PM_1_HARVEST_CONVERGENCE", status: "pass" },
        { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "fail" },
        { gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT", status: "pass" },
        { gate: "G_PM_4_EIP1271_PREIMAGE", status: "notApplicable" },
        { gate: "G_PM_5_MEV_WAIVER", status: "pass" },
        { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "notApplicable" },
      ]),
    ).toBe(false);
  });

  it("returns true when every gate is pass or notApplicable", () => {
    expect(
      allGatesClear([
        { gate: "G_PM_1_HARVEST_CONVERGENCE", status: "pass" },
        { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "pass" },
        { gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT", status: "pass" },
        { gate: "G_PM_4_EIP1271_PREIMAGE", status: "notApplicable" },
        { gate: "G_PM_5_MEV_WAIVER", status: "pass" },
        { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "notApplicable" },
      ]),
    ).toBe(true);
  });
});

describe("GPmGateChecklist", () => {
  it("renders one row per gate with status unknown when no gates provided (M-2: fail-closed but distinguishes 'pending' from 'failed')", () => {
    render(<GPmGateChecklist gates={undefined} />);
    for (const g of GATE_REGISTRY) {
      const row = screen.getByTestId(`gpm-gate-row-${g.id}`);
      expect(row.dataset.status).toBe("unknown");
    }
  });

  it("renders the unknown legend entry alongside fail/pass/notApplicable", () => {
    render(<GPmGateChecklist gates={undefined} />);
    expect(
      screen.getByTestId("gpm-gate-legend-unknown"),
    ).toBeInTheDocument();
  });

  it("renders the provided status per row", () => {
    render(
      <GPmGateChecklist
        gates={[
          { gate: "G_PM_1_HARVEST_CONVERGENCE", status: "pass" },
          { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "fail" },
          { gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT", status: "pass" },
          { gate: "G_PM_4_EIP1271_PREIMAGE", status: "notApplicable" },
          { gate: "G_PM_5_MEV_WAIVER", status: "pass" },
          { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "notApplicable" },
        ]}
      />,
    );
    expect(
      screen.getByTestId("gpm-gate-row-G_PM_2_INDEXER_ANCHOR_STALE")
        .dataset.status,
    ).toBe("fail");
    expect(
      screen.getByTestId("gpm-gate-row-G_PM_4_EIP1271_PREIMAGE").dataset.status,
    ).toBe("notApplicable");
  });
});
