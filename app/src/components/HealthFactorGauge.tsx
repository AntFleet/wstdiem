// HealthFactorGauge — Aave-style HF anchor (synthesis A.1).
//
// Renders a numeric HF + colored pill in three sizes. Color thresholds per
// `lib/risk-thresholds.ts`. Always paired with the liquidation-distance copy
// when given.

import { classifyHealthFactor, type RiskTier } from "../lib/risk-thresholds.js";

interface HealthFactorGaugeProps {
  /** Wad-scaled HF (1e18). undefined => HEALTH_INDETERMINATE sentinel. */
  healthFactorWad: bigint | undefined;
  /** Liquidation distance in basis points; rendered as collateral-drop %. */
  liquidationDistanceBps?: number | undefined;
  /** "sm" 14px text, "md" 18px text, "lg" 32px display. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  /** When true, the indeterminate-sentinel renders explicitly rather than a
   * silent dash. Always true per §10 mandatory disclosure. */
  showSentinelOnIndeterminate?: boolean;
}

const TIER_BG: Record<RiskTier, string> = {
  green: "bg-risk-green/15 text-risk-green",
  amber: "bg-risk-amber/15 text-risk-amber",
  red: "bg-risk-red/15 text-risk-red",
  unknown: "bg-surface-raised text-text-muted",
};

const TIER_BORDER: Record<RiskTier, string> = {
  green: "border-risk-green/40",
  amber: "border-risk-amber/40",
  red: "border-risk-red/40",
  unknown: "border-border",
};

function formatHf(hfWad: bigint | undefined): string {
  if (hfWad === undefined) return "—";
  const wad = 10n ** 18n;
  // Two decimal places, integer math: hfWad * 100 / wad
  const scaled = (hfWad * 100n) / wad;
  const whole = scaled / 100n;
  const frac = scaled % 100n;
  const fracStr = frac.toString().padStart(2, "0");
  return `${whole.toString()}.${fracStr}`;
}

export function HealthFactorGauge(props: HealthFactorGaugeProps): JSX.Element {
  const {
    healthFactorWad,
    liquidationDistanceBps,
    size = "md",
    showSentinelOnIndeterminate = true,
  } = props;
  const tier = classifyHealthFactor(healthFactorWad);
  const sizeClass =
    size === "lg"
      ? "text-3xl font-semibold tabular-nums"
      : size === "sm"
      ? "text-sm tabular-nums"
      : "text-base tabular-nums";
  const indeterminate = healthFactorWad === undefined;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 ${TIER_BG[tier]} ${TIER_BORDER[tier]}`}
      data-testid="hf-gauge"
      data-tier={tier}
    >
      <span className={sizeClass}>
        {indeterminate && showSentinelOnIndeterminate ? (
          <span className="text-text-muted font-mono text-xs">
            HEALTH_INDETERMINATE
          </span>
        ) : (
          <>
            HF&nbsp;
            <span className="font-mono">{formatHf(healthFactorWad)}</span>
          </>
        )}
      </span>
      {liquidationDistanceBps !== undefined && !indeterminate ? (
        <span className="text-xs text-text-muted">
          ({(liquidationDistanceBps / 100).toFixed(1)}% buffer)
        </span>
      ) : null}
    </div>
  );
}
