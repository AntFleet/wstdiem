// D.2 Loop Builder — synthesis §H Week 3.
//
// Intent tabs (Earn / Increase / Reduce / Exit), amount + leverage slider,
// live HF gauge as the slider moves, MEV mode selector, Open-preview CTA.
// The preview drawer renders all §10 mandatory fields.

import { useState, useCallback } from "react";
import {
  useConnectedAccount as useAccount,
  signAndAttachAction,
  broadcastTx,
} from "../wallet/index.js";
import { asBasisPoints, type MevProtectionMode } from "@wstdiem/sdk";
import { IntentTabs, type IntentId, getIntentMeta } from "../components/IntentTabs.js";
import { HealthFactorGauge } from "../components/HealthFactorGauge.js";
import { MevModeSelector, MEV_MODE_META } from "../components/MevModeSelector.js";
import { PreviewDrawer } from "../components/PreviewDrawer.js";
import { useMarketContext } from "../hooks/useMarketContext.js";
import { useActionParams } from "../hooks/useActionParams.js";
import { usePreview } from "../hooks/usePreview.js";
import { useSdk } from "../hooks/useSdk.js";
import { useChainPin } from "../hooks/useChainPin.js";
import { useGpmGates } from "../hooks/useGpmGates.js";

const MIN_LEVERAGE_BPS = 10_000; // 1.0x
const MAX_LEVERAGE_BPS = 50_000; // 5.0x — clamped by registry.maxLeverageBps in prod
const LEVERAGE_STEP_BPS = 1_000; // 0.1x
const WSTDIEM_DECIMALS = 18;

/** Parse a decimal wstDIEM amount string into base-unit bigint. Returns
 * undefined for empty / malformed / over-precise input so the builder stays
 * fail-closed (no action armed). */
function parseAmount(input: string, decimals = WSTDIEM_DECIMALS): bigint | undefined {
  if (!input || !/^\d*\.?\d*$/.test(input)) return undefined;
  const [whole = "0", frac = ""] = input.split(".");
  if (frac.length > decimals) return undefined;
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  try {
    const value =
      BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
    return value > 0n ? value : undefined;
  } catch {
    return undefined;
  }
}

export function LoopBuilder(): JSX.Element {
  const account = useAccount();
  const chainPin = useChainPin();
  const { activeMarket } = useMarketContext();
  const { sdk } = useSdk();

  const [intent, setIntent] = useState<IntentId>("earn-spread");
  const [amount, setAmount] = useState<string>("");
  const [leverageBps, setLeverageBps] = useState<number>(20_000); // 2.0x default
  const [mevMode, setMevMode] = useState<MevProtectionMode>("PRIVATE_BUILDER");
  const [mevWaiverBits, setMevWaiverBits] = useState<number>(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [signing, setSigning] = useState(false);

  const intentMeta = getIntentMeta(intent);
  const collateralAmount = parseAmount(amount);

  // Derive the fully-assembled Action envelope from the friendly inputs via
  // the SDK's build*Params helpers. The build query is keyed on the inputs, so
  // it only re-runs when the user changes amount / leverage / MEV mode; the
  // resulting Action feeds usePreview. When inputs aren't ready (no market /
  // owner / amount) the query stays disabled and no action is armed.
  const actionParamsQuery = useActionParams({
    primaryType: intentMeta.primaryType,
    market: activeMarket,
    owner: account.address,
    collateralAmount,
    leverageBps: asBasisPoints(leverageBps),
    mevProtectionMode: mevMode,
    mevWaiverBits,
    disabled: chainPin.wrongChain,
  });
  const proposedAction = actionParamsQuery.data;

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
  // stale-quote / disconnected / waiver-incomplete reasons. A missing action
  // or preview (build/quote still loading or failed) keeps sign fail-closed.
  const previewReady = proposedAction !== undefined && previewQuery.data !== undefined;
  const signOverrideDisabled =
    !account.isConnected ||
    chainPin.wrongChain ||
    mevWaiverIncomplete ||
    quoteStale ||
    gpmGates.anyFail ||
    !previewReady;

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
    : actionParamsQuery.isError
    ? "Unable to build the action — check inputs and market readiness."
    : previewQuery.isError
    ? "Quote failed — re-check inputs and try again."
    : !previewReady
    ? "Building quote…"
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
    if (!proposedAction) return;
    setSigning(true);
    try {
      // Canonical sign flow: SDK.buildAuthorization → wallet.signTypedData →
      // SDK.attachSignature (re-derives + verifies the digest) → broadcast.
      const tx = await signAndAttachAction({ sdk, action: proposedAction });
      await broadcastTx(tx);
      setPreviewOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("LoopBuilder.onSign failed:", err);
    } finally {
      setSigning(false);
    }
  }, [sdk, proposedAction]);

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
          {/* Driven by the live preview's projected post-action risk. When the
              SDK preview does not (yet) carry an `after` projection the gauge
              renders the HEALTH_INDETERMINATE sentinel rather than a
              misleading value. */}
          <HealthFactorGauge
            healthFactorWad={previewQuery.data?.after?.healthFactorWad}
            size="md"
          />
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
