// D.2 Loop Builder — synthesis §H Week 3.
//
// Intent tabs (Earn / Increase / Reduce / Exit), amount + leverage slider,
// live HF gauge as the slider moves, MEV mode selector, Open-preview CTA.
// The preview drawer renders all §10 mandatory fields.

import { useState, useMemo, useCallback } from "react";
import { useConnectedAccount as useAccount } from "../wallet/index.js";
import type { MevProtectionMode } from "@wstdiem/sdk";
import { IntentTabs, type IntentId, getIntentMeta } from "../components/IntentTabs.js";
import { HealthFactorGauge } from "../components/HealthFactorGauge.js";
import { MevModeSelector, MEV_MODE_META } from "../components/MevModeSelector.js";
import { PreviewDrawer } from "../components/PreviewDrawer.js";
import { useMarketContext } from "../hooks/useMarketContext.js";
import { usePreview } from "../hooks/usePreview.js";
import { useChainPin } from "../hooks/useChainPin.js";
import { useGpmGates } from "../hooks/useGpmGates.js";

const MIN_LEVERAGE_BPS = 10_000; // 1.0x
const MAX_LEVERAGE_BPS = 50_000; // 5.0x — clamped by registry.maxLeverageBps in prod
const LEVERAGE_STEP_BPS = 1_000; // 0.1x

export function LoopBuilder(): JSX.Element {
  const account = useAccount();
  const chainPin = useChainPin();
  const { activeMarket } = useMarketContext();

  const [intent, setIntent] = useState<IntentId>("earn-spread");
  const [amount, setAmount] = useState<string>("");
  const [leverageBps, setLeverageBps] = useState<number>(20_000); // 2.0x default
  const [mevMode, setMevMode] = useState<MevProtectionMode>("PRIVATE_BUILDER");
  const [mevWaiverBits, setMevWaiverBits] = useState<number>(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [signing, setSigning] = useState(false);

  const intentMeta = getIntentMeta(intent);

  // The full Action assembly requires contract addresses + market params +
  // the SDK's quote round-trip. Phase 3 leaves the action undefined when
  // inputs aren't ready, which keeps the preview hook disabled and the
  // drawer surfaces an explicit awaiting-data message. Phase 4 + 5 wire
  // the live assembly via sdk.quoteOpen / quoteRebalance / quoteExit.
  const proposedAction = useMemo(() => {
    if (!activeMarket || !account.address) return undefined;
    if (!amount || Number(amount) <= 0) return undefined;
    // Phase 3 stub: we leave the action undefined because building a real
    // Action without the SDK's quote helpers risks committing a malformed
    // digest to the wallet. The preview hook surfaces this state as
    // awaiting-data; the sign button never enables.
    return undefined;
  }, [activeMarket, account.address, amount]);

  const previewQuery = usePreview({ action: proposedAction });
  const gpmGates = useGpmGates({
    ...(proposedAction !== undefined ? { action: proposedAction } : {}),
    ...(previewQuery.data !== undefined ? { preview: previewQuery.data } : {}),
  });

  const requiredWaivers = MEV_MODE_META.find((m) => m.mode === mevMode)?.requiredWaiverBits ?? 0;
  const mevWaiverIncomplete =
    requiredWaivers !== 0 &&
    (mevWaiverBits & requiredWaivers) !== requiredWaivers;

  const quoteStale =
    previewQuery.data?.action.quoteBlockNumber !== undefined
      ? false // Phase 4 wires the block-watcher; for now never-stale stub
      : false;

  // M-2 wire-up: G-PM gate fail also blocks signing alongside chain-pin /
  // stale-quote / disconnected / waiver-incomplete reasons.
  const signOverrideDisabled =
    !account.isConnected ||
    chainPin.wrongChain ||
    mevWaiverIncomplete ||
    quoteStale ||
    gpmGates.anyFail;

  const signOverrideReason = !account.isConnected
    ? "Connect a wallet to sign."
    : chainPin.wrongChain
    ? `Wrong chain (id=${chainPin.current}). Switch to Base (id=${chainPin.expected}).`
    : mevWaiverIncomplete
    ? "MEV waiver bits incomplete — acknowledge every required waiver."
    : quoteStale
    ? "QuoteStale — re-quote required."
    : gpmGates.anyFail
    ? "G-PM gate failing — see Pre-sign gates checklist."
    : undefined;

  // M-6 closure: parent-supplied callbacks must be stable so the drawer's
  // Esc-listener effect doesn't rebind every render.
  const onOpenPreview = useCallback(() => {
    setPreviewOpen(true);
  }, []);
  const onClosePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  const onSign = useCallback(async () => {
    setSigning(true);
    try {
      // Phase 4 wires:
      //   const { typedData, digest } = await build.buildAuthorization.mutateAsync(action);
      //   const sig = await signTypedData(typedData);
      //   await build.attachSignature.mutateAsync({ action, signature: sig, expectedDigest: digest });
      // Phase 3 stub: log + return so the UI gates remain inspectable.
      // eslint-disable-next-line no-console
      console.warn("LoopBuilder.onSign: live sign flow lands in Phase 4");
    } finally {
      setSigning(false);
    }
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section
        data-testid="loop-builder-primary"
        className="space-y-4 rounded-lg border border-border bg-surface px-4 py-4"
      >
        <header>
          <h2 className="text-lg font-semibold text-text">Loop Builder</h2>
          <p className="text-sm text-text-muted">
            Pick your intent, set your inputs, preview every §10 field, sign.
          </p>
        </header>

        <IntentTabs
          activeIntent={intent}
          onChange={setIntent}
          showAdvancedLink
          onAdvancedClick={() => {
            // eslint-disable-next-line no-console
            console.warn("Advanced/raw view lands in Phase 5");
          }}
        />

        <div className="rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text-muted">
          <span className="font-semibold text-text">{intentMeta.label}</span>{" "}
          — {intentMeta.description}{" "}
          <span className="font-mono">({intentMeta.mechanism})</span>
        </div>

        <div data-testid="amount-input-section" className="space-y-1.5">
          <label
            htmlFor="amount-input"
            className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Amount (wstDIEM)
          </label>
          <input
            id="amount-input"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            data-testid="amount-input"
          />
        </div>

        <div data-testid="leverage-slider-section" className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="leverage-slider"
              className="text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Leverage
            </label>
            <span className="font-mono text-sm text-text">
              {(leverageBps / 10_000).toFixed(1)}x
            </span>
          </div>
          <input
            id="leverage-slider"
            type="range"
            min={MIN_LEVERAGE_BPS}
            max={MAX_LEVERAGE_BPS}
            step={LEVERAGE_STEP_BPS}
            value={leverageBps}
            onChange={(e) => setLeverageBps(Number(e.target.value))}
            className="w-full accent-accent"
            data-testid="leverage-slider"
          />
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>1.0x</span>
            <span>{(MAX_LEVERAGE_BPS / 10_000).toFixed(1)}x (registry-pinned cap)</span>
          </div>
        </div>

        <div data-testid="live-hf-section" className="rounded-md border border-border bg-canvas px-3 py-2">
          <div className="mb-1 text-xs text-text-muted">
            Estimated post-action HF
          </div>
          {/* Phase 3 stub: HF estimation requires SDK quote round-trip.
              Surfaces the indeterminate sentinel so the operator sees the
              fail-closed posture rather than a misleading "—". */}
          <HealthFactorGauge healthFactorWad={undefined} size="md" />
        </div>

        <MevModeSelector
          mode={mevMode}
          onModeChange={setMevMode}
          waiverBits={mevWaiverBits}
          onWaiverChange={setMevWaiverBits}
          disabled={signing}
        />

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onOpenPreview}
            disabled={!proposedAction && !account.isConnected}
            className="rounded-md border border-accent/60 bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-raised disabled:text-text-muted"
            data-testid="open-preview-cta"
          >
            Open preview
          </button>
        </div>
      </section>

      <aside
        data-testid="loop-builder-route-pane"
        className="space-y-3 rounded-lg border border-border bg-surface px-4 py-4"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text">
          Route details
        </h3>
        <p className="text-xs text-text-muted">
          Executor calldata, Curve pool, flash-loan provider, Morpho market
          params, fee router cap render in Phase 5 once the SDK quote helpers
          are wired against the deployed registry.
        </p>
      </aside>

      <PreviewDrawer
        open={previewOpen}
        preview={previewQuery.data}
        signing={signing}
        signOverrideDisabled={signOverrideDisabled}
        gateStatuses={gpmGates.gates}
        {...(signOverrideReason !== undefined
          ? { signDisabledReason: signOverrideReason }
          : {})}
        onClose={onClosePreview}
        onSign={onSign}
      />
    </div>
  );
}
