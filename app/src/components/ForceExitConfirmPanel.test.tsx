import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForceExitConfirmPanel } from "./ForceExitConfirmPanel.js";
import { ForceExitRiskBit } from "@wstdiem/sdk";
import type { ForceExitAction } from "@wstdiem/sdk";

function buildForceExitAction(
  overrides: Partial<ForceExitAction["bounds"]> = {},
): ForceExitAction {
  return {
    primaryType: "ForceExit",
    owner: "0x1111111111111111111111111111111111111111",
    chainId: 8453 as never,
    // Matches VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER in src/test/setup.ts.
    verifyingContract: "0x3333333333333333333333333333333333333333",
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
      minRepayment: 100n,
      maxCollateralSold: 200n,
      looseSlippageBps: 500 as never,
      looseFlashFeeCap: 10n,
      maxCurvePositionShareBps: 1000 as never,
      acknowledgedRisks:
        ForceExitRiskBit.LOOSE_SLIPPAGE | ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
      ...overrides,
    },
  };
}

describe("ForceExitConfirmPanel", () => {
  let rafCallbacks: Array<{ id: number; cb: FrameRequestCallback }> = [];
  let nextId = 1;
  let nowMs = 0;
  const realRaf = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;
  const realPerfNow = performance.now.bind(performance);

  beforeEach(() => {
    rafCallbacks = [];
    nextId = 1;
    nowMs = 0;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextId++;
      rafCallbacks.push({ id, cb });
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      rafCallbacks = rafCallbacks.filter((r) => r.id !== id);
    }) as typeof window.cancelAnimationFrame;
    performance.now = () => nowMs;
  });

  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancel;
    performance.now = realPerfNow;
  });

  function flushFrames(steps: number, dtMs: number): void {
    for (let i = 0; i < steps; i++) {
      nowMs += dtMs;
      const batch = rafCallbacks;
      rafCallbacks = [];
      for (const { cb } of batch) {
        act(() => cb(nowMs));
      }
    }
  }

  it("renders full-screen warning chrome with the phishing banner and decoded primaryType", () => {
    const action = buildForceExitAction();
    render(
      <ForceExitConfirmPanel
        action={action}
        onSign={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("force-exit-confirm-panel"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("force-exit-phishing-banner"),
    ).toHaveTextContent(/LoopForceExitAuthorizer/);
    expect(
      screen.getByTestId("force-exit-phishing-banner"),
    ).toHaveTextContent(/LoopAuthorization/);
    expect(
      screen.getByTestId("force-exit-decoded-fields"),
    ).toHaveTextContent(/ForceExit/);
  });

  it("keeps the sign button disabled until typed-confirm + every risk + dwell elapse", async () => {
    const user = userEvent.setup();
    const action = buildForceExitAction();
    render(
      <ForceExitConfirmPanel
        action={action}
        onSign={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const sign = screen.getByTestId("force-exit-sign");
    expect(sign).toBeDisabled();
    expect(sign.dataset.enabled).toBe("false");

    // Check both required bits.
    const looseSlip = screen.getByTestId(
      "per-bit-checklist-row-LOOSE_SLIPPAGE",
    );
    const staleOracle = screen.getByTestId(
      "per-bit-checklist-row-STALE_ORACLE_OVERRIDE",
    );
    await user.click(looseSlip.querySelector("input")!);
    await user.click(staleOracle.querySelector("input")!);

    // Typed-confirm token.
    const typed = screen.getByPlaceholderText("FORCE-EXIT");
    await user.type(typed, "FORCE-EXIT");

    // Dwell countdown should now be visible — flush 3000ms.
    expect(screen.getByTestId("dwell-countdown")).toBeInTheDocument();
    flushFrames(30, 100);
    expect(screen.getByTestId("dwell-countdown").dataset.elapsed).toBe(
      "true",
    );

    expect(sign).not.toBeDisabled();
    expect(sign.dataset.enabled).toBe("true");
  });

  it("disarms when the user unchecks a risk after typing FORCE-EXIT", async () => {
    const user = userEvent.setup();
    const action = buildForceExitAction({
      acknowledgedRisks: ForceExitRiskBit.LOOSE_SLIPPAGE,
    });
    render(
      <ForceExitConfirmPanel
        action={action}
        onSign={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const row = screen.getByTestId(
      "per-bit-checklist-row-LOOSE_SLIPPAGE",
    );
    await user.click(row.querySelector("input")!);
    await user.type(screen.getByPlaceholderText("FORCE-EXIT"), "FORCE-EXIT");
    flushFrames(30, 100);
    expect(screen.getByTestId("force-exit-sign").dataset.enabled).toBe("true");
    // Uncheck the box → must disarm.
    await user.click(row.querySelector("input")!);
    expect(screen.getByTestId("force-exit-sign").dataset.enabled).toBe("false");
    // The countdown idle marker re-appears.
    expect(
      screen.queryByTestId("dwell-countdown-idle"),
    ).toBeInTheDocument();
  });

  it("calls onCancel when the user clicks Cancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ForceExitConfirmPanel
        action={buildForceExitAction()}
        onSign={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByTestId("force-exit-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onSign once when the gates clear and the user clicks Sign", async () => {
    const user = userEvent.setup();
    const onSign = vi.fn().mockResolvedValue(undefined);
    const action = buildForceExitAction({
      acknowledgedRisks: ForceExitRiskBit.LOOSE_SLIPPAGE,
    });
    render(
      <ForceExitConfirmPanel
        action={action}
        onSign={onSign}
        onCancel={vi.fn()}
      />,
    );
    const row = screen.getByTestId(
      "per-bit-checklist-row-LOOSE_SLIPPAGE",
    );
    await user.click(row.querySelector("input")!);
    await user.type(screen.getByPlaceholderText("FORCE-EXIT"), "FORCE-EXIT");
    flushFrames(30, 100);
    await user.click(screen.getByTestId("force-exit-sign"));
    expect(onSign).toHaveBeenCalledTimes(1);
  });
});
