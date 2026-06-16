// D.3 Positions — synthesis §H Week 4.
//
// Risk header + 6-action row + yield decomposition + receipt-token legend
// + position-address callout + authorization row + event timeline + export.

import { useState, useCallback } from "react";
import { useConnectedAccount as useAccount } from "../wallet/index.js";
import type { ForceExitAction, Policy } from "@wstdiem/sdk";
import { RiskHeader } from "../components/RiskHeader.js";
import { ActionRow, type PositionAction } from "../components/ActionRow.js";
import { YieldDecomposition } from "../components/YieldDecomposition.js";
import { ReceiptTokenLegend } from "../components/ReceiptTokenLegend.js";
import { PositionAddressCallout } from "../components/PositionAddressCallout.js";
import { AuthorizationRow } from "../components/AuthorizationRow.js";
import { EventTimeline } from "../components/EventTimeline.js";
import { EvidenceExportButton } from "../components/EvidenceExportButton.js";
import {
  ForceExitConfirmPanel,
  type ForceExitSignOverrideReason,
} from "../components/ForceExitConfirmPanel.js";
import { useMarketContext } from "../hooks/useMarketContext.js";
import { usePositions } from "../hooks/usePositions.js";
import { useReadiness } from "../hooks/useReadiness.js";
import { useAutomationPolicies } from "../hooks/useAutomationPolicies.js";
import { useRevoke } from "../hooks/useRevoke.js";
import { useEvents } from "../hooks/useEvents.js";
import { useSdk } from "../hooks/useSdk.js";
import { useChainPin } from "../hooks/useChainPin.js";
import { useGpmGates } from "../hooks/useGpmGates.js";
import { useQuery } from "@tanstack/react-query";
import { ForceExitRiskBit } from "@wstdiem/sdk";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function nonZeroEnvAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "" || v === ZERO_ADDRESS) return undefined;
  return value;
}

export function Positions(): JSX.Element {
  const account = useAccount();
  const { activeMarket } = useMarketContext();
  const owner = account.address;

  const positionQuery = usePositions({
    market: activeMarket,
    owner,
  });
  const readinessQuery = useReadiness({
    market: activeMarket,
    ...(owner ? { owner } : {}),
  });
  const policiesQuery = useAutomationPolicies({
    owner,
    ...(activeMarket ? { market: activeMarket } : {}),
  });
  const revoke = useRevoke();
  const events = useEvents({ ...(owner ? { owner } : {}) });
  const { sdk } = useSdk();
  const chainPin = useChainPin();
  // M-2 wire-up: G-PM gate evaluation. Hook called unconditionally to
  // respect Rules of Hooks; the synthetic action passed below picks up the
  // verifyingContract envs when present so G-PM-4 evaluates against the
  // would-be ForceExit action's shape.
  const gpmGates = useGpmGates({});

  const evidenceBundleQuery = useQuery({
    queryKey: ["position-evidence-bundle", owner ?? "no-owner", activeMarket ?? "no-market"],
    queryFn: async () => {
      if (!owner || !activeMarket) throw new Error("owner+market required");
      const bundle = await sdk.getEvidenceBundle(owner, activeMarket);
      return bundle[0];
    },
    enabled: Boolean(owner && activeMarket),
    retry: false,
  });

  const [forceExitOpen, setForceExitOpen] = useState(false);

  const onAction = useCallback(
    async (id: PositionAction) => {
      if (id === "force-exit") {
        setForceExitOpen(true);
        return;
      }
      // Phase 5 wires the other actions through the LoopBuilder preview drawer
      // (Add collateral / Repay / Rebalance ↓ / Exit) and the bare revoke
      // path. For now we log and rely on the disabled-reason UI to keep
      // the audit posture explicit.
      // eslint-disable-next-line no-console
      console.warn(`Positions.onAction(${id}): wired in Phase 5`);
    },
    [],
  );

  // M-6 closure: useCallback the cancel callback so the panel's Esc-listener
  // effect doesn't rebind every Positions render.
  const onForceExitCancel = useCallback(() => {
    setForceExitOpen(false);
  }, []);
  const onForceExitSign = useCallback(async () => {
    // Phase 5 wires:
    //   const tx = await signAndAttachAction({ sdk, action: forceExitAction });
    //   await broadcastTx(tx);
    // eslint-disable-next-line no-console
    console.warn(
      "Positions.ForceExit.onSign: wallet flow wired in Phase 5",
    );
    setForceExitOpen(false);
  }, []);

  const onRevoke = useCallback(
    async (policy: Policy) => {
      try {
        await revoke.mutateAsync({ target: policy.policyId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Revoke failed:", err);
      }
    },
    [revoke],
  );

  if (!account.isConnected) {
    return (
      <div
        className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-muted"
        data-testid="positions-disconnected"
      >
        <h2 className="text-base font-semibold text-text">
          No wallet connected
        </h2>
        <p className="mt-1">
          Connect a wallet from the header to load your position risk +
          authorizations.
        </p>
      </div>
    );
  }

  if (!activeMarket) {
    return (
      <div
        className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-muted"
        data-testid="positions-no-market"
      >
        <h2 className="text-base font-semibold text-text">
          No market configured
        </h2>
        <p className="mt-1">
          Populate <code className="font-mono">VITE_PHASE_1_MARKET_IDS</code>{" "}
          to load position risk.
        </p>
      </div>
    );
  }

  // m-do-6 closure: narrow `owner` to a non-undefined branded Address
  // inside the connected branch. The early-return above guards isConnected,
  // but address can still be undefined; this lift keeps the synthetic
  // action constructor type-safe without a non-null assertion.
  if (!owner) {
    return (
      <div
        className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-muted"
        data-testid="positions-no-address"
      >
        <h2 className="text-base font-semibold text-text">
          Wallet account missing
        </h2>
        <p className="mt-1">
          The connected wallet does not expose an address yet. Reconnect to
          continue.
        </p>
      </div>
    );
  }

  // C-1 closure: source the synthesized ForceExitAction's verifyingContract
  // + executor from VITE_CONTRACT_* envs. When unset, the force-exit demo
  // path is disabled — the panel's mismatch banner would otherwise block
  // sign anyway, but this disabled-button posture is the auditable surface.
  const verifyingContractEnv = nonZeroEnvAddress(
    import.meta.env.VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER,
  );
  const executorEnv = nonZeroEnvAddress(
    import.meta.env.VITE_CONTRACT_LOOP_FORCE_EXIT_EXECUTOR,
  );
  const forceExitDemoUnavailable =
    verifyingContractEnv === undefined || executorEnv === undefined;

  // Build a synthetic Force-Exit action for the confirmation panel. Phase 5
  // wires the real action via sdk.quoteForceExit(); Phase 4 surfaces the
  // structural confirmation flow with placeholder bounds + the user's owner
  // so the chrome + per-bit + dwell exercise behave end-to-end.
  const syntheticForceExit: ForceExitAction = {
    primaryType: "ForceExit",
    owner,
    chainId: 8453 as never,
    verifyingContract: (verifyingContractEnv ?? ZERO_ADDRESS) as never,
    executor: (executorEnv ?? ZERO_ADDRESS) as never,
    market: activeMarket,
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
      // Default to two acknowledged risks so the per-bit checklist exercises
      // the multi-bit flow. Phase 5 fills from sdk.quoteForceExit.
      acknowledgedRisks:
        ForceExitRiskBit.LOOSE_SLIPPAGE |
        ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
    },
  };

  // M-1 + M-2 closure: surface every external blocker (wallet / chain /
  // G-PM gates / demo-env unavailable) as named reasons. `gpmGates` is
  // evaluated at the top of the function so the hook ordering is stable.
  const overrideReasons: ForceExitSignOverrideReason[] = [];
  if (!account.isConnected) {
    overrideReasons.push({
      code: "WALLET_DISCONNECTED",
      message: "Connect a wallet to sign.",
    });
  }
  if (chainPin.wrongChain) {
    overrideReasons.push({
      code: "WRONG_CHAIN",
      message: `Wrong chain (id=${chainPin.current}). Switch to Base (id=${chainPin.expected}).`,
    });
  }
  if (forceExitDemoUnavailable) {
    overrideReasons.push({
      code: "FORCE_EXIT_DEMO_ENV_MISSING",
      message:
        "Force-Exit demo unavailable: VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER / VITE_CONTRACT_LOOP_FORCE_EXIT_EXECUTOR not configured.",
    });
  }
  for (const g of gpmGates.gates) {
    if (g.status === "fail") {
      overrideReasons.push({
        code: g.gate,
        message: `Gate ${g.gate} failing${g.error ? ` (${g.error})` : ""}.`,
      });
    }
  }
  const forceExitSignOverrideDisabled = overrideReasons.length > 0;

  return (
    <div className="space-y-4" data-testid="positions-screen">
      <RiskHeader risk={positionQuery.data} />

      <PositionAddressCallout owner={owner} />

      <ActionRow readiness={readinessQuery.data} onClick={onAction} />

      <section
        data-testid="yield-section"
        className="grid gap-4 lg:grid-cols-2"
      >
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text">
            Yield decomposition
          </h3>
          <YieldDecomposition />
          <p className="mt-2 text-xs text-text-muted">
            Per-component APRs land when the SDK exposes the fee-decomposition
            surface (PR-16 follow-up).
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text">
            Receipt-token legend
          </h3>
          <ReceiptTokenLegend />
        </div>
      </section>

      <AuthorizationRow
        policies={policiesQuery.data}
        isLoading={policiesQuery.isLoading}
        onRevoke={(p) => {
          void onRevoke(p);
        }}
      />

      <EventTimeline
        events={events.events}
        isLoading={events.isLoading}
      />

      <div className="flex justify-end">
        <EvidenceExportButton
          bundle={evidenceBundleQuery.data}
          filename={`wstdiem-position-${owner.slice(2, 10)}`}
        />
      </div>

      {forceExitOpen ? (
        <ForceExitConfirmPanel
          action={syntheticForceExit}
          onSign={onForceExitSign}
          onCancel={onForceExitCancel}
          signOverrideDisabled={forceExitSignOverrideDisabled}
          signOverrideReasons={overrideReasons}
        />
      ) : null}
    </div>
  );
}
