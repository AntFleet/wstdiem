import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewDrawer } from "./PreviewDrawer.js";
import type { TransactionPreview } from "@wstdiem/sdk";

function buildPreview(
  overrides: Partial<TransactionPreview> = {},
): TransactionPreview {
  return {
    action: {
      primaryType: "Open",
      owner: "0x1111111111111111111111111111111111111111",
      chainId: 8453 as never,
      verifyingContract: "0x2222222222222222222222222222222222222222",
      executor: "0x3333333333333333333333333333333333333333",
      market:
        "0x4444444444444444444444444444444444444444444444444444444444444444" as never,
      registryVersion: 1n as never,
      registryMerkleRoot:
        "0x5555555555555555555555555555555555555555555555555555555555555555" as never,
      policyId: 1n as never,
      nonceSlot: 0n,
      nonceBit: 0,
      executionKind: "OWNER_DIRECT",
      deadline: 9_999_999_999n as never,
      quoteBlockNumber: 100n as never,
      maxQuoteAgeBlocks: 100,
      maxQuoteDeviationBps: 100 as never,
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
      evidenceBundleHash:
        "0x6666666666666666666666666666666666666666666666666666666666666666" as never,
      bounds: {
        minWstDiemReceived: 0n,
        minBorrowedDiem: 0n,
        maxBorrowedDiem: 1000n,
        maxSlippageBps: 100 as never,
        maxPriceImpactBps: 100 as never,
        maxLeverageBps: 20_000 as never,
        minHealthFactor: 0n,
        minLiquidationDistanceBps: 0 as never,
        maxMorphoUtilizationImpactBps: 0 as never,
        flashFeeCap: 0n,
        protocolFeeCap: 0n,
        automationFeeCap: 0n,
      },
    },
    digest:
      "0xaaaa000000000000000000000000000000000000000000000000000000000000" as never,
    quoteId:
      "0xbbbb000000000000000000000000000000000000000000000000000000000000" as never,
    evidence: {
      actionId:
        "0x0000000000000000000000000000000000000000000000000000000000000000" as never,
      evidenceSetId:
        "0x0000000000000000000000000000000000000000000000000000000000000000" as never,
      owner: "0x1111111111111111111111111111111111111111",
      market:
        "0x4444444444444444444444444444444444444444444444444444444444444444" as never,
      blockNumber: 100n as never,
      stateBitmap: 0 as never,
      sources: [],
      evidenceBundleHash:
        "0x6666666666666666666666666666666666666666666666666666666666666666" as never,
    },
    subHashes: {
      quoteHash:
        "0xcccc000000000000000000000000000000000000000000000000000000000000" as never,
      spenderListHash:
        "0xdddd000000000000000000000000000000000000000000000000000000000000" as never,
      allowanceScheduleHash:
        "0xeeee000000000000000000000000000000000000000000000000000000000000" as never,
      feeCapHash:
        "0xffff000000000000000000000000000000000000000000000000000000000000" as never,
      evidenceBundleHash:
        "0x6666666666666666666666666666666666666666666666666666666666666666" as never,
    },
    gateStatuses: [
      { gate: "G_PM_1_HARVEST_CONVERGENCE", status: "pass" },
      { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "pass" },
      { gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT", status: "pass" },
      { gate: "G_PM_4_EIP1271_PREIMAGE", status: "notApplicable" },
      { gate: "G_PM_5_MEV_WAIVER", status: "pass" },
      { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "notApplicable" },
    ],
    failureConditions: [],
    calldata: "0x1234abcd" as never,
    calldataHash:
      "0x7777000000000000000000000000000000000000000000000000000000000000" as never,
    ...overrides,
  };
}

describe("PreviewDrawer", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <PreviewDrawer
        open={false}
        preview={buildPreview()}
        onClose={vi.fn()}
        onSign={vi.fn()}
        signing={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders loading state when preview is undefined", () => {
    render(
      <PreviewDrawer
        open
        preview={undefined}
        onClose={vi.fn()}
        onSign={vi.fn()}
        signing={false}
      />,
    );
    expect(
      screen.getByTestId("preview-drawer-loading"),
    ).toBeInTheDocument();
  });

  it("renders every §10 mandatory section", () => {
    render(
      <PreviewDrawer
        open
        preview={buildPreview()}
        onClose={vi.fn()}
        onSign={vi.fn()}
        signing={false}
      />,
    );
    for (const id of [
      "preview-identity",
      "preview-spenders",
      "preview-digest",
      "preview-ledger",
      "preview-amounts-route",
      "preview-fees-yield",
      "preview-approvals",
      "preview-calldata",
      "preview-failure-conditions",
      "preview-gates",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("renders LEDGER_BEFORE_UNAVAILABLE / LEDGER_AFTER_UNAVAILABLE sentinels", () => {
    render(
      <PreviewDrawer
        open
        preview={buildPreview()}
        onClose={vi.fn()}
        onSign={vi.fn()}
        signing={false}
      />,
    );
    expect(screen.getByTestId("ledger-before").dataset.sentinel).toBe(
      "LEDGER_BEFORE_UNAVAILABLE",
    );
    expect(screen.getByTestId("ledger-after").dataset.sentinel).toBe(
      "LEDGER_AFTER_UNAVAILABLE",
    );
  });

  it("renders the Force-Exit block only when primaryType === ForceExit", () => {
    render(
      <PreviewDrawer
        open
        preview={buildPreview()}
        onClose={vi.fn()}
        onSign={vi.fn()}
        signing={false}
      />,
    );
    expect(
      screen.queryByTestId("preview-force-exit-block"),
    ).not.toBeInTheDocument();
  });

  it("enables the sign button when all gates clear and no override", () => {
    render(
      <PreviewDrawer
        open
        preview={buildPreview()}
        onClose={vi.fn()}
        onSign={vi.fn()}
        signing={false}
      />,
    );
    const sign = screen.getByTestId("preview-sign-button");
    expect(sign.dataset.enabled).toBe("true");
  });

  it("disables the sign button when signOverrideDisabled is set and surfaces reason", () => {
    render(
      <PreviewDrawer
        open
        preview={buildPreview()}
        onClose={vi.fn()}
        onSign={vi.fn()}
        signing={false}
        signOverrideDisabled
        signDisabledReason="Wrong chain"
      />,
    );
    expect(
      screen.getByTestId("preview-sign-button").dataset.enabled,
    ).toBe("false");
    expect(
      screen.getByTestId("preview-sign-override-reason"),
    ).toHaveTextContent("Wrong chain");
  });
});
