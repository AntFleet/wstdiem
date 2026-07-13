// Force-Exit risk-waiver helpers (audit C / PROTOCOL §6.3 / I-67).
//
// Maps live §7.1 state-bitmap bits onto ForceExitRiskBit overrides, enforces
// "required bits covered", and enforces Phase-1 waiver minimality (at most one
// critical override bit per signed ForceExit digest).

import { ForceExitRiskBit } from "../types/enums.js";
import { StateBit } from "../types/evidence.js";

/** Critical override bits subject to I-67 single-bit maximality. */
export const FORCE_EXIT_CRITICAL_RISK_MASK =
  ForceExitRiskBit.STALE_ORACLE_OVERRIDE |
  ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH |
  ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE |
  ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE;

const CRITICAL_BITS: readonly number[] = [
  ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
  ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH,
  ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE,
  ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE,
];

/**
 * Derive the ForceExit `acknowledgedRisks` bits that on-chain
 * `validateLiveStateBitmap` will demand for the given §7.1 state bitmap.
 */
export function requiredForceExitRiskBitsFromStateBitmap(
  stateBitmap: number,
): number {
  let mask = 0;
  if (stateBitmap & StateBit.ORACLE_DEGRADED) {
    mask |= ForceExitRiskBit.STALE_ORACLE_OVERRIDE;
  }
  if (stateBitmap & StateBit.CURVE_LIQUIDITY_INSUFFICIENT) {
    mask |= ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH;
  }
  if (stateBitmap & StateBit.SEQUENCER_DOWN_OR_GRACE) {
    mask |= ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE;
  }
  if (stateBitmap & StateBit.VAULT_EVIDENCE_MISSING) {
    mask |= ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE;
  }
  return mask & 0xff;
}

/** Count how many I-67 critical override bits are set. */
export function countCriticalForceExitRiskBits(mask: number): number {
  let n = 0;
  for (const bit of CRITICAL_BITS) {
    if ((mask & bit) === bit) n += 1;
  }
  return n;
}

/**
 * At most one critical override bit (I-67 / ForceExitWaiverOverbroad).
 * LOOSE_SLIPPAGE is non-critical and may combine with a single critical bit.
 */
export function assertForceExitWaiverMinimality(acknowledgedRisks: number): void {
  const critical = acknowledgedRisks & FORCE_EXIT_CRITICAL_RISK_MASK;
  if (critical !== 0 && (critical & (critical - 1)) !== 0) {
    throw new Error(
      `ForceExitWaiverOverbroad: multiple critical risk override bits set ` +
        `(0x${critical.toString(16)}). Phase 1 allows at most one of ` +
        `STALE_ORACLE / CURVE_DEPTH / SEQUENCER_DOWN / VAULT_EVIDENCE.`,
    );
  }
}

/**
 * Every live-required override bit must be set in the signed mask
 * (AckRiskBitMissing on-chain otherwise).
 */
export function assertForceExitRisksCoverRequired(
  acknowledgedRisks: number,
  requiredRisks: number,
): void {
  const missing = requiredRisks & ~acknowledgedRisks & 0xff;
  if (missing !== 0) {
    throw new Error(
      `AckRiskBitMissing: required risk bits 0x${requiredRisks.toString(16)} ` +
        `not covered by acknowledgedRisks 0x${acknowledgedRisks.toString(16)} ` +
        `(missing 0x${missing.toString(16)}).`,
    );
  }
  assertForceExitWaiverMinimality(acknowledgedRisks);
}

/**
 * True when live state needs more than one critical override — ForceExit is
 * impossible under I-67 until the market recovers to a single-degraded-bit
 * (or healthy) surface.
 */
export function forceExitBlockedByMultiCritical(
  requiredRisks: number,
): boolean {
  return countCriticalForceExitRiskBits(requiredRisks) > 1;
}
