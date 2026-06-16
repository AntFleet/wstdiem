// I-66 EIP-1271 preimage display attestation helper per
// the SDK type definitions §A4 NF-15 + PB1.2 encoding rule.
//
// Wallets on the registry-pinned preimage-display-guaranteed allow-list bypass
// the proof check. For all other smart-wallet signers on high-risk actions the
// SDK must compute this hash from the signed digest's fields and supply it as
// `eip1271PreimageDisplayProof`; LoopAuthorization.validateHighRiskPolicy
// recomputes from its own arguments and asserts equality.

import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import type {
  Address,
  Bytes32,
  Hex,
  MarketId,
  UnixSeconds,
} from "../types/branded.js";
import {
  EXECUTION_KIND_U8,
  MEV_PROTECTION_MODE_U8,
  POLICY_CLASS_U8,
  PRIMARY_TYPE_U8,
  type ExecutionKind,
  type MevProtectionMode,
  type PolicyClass,
  type PrimaryType,
} from "../types/enums.js";
import { PREIMAGE_PROOF_TYPEHASH } from "../eip712/typehashes.js";

export interface PreimageProofInputs {
  owner: Address;
  primaryType: PrimaryType;
  executionKind: ExecutionKind;
  mevProtectionMode: MevProtectionMode;
  mevWaiverBits: number;
  acknowledgedRisks: number;
  policyClass: PolicyClass;
  market: MarketId;
  registryVersion: bigint;
  nonceSlot: bigint;
  nonceBit: number;
  maxCollateralSold: bigint;
  maxDebtIncrease: bigint;
  deadline: UnixSeconds;
  verifyingContract: Address;
}

const PREIMAGE_PROOF_PARAMS = parseAbiParameters(
  "bytes32, address, uint8, uint8, uint8, uint8, uint8, uint8, bytes32, uint256, uint248, uint8, uint256, uint256, uint256, address",
);

/** Compute the bytes32 attestation that the wallet returns as
 * `eip1271PreimageDisplayProof`. */
export function computePreimageDisplayProof(inputs: PreimageProofInputs): Hex {
  return keccak256(
    encodeAbiParameters(PREIMAGE_PROOF_PARAMS, [
      PREIMAGE_PROOF_TYPEHASH,
      inputs.owner,
      PRIMARY_TYPE_U8[inputs.primaryType],
      EXECUTION_KIND_U8[inputs.executionKind],
      MEV_PROTECTION_MODE_U8[inputs.mevProtectionMode],
      inputs.mevWaiverBits,
      inputs.acknowledgedRisks,
      POLICY_CLASS_U8[inputs.policyClass],
      inputs.market,
      inputs.registryVersion,
      inputs.nonceSlot,
      inputs.nonceBit,
      inputs.maxCollateralSold,
      inputs.maxDebtIncrease,
      BigInt(inputs.deadline),
      inputs.verifyingContract,
    ]),
  );
}

/** High-risk classification rule per the SDK type definitions §A1 cross-cutting
 * EIP-1271 row. Decision is digest-content-only (no registry lookups).
 *
 * SECURITY NOTE: For AutomationExec, the caller supplies `isUnderlyingHighRisk`
 * directly. A caller can lie. The on-chain `validateHighRiskPolicy` still fires
 * from digest content (underlying primaryType is bound in the AutomationExec
 * digest), so a lie here only bypasses the SDK's own pre-sign gate — it does NOT
 * grant the action a successful on-chain execution. Prefer `isHighRiskFromAction`
 * below when you hold the full Action union; it derives the underlying flag from
 * `action.underlyingPrimaryType` and removes the caller-trust gap. */
export function isHighRiskByDigest(opts: {
  primaryType: PrimaryType;
  maxDebtIncrease?: bigint;
  isUnderlyingHighRisk?: boolean;
}): boolean {
  switch (opts.primaryType) {
    case "Open":
    case "ForceExit":
      return true;
    case "Rebalance":
      return (opts.maxDebtIncrease ?? 0n) > 0n;
    case "AutomationExec":
      return opts.isUnderlyingHighRisk === true;
    case "Exit":
    case "Revoke":
      return false;
  }
}

/** Derive high-risk classification from a typed Action union. Removes the
 * caller-trust gap in `isHighRiskByDigest` for AutomationExec — the underlying
 * primaryType is read directly from `action.underlyingPrimaryType`, which is
 * itself bound into the AutomationExec digest, so this matches the on-chain
 * validateHighRiskPolicy classification exactly.
 *
 * For an AutomationExec wrapping a Rebalance underlying, the SDK conservatively
 * returns true regardless of the underlying maxDebtIncrease (which is not
 * directly readable from the AutomationExec action — only its underlyingBoundsHash
 * is bound). Callers that hold the underlying RebalanceAction may use the more
 * precise `isHighRiskByDigest` variant. */
export function isHighRiskFromAction(action: {
  primaryType: PrimaryType;
  bounds?: { maxDebtIncrease?: bigint };
  underlyingPrimaryType?: Exclude<PrimaryType, "AutomationExec" | "Revoke">;
}): boolean {
  switch (action.primaryType) {
    case "Open":
    case "ForceExit":
      return true;
    case "Rebalance":
      return (action.bounds?.maxDebtIncrease ?? 0n) > 0n;
    case "AutomationExec": {
      const u = action.underlyingPrimaryType;
      if (!u) {
        throw new Error(
          "isHighRiskFromAction(AutomationExec) requires action.underlyingPrimaryType",
        );
      }
      if (u === "Open" || u === "ForceExit" || u === "Rebalance") return true;
      return false;
    }
    case "Exit":
    case "Revoke":
      return false;
  }
}

/** Convenience for the high-risk classification: returns whether the SDK must
 * compute and attach a preimage proof for the action, OR the signer must be on
 * the registry preimage-display-guaranteed allow-list. */
export function requiresPreimageProof(opts: {
  primaryType: PrimaryType;
  maxDebtIncrease?: bigint;
  isUnderlyingHighRisk?: boolean;
  signerOnAllowList: boolean;
}): boolean {
  if (opts.signerOnAllowList) return false;
  return isHighRiskByDigest(opts);
}

export interface PreimageProofWithExpectedFields {
  proof: Bytes32;
  attestedFields: Omit<PreimageProofInputs, "owner" | "verifyingContract">;
}

/** Builder helper that captures the field bag plus the computed proof so the
 * caller can present both to the wallet as a display-and-sign payload. */
export function buildPreimageProof(
  inputs: PreimageProofInputs,
): PreimageProofWithExpectedFields {
  return {
    proof: computePreimageDisplayProof(inputs) as Bytes32,
    attestedFields: {
      primaryType: inputs.primaryType,
      executionKind: inputs.executionKind,
      mevProtectionMode: inputs.mevProtectionMode,
      mevWaiverBits: inputs.mevWaiverBits,
      acknowledgedRisks: inputs.acknowledgedRisks,
      policyClass: inputs.policyClass,
      market: inputs.market,
      registryVersion: inputs.registryVersion,
      nonceSlot: inputs.nonceSlot,
      nonceBit: inputs.nonceBit,
      maxCollateralSold: inputs.maxCollateralSold,
      maxDebtIncrease: inputs.maxDebtIncrease,
      deadline: inputs.deadline,
    },
  };
}
