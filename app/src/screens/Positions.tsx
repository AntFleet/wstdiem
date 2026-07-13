// D.3 Positions — synthesis §H Week 4.
//
// Risk header + 6-action row + yield decomposition + receipt-token legend
// + position-address callout + authorization row + event timeline + export.

import { useState, useCallback } from "react";
import {
  useConnectedAccount as useAccount,
  signAndAttachAction,
  broadcastTx,
} from "../wallet/index.js";
import type { Action, ForceExitAction, Policy } from "@wstdiem/sdk";
import { RiskHeader } from "../components/RiskHeader.js";
import { ActionRow, type PositionAction } from "../components/ActionRow.js";
import { YieldDecomposition } from "../components/YieldDecomposition.js";
import { ReceiptTokenLegend } from "../components/ReceiptTokenLegend.js";
import { PositionAddressCallout } from "../components/PositionAddressCallout.js";
import { AuthorizationRow } from "../components/AuthorizationRow.js";
import { EventTimeline } from "../components/EventTimeline.js";
import { EvidenceExportButton } from "../components/EvidenceExportButton.js";
import { PreviewDrawer } from "../components/PreviewDrawer.js";
import {
  ForceExitConfirmPanel,
  type ForceExitSignOverrideReason,
} from "../components/ForceExitConfirmPanel.js";
import { useMarketContext } from "../hooks/useMarketContext.js";
import { usePositions } from "../hooks/usePositions.js";
import { usePreview } from "../hooks/usePreview.js";
import { useReadiness } from "../hooks/useReadiness.js";
import { useAutomationPolicies } from "../hooks/useAutomationPolicies.js";
import { useRevoke } from "../hooks/useRevoke.js";
import { useEvents } from "../hooks/useEvents.js";
import { useSdk } from "../hooks/useSdk.js";
import { useChainPin } from "../hooks/useChainPin.js";
import { useGpmGates } from "../hooks/useGpmGates.js";
import { useQuery } from "@tanstack/react-query";
import {
  asBasisPoints,
  ForceExitRiskBit,
  requiredForceExitRiskBitsFromStateBitmap,
  forceExitBlockedByMultiCritical,
} from "@wstdiem/sdk";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Heuristic deleverage step for the "Rebalance ↓" action: nudge the target
// leverage down 10% from current (clamped to 1.0x). A dedicated target-leverage
// input lands with the advanced Positions UX.
function deleverageTarget(currentLeverageBps: number | undefined): number {
  const current = currentLeverageBps ?? 20_000;
  return Math.max(10_000, Math.round(current * 0.9));
}

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

  // Rebalance ↓ / Exit / Repay build a real Action envelope from the current
  // position and route it through the shared PreviewDrawer → sign → broadcast
  // flow (mirrors LoopBuilder). Force-Exit keeps its dedicated confirm panel.
  const [pendingAction, setPendingAction] = useState<Action | undefined>(
    undefined,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const pendingPreview = usePreview({ action: pendingAction });

  // M-2 wire-up: G-PM gate evaluation. Hook called unconditionally to
  // respect Rules of Hooks; when a preview action is pending the gates
  // evaluate against it, otherwise they surface the market-scoped shape.
  const gpmGates = useGpmGates({
    ...(pendingAction !== undefined ? { action: pendingAction } : {}),
    ...(pendingPreview.data !== undefined
      ? { preview: pendingPreview.data }
      : {}),
  });

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

  // Audit C: derive ForceExit acknowledgedRisks from the live §7.1 state
  // bitmap so the per-bit checklist matches what on-chain
  // validateLiveStateBitmap will demand. Optional LOOSE_SLIPPAGE is added
  // only when the user needs a single-critical override path (not multi).
  const liveStateBitmap = Number(readinessQuery.data?.stateBitmap ?? 0);
  const requiredForceExitRisks =
    requiredForceExitRiskBitsFromStateBitmap(liveStateBitmap);
  const forceExitMultiCriticalBlocked =
    forceExitBlockedByMultiCritical(requiredForceExitRisks);
  // When healthy (no required overrides), still surface LOOSE_SLIPPAGE so the
  // panel exercises the checklist; when a single critical is required, OR it
  // in so the user must acknowledge both slippage and the degraded bit.
  const forceExitAckRisks = forceExitMultiCriticalBlocked
    ? requiredForceExitRisks
    : requiredForceExitRisks | ForceExitRiskBit.LOOSE_SLIPPAGE;

  const onAction = useCallback(
    async (id: PositionAction) => {
      if (id === "force-exit") {
        setForceExitOpen(true);
        return;
      }
      // Rebalance ↓ / Exit / Repay build a real envelope from the current
      // position collateral and open the preview drawer. Add-collateral (needs
      // a fresh-capital amount input) and Revoke (its own AuthorizationRow
      // path) are out of the Track A manual-open scope.
      if (!activeMarket || !owner) return;
      const collateral = positionQuery.data?.collateralWstDiem;
      if (!collateral || collateral <= 0n) return;
      const common = {
        market: activeMarket,
        owner,
        collateralAmount: collateral,
        mevProtectionMode: "PRIVATE_BUILDER" as const,
        mevWaiverBits: 0,
      };
      try {
        let action: Action | undefined;
        if (id === "exit") {
          action = await sdk.buildExitParams({ ...common, routeKind: "CURVE" });
        } else if (id === "repay") {
          action = await sdk.buildExitParams({
            ...common,
            routeKind: "REPAY_ONLY",
          });
        } else if (id === "rebalance-down") {
          action = await sdk.buildRebalanceParams({
            ...common,
            leverageBps: asBasisPoints(
              deleverageTarget(positionQuery.data?.leverageBps),
            ),
          });
        } else {
          return;
        }
        setPendingAction(action);
        setPreviewOpen(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Positions.onAction(${id}) build failed:`, err);
      }
    },
    [activeMarket, owner, positionQuery.data, sdk],
  );

  const onClosePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  const onPreviewSign = useCallback(async () => {
    if (!pendingAction) return;
    setSigning(true);
    try {
      const tx = await signAndAttachAction({ sdk, action: pendingAction });
      await broadcastTx(tx);
      setPreviewOpen(false);
      setPendingAction(undefined);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Positions.onPreviewSign failed:", err);
    } finally {
      setSigning(false);
    }
  }, [sdk, pendingAction]);

  // M-6 closure: useCallback the cancel callback so the panel's Esc-listener
  // effect doesn't rebind every Positions render.
  const onForceExitCancel = useCallback(() => {
    setForceExitOpen(false);
  }, []);
  const onForceExitSign = useCallback(async () => {
    if (!activeMarket || !owner) {
      setForceExitOpen(false);
      return;
    }
    try {
      // Build the REAL ForceExit envelope with the same acknowledgedRisks the
      // confirm panel displayed (live-bitmap derived). SDK re-checks coverage
      // + I-67 minimality against a fresh on-chain bitmap before returning.
      const action = await sdk.buildForceExitParams({
        market: activeMarket,
        owner,
        collateralAmount: positionQuery.data?.collateralWstDiem ?? 0n,
        acknowledgedRisks: forceExitAckRisks,
        mevProtectionMode: "PRIVATE_BUILDER",
        mevWaiverBits: 0,
      });
      const tx = await signAndAttachAction({ sdk, action });
      await broadcastTx(tx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Positions.ForceExit.onSign failed:", err);
    } finally {
      setForceExitOpen(false);
    }
  }, [sdk, activeMarket, owner, positionQuery.data, forceExitAckRisks]);

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

  // Display action for the confirmation panel. acknowledgedRisks is derived
  // from the live state bitmap so the checklist the user reviews matches
  // what onForceExitSign commits via sdk.buildForceExitParams.
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
      acknowledgedRisks: forceExitAckRisks,
    },
  };

  // M-1 + M-2 + audit C: surface every external blocker (wallet / chain /
  // G-PM gates / multi-critical degraded state / demo-env) as named reasons.
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
  if (forceExitMultiCriticalBlocked) {
    overrideReasons.push({
      code: "FORCE_EXIT_MULTI_CRITICAL",
      message:
        "Live protocol state requires more than one critical Force-Exit override at once (I-67 minimality). Wait for recovery to a single degraded condition, or use standard Exit if available.",
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

  // Gating for the shared (non-force-exit) preview drawer.
  const previewReady =
    pendingAction !== undefined && pendingPreview.data !== undefined;
  const previewSignDisabled =
    !account.isConnected ||
    chainPin.wrongChain ||
    gpmGates.anyFail ||
    !previewReady;
  const previewSignReason = !account.isConnected
    ? "Connect a wallet to sign."
    : chainPin.wrongChain
    ? `Wrong chain (id=${chainPin.current}). Switch to Base (id=${chainPin.expected}).`
    : gpmGates.anyFail
    ? "G-PM gate failing — see Pre-sign gates checklist."
    : pendingPreview.isError
    ? "Quote failed — re-check position readiness and try again."
    : !previewReady
    ? "Building quote…"
    : undefined;

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

      <PreviewDrawer
        open={previewOpen}
        preview={pendingPreview.data}
        signing={signing}
        signOverrideDisabled={previewSignDisabled}
        gateStatuses={gpmGates.gates}
        {...(previewSignReason !== undefined
          ? { signDisabledReason: previewSignReason }
          : {})}
        onClose={onClosePreview}
        onSign={onPreviewSign}
      />

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
