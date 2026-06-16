// State-bit metadata per PROTOCOL.md §7.1.
// 11 named bits + 5 reserved (bitmap is uint16; bits 11-15 reserved for
// forward-compat). The synthesis Storybook fixture requirement covers all 16
// slots — D.5 Evidence grid renders 16 cells, not 11.

import { StateBit, KNOWN_STATE_MASK } from "@wstdiem/sdk";

export interface StateBitMeta {
  /** The uint16 bit index (0-15). */
  index: number;
  /** The bit's mask value (1 << index). undefined for reserved slots. */
  mask: number | undefined;
  /** PROTOCOL.md-canonical name. "RESERVED_{n}" for unnamed forward-compat slots. */
  name: string;
  /** Plain-language label shown next to the cell. */
  label: string;
  /** Short tooltip / hover copy explaining the bit's effect on action classes. */
  plainLanguage: string;
}

export const STATE_BIT_REGISTRY: readonly StateBitMeta[] = [
  {
    index: 0,
    mask: StateBit.AUDIT_GATE_CLOSED,
    name: "AUDIT_GATE_CLOSED",
    label: "Audit gate closed",
    plainLanguage:
      "Open / Rebalance / Exit / Force-Exit blocked. Revoke remains available.",
  },
  {
    index: 1,
    mask: StateBit.CONFIG_INTEGRITY_FAILURE,
    name: "CONFIG_INTEGRITY_FAILURE",
    label: "Config integrity failure",
    plainLanguage:
      "Registry or executor configuration changed in a way the SDK detected as inconsistent. All actions blocked.",
  },
  {
    index: 2,
    mask: StateBit.PAUSE_OPEN_INCREASE,
    name: "PAUSE_OPEN_INCREASE",
    label: "Open / Increase paused",
    plainLanguage:
      "Open and risk-increasing Rebalance blocked. Reduce / Exit / Revoke remain available.",
  },
  {
    index: 3,
    mask: StateBit.ORACLE_DEGRADED,
    name: "ORACLE_DEGRADED",
    label: "Oracle degraded",
    plainLanguage:
      "Chainlink answer is stale or outside the deviation envelope. Risk-increasing actions blocked; repay-only Exit remains available.",
  },
  {
    index: 4,
    mask: StateBit.CURVE_LIQUIDITY_INSUFFICIENT,
    name: "CURVE_LIQUIDITY_INSUFFICIENT",
    label: "Curve liquidity low",
    plainLanguage:
      "Insufficient depth in the Curve pool to swap collateral at the configured slippage. Curve-route Exit blocked; repay-only and Rebalance ↑ remain available.",
  },
  {
    index: 5,
    mask: StateBit.FLASH_LIQUIDITY_UNAVAILABLE,
    name: "FLASH_LIQUIDITY_UNAVAILABLE",
    label: "Flash liquidity unavailable",
    plainLanguage:
      "The Uniswap V3 flash pool cannot service the loan. Open / Rebalance / Curve-route Exit blocked.",
  },
  {
    index: 6,
    mask: StateBit.MORPHO_OWNER_EVIDENCE_MISSING,
    name: "MORPHO_OWNER_EVIDENCE_MISSING",
    label: "Morpho owner evidence missing",
    plainLanguage:
      "The indexer cannot prove the user's Morpho position. All actions touching the position blocked until evidence refresh.",
  },
  {
    index: 7,
    mask: StateBit.SEQUENCER_DOWN_OR_GRACE,
    name: "SEQUENCER_DOWN_OR_GRACE",
    label: "Sequencer down / grace",
    plainLanguage:
      "Base sequencer is reporting down or within the post-recovery grace window. Repay-only Exit remains available; everything else blocked.",
  },
  {
    index: 8,
    mask: StateBit.INCIDENT_INVESTIGATING,
    name: "INCIDENT_INVESTIGATING",
    label: "Incident: investigating",
    plainLanguage:
      "EmergencyGuardian set state to INVESTIGATING. All actions blocked except Revoke.",
  },
  {
    index: 9,
    mask: StateBit.INCIDENT_MITIGATING,
    name: "INCIDENT_MITIGATING",
    label: "Incident: mitigating",
    plainLanguage:
      "EmergencyGuardian set state to MITIGATING. All actions blocked except Revoke.",
  },
  {
    index: 10,
    mask: StateBit.VAULT_EVIDENCE_MISSING,
    name: "VAULT_EVIDENCE_MISSING",
    label: "Vault evidence missing",
    plainLanguage:
      "The wstDIEM vault NAV evidence is stale or absent. Risk-increasing actions blocked.",
  },
  // Reserved slots — surface in D.5 grid so forward-compat additions don't
  // re-author the grid. PROTOCOL.md reserves bits 11..15 for future named state bits.
  { index: 11, mask: undefined, name: "RESERVED_11", label: "Reserved", plainLanguage: "Reserved for future use." },
  { index: 12, mask: undefined, name: "RESERVED_12", label: "Reserved", plainLanguage: "Reserved for future use." },
  { index: 13, mask: undefined, name: "RESERVED_13", label: "Reserved", plainLanguage: "Reserved for future use." },
  { index: 14, mask: undefined, name: "RESERVED_14", label: "Reserved", plainLanguage: "Reserved for future use." },
  { index: 15, mask: undefined, name: "RESERVED_15", label: "Reserved", plainLanguage: "Reserved for future use." },
];

/** Return the set named bits in a bitmap (skips reserved slots). */
export function setBitsIn(bitmap: number): readonly StateBitMeta[] {
  return STATE_BIT_REGISTRY.filter(
    (b) => b.mask !== undefined && (bitmap & b.mask) === b.mask,
  );
}

/** Returns true if any reserved bit is set in the bitmap — a fail-closed signal
 * per synthesis §G15 ("unknown high bits fail closed"). */
export function hasUnknownBits(bitmap: number): boolean {
  return (bitmap & ~KNOWN_STATE_MASK) !== 0;
}
