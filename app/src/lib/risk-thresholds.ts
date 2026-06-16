// HF / liquidation-distance thresholds. Per synthesis A.1: red ≤ 1.05, amber ≤ 1.15,
// green > 1.15. The SDK does not expose these today; they are UI constants pinned
// here as a single source-of-truth (PR-16 follow-up: hoist to LoopRegistry).

export type RiskTier = "green" | "amber" | "red" | "unknown";

export const HF_THRESHOLD_RED = 1.05;
export const HF_THRESHOLD_AMBER = 1.15;

/**
 * Convert a wad-scaled health factor (1e18) into a UI tier.
 * Returns "unknown" when the health factor is undefined (HEALTH_INDETERMINATE).
 */
export function classifyHealthFactor(hfWad: bigint | undefined): RiskTier {
  if (hfWad === undefined) return "unknown";
  // hf as decimal = hfWad / 1e18. Compare via integer arithmetic.
  const wad = 10n ** 18n;
  const redCutoff = (BigInt(Math.floor(HF_THRESHOLD_RED * 100)) * wad) / 100n;
  const amberCutoff = (BigInt(Math.floor(HF_THRESHOLD_AMBER * 100)) * wad) / 100n;
  if (hfWad <= redCutoff) return "red";
  if (hfWad <= amberCutoff) return "amber";
  return "green";
}

/**
 * Tailwind class fragment per tier — matches the `risk` palette in
 * tailwind.config.ts. Use as `bg-risk-${tier} text-risk-${tier}` etc.
 */
export const TIER_TAILWIND: Record<RiskTier, string> = {
  green: "risk-green",
  amber: "risk-amber",
  red: "risk-red",
  unknown: "text-muted",
};
