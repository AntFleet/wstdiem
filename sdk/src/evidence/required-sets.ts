// Required EvidenceSource exact-sets per the SDK type definitions §A2.
// Address binding is registry-pinned and varies per market; callers must
// supply the resolved Address for each label via the registry reader.

import type { EvidenceSourceId } from "../types/evidence.js";
import type { PrimaryType } from "../types/enums.js";
import type { ExitRouteKind } from "../types/action.js";

/** Base required source labels per primary type. AutomationExec uses the
 * underlying action's set; Revoke uses an empty set. Exit Curve-free / repay
 * variants omit Morpho-position and/or Curve-quote per §A2; the caller selects
 * the correct sub-spec via ExitRouteKind. */
export const BASE_REQUIRED_SOURCES: Record<
  Exclude<PrimaryType, "AutomationExec" | "Revoke">,
  readonly EvidenceSourceId[]
> = {
  Open: [
    "harvest-event",
    "morpho-position",
    "chainlink-feed",
    "sequencer-uptime",
    "vault-nav",
    "external-protocol-fingerprint",
  ],
  Rebalance: [
    "harvest-event",
    "morpho-position",
    "chainlink-feed",
    "sequencer-uptime",
    "vault-nav",
    "external-protocol-fingerprint",
    "curve-quote",
  ],
  Exit: [
    "morpho-position",
    "chainlink-feed",
    "sequencer-uptime",
    "vault-nav",
    "external-protocol-fingerprint",
    "curve-quote",
  ],
  ForceExit: [
    "morpho-position",
    "chainlink-feed",
    "sequencer-uptime",
    "vault-nav",
    "external-protocol-fingerprint",
    "curve-quote",
  ],
};

/** Per-Exit-route variant. P3 (Morpho-evidence-free direct repay) omits
 * morpho-position. P4 (Curve-free) omits curve-quote. CURVE keeps both. */
export function exitRequiredSources(route: ExitRouteKind): readonly EvidenceSourceId[] {
  const base = BASE_REQUIRED_SOURCES.Exit;
  if (route === "CURVE") return base;
  if (route === "CURVE_FREE") return base.filter((s) => s !== "curve-quote");
  // REPAY_ONLY: omit both morpho-position (P3) and curve-quote (P4).
  return base.filter((s) => s !== "curve-quote" && s !== "morpho-position");
}

/** Returns the base required-source list (label-only) for a primary type. The
 * caller resolves each label to its registry-pinned Address before validation.
 *
 * NOTE for ForceExit: returns the 6-source fresh-only base set. §A2 specifies
 * per-waiver-bit degraded overrides (e.g. STALE_ORACLE_OVERRIDE permits
 * chainlink-feed: degraded) that the caller must apply at validation time —
 * `validateExactSet` only enforces label + address binding, not status.
 *
 * NOTE for Exit / AutomationExec(Exit): `opts.exitRoute` is REQUIRED for Exit
 * underlyings to avoid silently producing the wrong canonical set. CURVE,
 * CURVE_FREE, and REPAY_ONLY produce three distinct exact-sets per §A2. */
export function requiredSourcesFor(
  primaryType: PrimaryType,
  opts?: { exitRoute?: ExitRouteKind; underlyingPrimaryType?: Exclude<PrimaryType, "AutomationExec" | "Revoke"> },
): readonly EvidenceSourceId[] {
  if (primaryType === "Revoke") return [];
  if (primaryType === "AutomationExec") {
    const u = opts?.underlyingPrimaryType;
    if (!u) throw new Error("requiredSourcesFor(AutomationExec) requires opts.underlyingPrimaryType");
    if (u === "Exit") {
      if (!opts?.exitRoute) {
        throw new Error(
          "requiredSourcesFor(AutomationExec, Exit) requires opts.exitRoute — " +
            "the SDK refuses to default to CURVE because Phase 1 permissionless " +
            "AutomationExec is restricted to REPAY_ONLY / DELEVERAGE_ONLY (§A6.4).",
        );
      }
      return exitRequiredSources(opts.exitRoute);
    }
    return BASE_REQUIRED_SOURCES[u];
  }
  if (primaryType === "Exit") {
    if (!opts?.exitRoute) {
      throw new Error(
        "requiredSourcesFor(Exit) requires opts.exitRoute — " +
          "CURVE, CURVE_FREE, and REPAY_ONLY produce distinct §A2 exact-sets.",
      );
    }
    return exitRequiredSources(opts.exitRoute);
  }
  return BASE_REQUIRED_SOURCES[primaryType];
}
