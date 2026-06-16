// DevForceExit — dev-only test harness route for the C-1 phishing-defeat
// acceptance suite (PROTOCOL.md §13.4 row 12). Mounted ONLY when
// `import.meta.env.DEV === true`; production builds skip the route via
// router.tsx so this file is dead-code-eliminated.
//
// Why this exists:
//   The Force-Exit confirmation panel is wallet-gated — it only renders
//   from /positions after a real account connects + clicks
//   `action-button-force-exit`. The Playwright acceptance suite cannot
//   complete a real wallet connect in CI, so the C-1 phishing-defeat
//   row (the highest-value audit signal in PR-16) would otherwise be
//   un-coverable end-to-end.
//
//   This route mounts the panel with a synthetic ForceExitAction whose
//   `verifyingContract` reads from VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER
//   exactly as the production Positions flow does — so the C-1 NAME
//   resolution via `authorizerNameFor()` is exercised identically.
//
//   The two test harnesses (default :5173 / phishing-mismatch :5174) flip
//   the env to demonstrate both the happy path (NAME resolves correctly)
//   and the mismatch path (banner + sign-refusal). See playwright.config.ts.

import { useState, useCallback } from "react";
import type { ForceExitAction } from "@wstdiem/sdk";
import { ForceExitRiskBit } from "@wstdiem/sdk";
import {
  ForceExitConfirmPanel,
  type ForceExitSignOverrideReason,
} from "../components/ForceExitConfirmPanel.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEMO_OWNER = "0x000000000000000000000000000000000000dEaD";
const DEMO_MARKET =
  "0xabcdef0000000000000000000000000000000000000000000000000000000001";

function nonZeroEnvAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "" || v === ZERO_ADDRESS) return undefined;
  return value;
}

export function DevForceExit(): JSX.Element {
  const [open, setOpen] = useState(false);

  const verifyingContractEnv = nonZeroEnvAddress(
    import.meta.env.VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER,
  );
  const executorEnv = nonZeroEnvAddress(
    import.meta.env.VITE_CONTRACT_LOOP_FORCE_EXIT_EXECUTOR,
  );

  // Synthetic action mirrors Positions.tsx exactly.
  const action: ForceExitAction = {
    primaryType: "ForceExit",
    owner: DEMO_OWNER as never,
    chainId: 8453 as never,
    verifyingContract: (verifyingContractEnv ?? ZERO_ADDRESS) as never,
    executor: (executorEnv ?? ZERO_ADDRESS) as never,
    market: DEMO_MARKET as never,
    registryVersion: 0n as never,
    registryMerkleRoot:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as never,
    policyId: 0n as never,
    nonceSlot: 0n,
    nonceBit: 0,
    executionKind: "OWNER_DIRECT",
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600) as never,
    quoteBlockNumber: 0n as never,
    maxQuoteAgeBlocks: 0,
    maxQuoteDeviationBps: 0 as never,
    mevProtectionMode: "PRIVATE_BUILDER",
    mevWaiverBits: 0,
    evidenceBundleHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as never,
    bounds: {
      minRepayment: 0n,
      maxCollateralSold: 0n,
      looseSlippageBps: 0 as never,
      looseFlashFeeCap: 0n,
      maxCurvePositionShareBps: 0 as never,
      acknowledgedRisks:
        ForceExitRiskBit.LOOSE_SLIPPAGE |
        ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
    },
  };

  // Build sign-override reasons exactly as Positions.tsx would. Tests use
  // the panel's authorizer-mismatch banner to assert the C-1 phishing
  // defeat; the override-reasons section validates the M-1 closure.
  const overrideReasons: ForceExitSignOverrideReason[] = [];
  if (verifyingContractEnv === undefined || executorEnv === undefined) {
    overrideReasons.push({
      code: "FORCE_EXIT_DEMO_ENV_MISSING",
      message:
        "Force-Exit demo unavailable: VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER / VITE_CONTRACT_LOOP_FORCE_EXIT_EXECUTOR not configured.",
    });
  }

  const onCancel = useCallback(() => setOpen(false), []);
  const onSign = useCallback(async () => {
    // Dev harness — never actually signs.
    // eslint-disable-next-line no-console
    console.warn("DevForceExit: sign clicked (dev harness, no broadcast)");
    setOpen(false);
  }, []);

  return (
    <div
      className="space-y-4 rounded-lg border border-warning-border bg-warning-surface px-4 py-4 text-warning-text"
      data-testid="dev-force-exit-page"
    >
      <header>
        <h2 className="text-lg font-semibold">
          DEV ONLY — Force-Exit acceptance harness
        </h2>
        <p className="mt-1 text-sm">
          This route exists only when{" "}
          <code className="font-mono">import.meta.env.DEV === true</code>. It
          mounts the production ForceExitConfirmPanel against a synthetic
          action so the §13.4 row 12 "force-exit phishing-defeat" acceptance
          suite can exercise the C-1 NAME resolution against both matched
          and mismatched env without a funded wallet.
        </p>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt>verifyingContract (env)</dt>
        <dd className="font-mono" data-testid="dev-force-exit-verifying-contract">
          {verifyingContractEnv ?? "(unset)"}
        </dd>
        <dt>executor (env)</dt>
        <dd className="font-mono" data-testid="dev-force-exit-executor">
          {executorEnv ?? "(unset)"}
        </dd>
        <dt>action.verifyingContract</dt>
        <dd className="font-mono" data-testid="dev-force-exit-action-vc">
          {action.verifyingContract}
        </dd>
      </dl>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="dev-force-exit-open"
          className="rounded-md border border-warning-border bg-warning-border px-3 py-2 text-sm font-semibold text-canvas hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-warning-border"
        >
          Open Force-Exit panel
        </button>
      </div>
      {open ? (
        <ForceExitConfirmPanel
          action={action}
          onSign={onSign}
          onCancel={onCancel}
          signOverrideDisabled={overrideReasons.length > 0}
          signOverrideReasons={overrideReasons}
        />
      ) : null}
    </div>
  );
}
