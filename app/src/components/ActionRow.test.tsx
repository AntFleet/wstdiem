import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionRow } from "./ActionRow.js";
import type { ReadinessResult } from "@wstdiem/sdk";

function buildReadiness(
  perAction: Partial<ReadinessResult["perAction"]>,
): ReadinessResult {
  return {
    market:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as never,
    blockNumber: 100n as never,
    stateBitmap: 0 as never,
    perAction: {
      Open: { decision: "allowed", predicates: [], errors: [] },
      Rebalance: { decision: "allowed", predicates: [], errors: [] },
      Exit: { decision: "allowed", predicates: [], errors: [] },
      ForceExit: { decision: "allowed", predicates: [], errors: [] },
      AutomationExec: { decision: "allowed", predicates: [], errors: [] },
      Revoke: { decision: "allowed", predicates: [], errors: [] },
      ...perAction,
    } as ReadinessResult["perAction"],
    sources: [],
    sequencer: "up",
    indexerAnchor: {
      lastAnchoredBlock: 0n as never,
      anchorMaxStaleBlocks: 100,
      anchorEmergencyMultiplier: 3,
      status: "fresh",
    },
    rpcQuorum: {
      threshold: 2,
      size: 3,
      providerFamilies: ["alchemy", "infura", "publicrpc"],
      matchedFamilies: ["alchemy", "infura", "publicrpc"],
      maxRpcBlockLagBlocks: 5,
      quorumTimeoutMs: 5000,
      status: "ok",
    },
  };
}

describe("ActionRow", () => {
  it("renders six action buttons", () => {
    render(
      <ActionRow
        readiness={buildReadiness({})}
        onClick={vi.fn()}
      />,
    );
    for (const id of [
      "add-collateral",
      "repay",
      "rebalance-down",
      "exit",
      "force-exit",
      "revoke",
    ] as const) {
      expect(
        screen.getByTestId(`action-button-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("disables blocked actions and surfaces every matched P-predicate and error (AND-over-rows)", () => {
    const readiness = buildReadiness({
      Exit: {
        decision: "blocked",
        predicates: ["sequencer=down", "curve=low-liquidity"],
        errors: ["SequencerDown", "CurveLiquidityInsufficient"],
      },
    });
    render(<ActionRow readiness={readiness} onClick={vi.fn()} />);
    const exitButton = screen.getByTestId("action-button-exit");
    expect(exitButton).toBeDisabled();
    const reasons = screen.getByTestId("action-blocked-reasons-exit");
    expect(reasons).toHaveTextContent("P-predicate: sequencer=down");
    expect(reasons).toHaveTextContent("P-predicate: curve=low-liquidity");
    expect(reasons).toHaveTextContent("error: SequencerDown");
    expect(reasons).toHaveTextContent("error: CurveLiquidityInsufficient");
  });

  it("keeps Revoke enabled even when readiness is undefined (§7.1 last column)", () => {
    render(<ActionRow readiness={undefined} onClick={vi.fn()} />);
    expect(screen.getByTestId("action-button-revoke")).not.toBeDisabled();
    expect(screen.getByTestId("action-button-add-collateral")).toBeDisabled();
  });

  it("flags Force-Exit with warning chrome", () => {
    render(
      <ActionRow readiness={buildReadiness({})} onClick={vi.fn()} />,
    );
    const forceExit = screen.getByTestId("action-force-exit");
    expect(forceExit.dataset.warning).toBe("true");
  });
});
