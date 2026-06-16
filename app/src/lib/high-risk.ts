// High-risk action classification + EIP-1271 preimage attestation helpers.
//
// M-2 closure: G-PM-4 (I-66 preimage attestation) is a PROTOCOL.md §13.5
// line 1192 requirement. The previous useGpmGates hook returned undefined
// gate statuses unconditionally; once the Phase 5 preview populates
// `gateStatuses`, a Safe wallet with missing/zero
// `eip1271PreimageDisplayProof` could arm without enforcement.
//
// This module provides the frontend-side classification primitives so
// useGpmGates can synthesize a GateStatus[] for G-PM-4 even before the
// SDK extends `TransactionPreview` with the populated field.

import type { Action } from "@wstdiem/sdk";

const ZERO_BYTES32 = "0x" + "00".repeat(32);
const ZERO_BYTES32_NO_PREFIX = "0".repeat(64);

/** True when the action is a high-risk class:
 *   - ForceExit (always — bypasses standard exit protections)
 *   - Open / Rebalance with maxDebtIncrease > 0 (per I-66 §13.5)
 * This determines whether G-PM-4 EIP-1271 preimage attestation is required. */
export function isHighRiskAction(action: Action | undefined): boolean {
  if (!action) return false;
  if (action.primaryType === "ForceExit") return true;
  if ("maxDebtIncrease" in action) {
    const v = (action as { maxDebtIncrease?: bigint }).maxDebtIncrease;
    if (typeof v === "bigint") return v > 0n;
  }
  // Bounds-based fallback: an Open or RebalanceUp action whose bounds carry
  // a non-zero borrow ceiling is risk-increasing.
  if (
    action.primaryType === "Open" ||
    action.primaryType === "Rebalance" ||
    action.primaryType === "AutomationExec"
  ) {
    const bounds = (action as { bounds?: { maxBorrowedDiem?: bigint } }).bounds;
    if (bounds && typeof bounds.maxBorrowedDiem === "bigint") {
      return bounds.maxBorrowedDiem > 0n;
    }
  }
  return false;
}

/** True when the action's eip1271PreimageDisplayProof field is missing or
 * the canonical zero bytes32. Treated as fail-closed for high-risk +
 * smart-wallet flows. */
export function isEip1271PreimageMissing(
  action: { eip1271PreimageDisplayProof?: string } | undefined,
): boolean {
  if (!action) return true;
  const raw = (action.eip1271PreimageDisplayProof ?? "").toLowerCase();
  if (raw === "") return true;
  if (raw === ZERO_BYTES32) return true;
  // Tolerate both `0x` prefix presence and absence.
  if (raw === `0x${ZERO_BYTES32_NO_PREFIX}`) return true;
  if (raw === ZERO_BYTES32_NO_PREFIX) return true;
  return false;
}
