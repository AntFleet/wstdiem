// String-union enums per the SDK type definitions and the §A reconciliation
// table that pins each TS string to its uint8 ABI value. The ABI maps below are
// the source-of-truth for serialization to/from on-chain calldata; the string
// member order in the unions is NOT load-bearing.

export type PrimaryType =
  | "Open"
  | "Rebalance"
  | "Exit"
  | "ForceExit"
  | "AutomationExec"
  | "Revoke";

export const PRIMARY_TYPE_U8: Record<PrimaryType, number> = {
  Open: 0,
  Rebalance: 1,
  Exit: 2,
  ForceExit: 3,
  Revoke: 4,
  AutomationExec: 5,
};

export type ExecutionKind =
  | "OWNER_DIRECT"
  | "KEEPER_PERMISSIONLESS"
  | "OPERATOR_RECOVERY";

export const EXECUTION_KIND_U8: Record<ExecutionKind, number> = {
  OWNER_DIRECT: 0,
  KEEPER_PERMISSIONLESS: 1,
  OPERATOR_RECOVERY: 2,
};

export type MevProtectionMode =
  | "PUBLIC"
  | "PRIVATE_BUILDER"
  | "SEQUENCER_DIRECT_FAILOPEN"
  | "SEALED_AUCTION";

export const MEV_PROTECTION_MODE_U8: Record<MevProtectionMode, number> = {
  PUBLIC: 0,
  PRIVATE_BUILDER: 1,
  SEQUENCER_DIRECT_FAILOPEN: 2,
  SEALED_AUCTION: 3,
};

export type PolicyClass =
  | "OPEN"
  | "REBALANCE"
  | "EXIT"
  | "REPAY_ONLY"
  | "DELEVERAGE_ONLY"
  | "FORCE_EXIT";

export const POLICY_CLASS_U8: Record<PolicyClass, number> = {
  OPEN: 0,
  REBALANCE: 1,
  EXIT: 2,
  REPAY_ONLY: 3,
  DELEVERAGE_ONLY: 4,
  FORCE_EXIT: 5,
};

export type SourceStatus =
  | "fresh"
  | "stale"
  | "missing"
  | "degraded"
  | "notConfigured"
  | "outsideDeviation";

export const SOURCE_STATUS_U8: Record<SourceStatus, number> = {
  fresh: 0,
  stale: 1,
  missing: 2,
  degraded: 3,
  notConfigured: 4,
  outsideDeviation: 5,
};

export enum MevWaiverBit {
  PUBLIC_MEMPOOL_OPT_IN = 1 << 0,
  SEQUENCER_DIRECT_FALLBACK_OPT_IN = 1 << 1,
  BUILDER_KEY_OUTAGE_OPT_IN = 1 << 2,
}

export enum ForceExitRiskBit {
  LOOSE_SLIPPAGE = 1 << 0,
  STALE_ORACLE_OVERRIDE = 1 << 1,
  INSUFFICIENT_CURVE_DEPTH = 1 << 2,
  SEQUENCER_DOWN_OVERRIDE = 1 << 3,
  VAULT_EVIDENCE_OVERRIDE = 1 << 4,
}

// Reverse lookups for round-trip parity.

export const PRIMARY_TYPE_FROM_U8: Record<number, PrimaryType> = Object.fromEntries(
  Object.entries(PRIMARY_TYPE_U8).map(([k, v]) => [v, k as PrimaryType]),
) as Record<number, PrimaryType>;

export const EXECUTION_KIND_FROM_U8: Record<number, ExecutionKind> = Object.fromEntries(
  Object.entries(EXECUTION_KIND_U8).map(([k, v]) => [v, k as ExecutionKind]),
) as Record<number, ExecutionKind>;

export const MEV_PROTECTION_MODE_FROM_U8: Record<number, MevProtectionMode> =
  Object.fromEntries(
    Object.entries(MEV_PROTECTION_MODE_U8).map(([k, v]) => [v, k as MevProtectionMode]),
  ) as Record<number, MevProtectionMode>;

export const POLICY_CLASS_FROM_U8: Record<number, PolicyClass> = Object.fromEntries(
  Object.entries(POLICY_CLASS_U8).map(([k, v]) => [v, k as PolicyClass]),
) as Record<number, PolicyClass>;

export const SOURCE_STATUS_FROM_U8: Record<number, SourceStatus> = Object.fromEntries(
  Object.entries(SOURCE_STATUS_U8).map(([k, v]) => [v, k as SourceStatus]),
) as Record<number, SourceStatus>;

// ─── PR-17 Gap 5: bitmask decoders ───────────────────────────────────────────
//
// Single source of truth for the human-facing copy that decodes
// `ForceExitRiskBit` and `MevWaiverBit` bitmasks. The app's previous
// `app/src/lib/risk-bits.ts` registry duplicates this; the follow-up commit
// removes the duplicate in favor of routing through these decoders.

/**
 * One decoded bit row — the set-bit's canonical PROTOCOL.md NAME plus a
 * plain-language description suitable for surfacing to a signer.
 */
export interface DecodedRiskBit {
  /** The bit's mask value (1 << index). */
  bit: number;
  /** PROTOCOL.md-canonical name (e.g., "STALE_ORACLE_OVERRIDE"). */
  name: string;
  /** User-facing copy explaining the implication of accepting the bit. */
  plainLanguage: string;
}

interface BitNameMap {
  bit: number;
  name: string;
  plainLanguage: string;
}

const FORCE_EXIT_RISK_BIT_REGISTRY: readonly BitNameMap[] = [
  {
    bit: ForceExitRiskBit.LOOSE_SLIPPAGE,
    name: "LOOSE_SLIPPAGE",
    plainLanguage:
      "Accept a wider slippage band than the normal exit allows. The loop may close at a worse price than a standard Exit.",
  },
  {
    bit: ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
    name: "STALE_ORACLE_OVERRIDE",
    plainLanguage:
      "Force-Exit even though the Chainlink oracle is stale. The HF and liquidation distance shown may not reflect current market price.",
  },
  {
    bit: ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH,
    name: "INSUFFICIENT_CURVE_DEPTH",
    plainLanguage:
      "Force-Exit even though Curve liquidity is below the configured swap depth. Expect material price impact.",
  },
  {
    bit: ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE,
    name: "SEQUENCER_DOWN_OVERRIDE",
    plainLanguage:
      "Force-Exit during Base sequencer downtime / grace. Submission via fallback channel may take longer to confirm.",
  },
  {
    bit: ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE,
    name: "VAULT_EVIDENCE_OVERRIDE",
    plainLanguage:
      "Force-Exit even though wstDIEM vault NAV evidence is stale. Collateral valuation may be inaccurate.",
  },
];

const MEV_WAIVER_BIT_REGISTRY: readonly BitNameMap[] = [
  {
    bit: MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN,
    name: "PUBLIC_MEMPOOL_OPT_IN",
    plainLanguage:
      "Allow submission via the public mempool. Sandwich-attack exposure increases; only accept when the policy is short-lived or the chosen builder is unavailable.",
  },
  {
    bit: MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN,
    name: "SEQUENCER_DIRECT_FALLBACK_OPT_IN",
    plainLanguage:
      "Allow the keeper to fall back to direct sequencer submission if the private builder is unreachable.",
  },
  {
    bit: MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN,
    name: "BUILDER_KEY_OUTAGE_OPT_IN",
    plainLanguage:
      "Allow submission to continue when the configured private builder key has been rotated out without the policy refresh.",
  },
];

/**
 * PR-17 audit m-do-1 closure: discriminated envelope so callers can detect
 * poisoned / future bits rather than silently dropping them. `known` is the
 * decoded subset that maps to registered bit names; `unknownMask` is the
 * subset of bits in `mask` that don't map to any known name — non-zero
 * means the signer is being asked to acknowledge something the UI cannot
 * render text for (§6.4 digest fidelity).
 */
export interface DecodedRiskBits {
  known: DecodedRiskBit[];
  unknownMask: number;
}

/** Sum of every bit declared in `FORCE_EXIT_RISK_BIT_REGISTRY`. */
const KNOWN_FORCE_EXIT_RISK_MASK: number = FORCE_EXIT_RISK_BIT_REGISTRY.reduce(
  (acc, b) => acc | b.bit,
  0,
);

/** Sum of every bit declared in `MEV_WAIVER_BIT_REGISTRY`. */
const KNOWN_MEV_WAIVER_MASK: number = MEV_WAIVER_BIT_REGISTRY.reduce(
  (acc, b) => acc | b.bit,
  0,
);

/**
 * PR-17 Gap 5: decode an `acknowledgedRisks` bitmask (uint8) into the
 * ordered list of set-bit descriptors plus the unknown-bit mask.
 * Empty `known` when no recognized bits are set; non-zero `unknownMask`
 * surfaces bits NOT registered in `ForceExitRiskBit` (e.g. a poisoned
 * action mixing `LOOSE_SLIPPAGE` with bit 7) so the UI can render a
 * fail-closed banner instead of silently dropping the surplus.
 */
export function decodeAcknowledgedRisks(mask: number): DecodedRiskBits {
  const known = FORCE_EXIT_RISK_BIT_REGISTRY
    .filter((b) => (mask & b.bit) === b.bit)
    .map((b) => ({ bit: b.bit, name: b.name, plainLanguage: b.plainLanguage }));
  const unknownMask = mask & ~KNOWN_FORCE_EXIT_RISK_MASK & 0xff;
  return { known, unknownMask };
}

/**
 * PR-17 Gap 5: decode a `mevWaiverBits` bitmask (uint8) into the ordered
 * list of set-bit descriptors plus the unknown-bit mask. Mirrors the
 * discriminated envelope of `decodeAcknowledgedRisks` so unknown waiver
 * bits cannot smuggle through silently.
 */
export function decodeMevWaiverBits(mask: number): DecodedRiskBits {
  const known = MEV_WAIVER_BIT_REGISTRY
    .filter((b) => (mask & b.bit) === b.bit)
    .map((b) => ({ bit: b.bit, name: b.name, plainLanguage: b.plainLanguage }));
  const unknownMask = mask & ~KNOWN_MEV_WAIVER_MASK & 0xff;
  return { known, unknownMask };
}
