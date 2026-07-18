// Canonical viem-signable EIP-712 typed data for WSTDIEM actions.
//
// The `types` maps below are the source of truth for the canonical encodeType
// strings mirrored into LoopV1EIP712.sol and typehashes.ts. viem's
// hashTypedData({domain, types, primaryType, message}) over this module's output
// reproduces the contract's hashOpen(...) and the SDK's own digest byte-for-byte
// (proven in test/eip712-wallet-parity.test.ts).

import type { TypedDataDomain } from "viem";
import type { Action } from "../types/action.js";
import type { MorphoMarketParams, DigestSubHashes } from "./sub-hashes.js";
import { hashFeeCaps } from "./sub-hashes.js";
import {
  EXECUTION_KIND_U8,
  MEV_PROTECTION_MODE_U8,
  POLICY_CLASS_U8,
  PRIMARY_TYPE_U8,
} from "../types/enums.js";

// ─── Leaf struct field definitions (no nested struct references) ─────────────

const ActionIdentity = [
  { name: "owner", type: "address" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "market", type: "bytes32" },
  { name: "executor", type: "address" },
  { name: "registryVersion", type: "uint256" },
  { name: "registryMerkleRoot", type: "bytes32" },
  { name: "policyId", type: "uint64" },
  { name: "nonceSlot", type: "uint248" },
  { name: "nonceBit", type: "uint8" },
] as const;

const Freshness = [
  { name: "deadline", type: "uint256" },
  { name: "quoteBlockNumber", type: "uint256" },
  { name: "maxQuoteAgeBlocks", type: "uint256" },
  { name: "maxQuoteDeviationBps", type: "uint16" },
] as const;

const MorphoMarketParamsType = [
  { name: "loanToken", type: "address" },
  { name: "collateralToken", type: "address" },
  { name: "oracle", type: "address" },
  { name: "irm", type: "address" },
  { name: "lltv", type: "uint256" },
] as const;

const DigestHashes = [
  { name: "quoteHash", type: "bytes32" },
  { name: "spenderListHash", type: "bytes32" },
  { name: "allowanceScheduleHash", type: "bytes32" },
  { name: "feeCapHash", type: "bytes32" },
  { name: "evidenceBundleHash", type: "bytes32" },
] as const;

const OpenBounds = [
  { name: "minWstDiemReceived", type: "uint256" },
  { name: "minBorrowedDiem", type: "uint256" },
  { name: "maxBorrowedDiem", type: "uint256" },
  { name: "maxSlippageBps", type: "uint16" },
  { name: "maxPriceImpactBps", type: "uint16" },
  { name: "maxLeverageBps", type: "uint16" },
  { name: "minHealthFactor", type: "uint256" },
  { name: "minLiquidationDistanceBps", type: "uint16" },
  { name: "maxMorphoUtilizationImpactBps", type: "uint16" },
  { name: "feeCapsHash", type: "bytes32" },
] as const;

const RebalanceBounds = [
  { name: "targetLeverageBps", type: "uint16" },
  { name: "targetLeverageToleranceBps", type: "uint16" },
  { name: "minPostHealthFactor", type: "uint256" },
  { name: "minLiquidationDistanceBps", type: "uint16" },
  { name: "maxDebtIncrease", type: "uint256" },
  { name: "maxCollateralSold", type: "uint256" },
  { name: "maxSlippageBps", type: "uint16" },
  { name: "maxCurvePositionShareBps", type: "uint16" },
  { name: "maxMorphoUtilizationImpactBps", type: "uint16" },
  { name: "feeCapsHash", type: "bytes32" },
] as const;

const ExitBounds = [
  { name: "minRepayment", type: "uint256" },
  { name: "maxCollateralSold", type: "uint256" },
  { name: "maxSlippageBps", type: "uint16" },
  { name: "maxCurvePositionShareBps", type: "uint16" },
  { name: "maxMorphoUtilizationImpactBps", type: "uint16" },
  { name: "feeCapsHash", type: "bytes32" },
  { name: "repayOnly", type: "bool" },
  { name: "acceptsThirdPartyRepay", type: "bool" },
] as const;

const ForceExitBounds = [
  { name: "minRepayment", type: "uint256" },
  { name: "maxCollateralSold", type: "uint256" },
  { name: "looseSlippageBps", type: "uint16" },
  { name: "looseFlashFeeCap", type: "uint256" },
  { name: "maxCurvePositionShareBps", type: "uint16" },
  { name: "acknowledgedRisks", type: "uint8" },
] as const;

const RevokeBounds = [
  { name: "policyId", type: "uint64" },
  { name: "policyClass", type: "uint8" },
  { name: "effectiveBlock", type: "uint256" },
] as const;

const AutomationBounds = [
  { name: "triggerConditionHash", type: "bytes32" },
  { name: "underlyingPrimaryType", type: "uint8" },
  { name: "underlyingActionHash", type: "bytes32" },
  { name: "policyHash", type: "bytes32" },
  { name: "boundSubsetHash", type: "bytes32" },
  { name: "notBeforeBlock", type: "uint256" },
  { name: "notAfterBlock", type: "uint256" },
] as const;

// ─── Top-level action field definitions ──────────────────────────────────────

const marketActionFields = (boundsType: string) =>
  [
    { name: "identity", type: "ActionIdentity" },
    { name: "freshness", type: "Freshness" },
    { name: "executionKind", type: "uint8" },
    { name: "mevProtectionMode", type: "uint8" },
    { name: "mevWaiverBits", type: "uint8" },
    { name: "marketParams", type: "MorphoMarketParams" },
    { name: "bounds", type: boundsType },
    { name: "hashes", type: "DigestHashes" },
  ] as const;

const marketBase = {
  ActionIdentity,
  Freshness,
  MorphoMarketParams: MorphoMarketParamsType,
  DigestHashes,
} as const;

/**
 * viem `types` map per action primaryType. Field order/types are canonical: a
 * standard EIP-712 wallet computes the same digest the contract recomputes.
 */
export const ACTION_TYPES = {
  Open: { ...marketBase, OpenBounds, Open: marketActionFields("OpenBounds") },
  Rebalance: {
    ...marketBase,
    RebalanceBounds,
    Rebalance: marketActionFields("RebalanceBounds"),
  },
  Exit: { ...marketBase, ExitBounds, Exit: marketActionFields("ExitBounds") },
  ForceExit: {
    ...marketBase,
    ForceExitBounds,
    ForceExit: marketActionFields("ForceExitBounds"),
  },
  Revoke: {
    ActionIdentity,
    Freshness,
    DigestHashes,
    RevokeBounds,
    Revoke: [
      { name: "identity", type: "ActionIdentity" },
      { name: "freshness", type: "Freshness" },
      { name: "executionKind", type: "uint8" },
      { name: "bounds", type: "RevokeBounds" },
      { name: "hashes", type: "DigestHashes" },
    ] as const,
  },
  AutomationExec: {
    ActionIdentity,
    Freshness,
    DigestHashes,
    AutomationBounds,
    AutomationExec: [
      { name: "identity", type: "ActionIdentity" },
      { name: "freshness", type: "Freshness" },
      { name: "executionKind", type: "uint8" },
      { name: "mevProtectionMode", type: "uint8" },
      { name: "mevWaiverBits", type: "uint8" },
      { name: "bounds", type: "AutomationBounds" },
      { name: "hashes", type: "DigestHashes" },
    ] as const,
  },
} as const;

const ZERO32 = ("0x" + "00".repeat(32)) as `0x${string}`;

function identityMessage(action: Action) {
  return {
    owner: action.owner,
    chainId: BigInt(action.chainId),
    verifyingContract: action.verifyingContract,
    market: action.market,
    executor: action.executor,
    registryVersion: BigInt(action.registryVersion),
    registryMerkleRoot: action.registryMerkleRoot,
    policyId: BigInt(action.policyId),
    nonceSlot: action.nonceSlot,
    nonceBit: action.nonceBit,
  };
}

function freshnessMessage(action: Action) {
  return {
    deadline: BigInt(action.deadline),
    quoteBlockNumber: BigInt(action.quoteBlockNumber),
    maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
    maxQuoteDeviationBps: Number(action.maxQuoteDeviationBps),
  };
}

function hashesMessage(subHashes: DigestSubHashes) {
  return {
    quoteHash: subHashes.quoteHash,
    spenderListHash: subHashes.spenderListHash,
    allowanceScheduleHash: subHashes.allowanceScheduleHash,
    feeCapHash: subHashes.feeCapHash,
    evidenceBundleHash: subHashes.evidenceBundleHash,
  };
}

function marketParamsMessage(p: MorphoMarketParams) {
  return {
    loanToken: p.loanToken,
    collateralToken: p.collateralToken,
    oracle: p.oracle,
    irm: p.irm,
    lltv: p.lltv,
  };
}

function feeCapsHashFor(b: {
  flashFeeCap: bigint;
  protocolFeeCap: bigint;
  automationFeeCap: bigint;
}) {
  return hashFeeCaps({
    flashFeeCap: b.flashFeeCap,
    protocolFeeCap: b.protocolFeeCap,
    automationFeeCap: b.automationFeeCap,
  });
}

export interface ActionTypedData {
  domain: TypedDataDomain;
  types: unknown;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Build the canonical viem-signable typed data for an action. The produced
 * `message` mirrors the exact struct shape the contract's hashStruct composition
 * (and the SDK's computeDigest) consume — the Revoke / AutomationExec placeholder
 * bounds match dispatchDigest in sdk-impl.ts.
 */
export function buildActionTypedData(
  action: Action,
  marketParams: MorphoMarketParams,
  subHashes: DigestSubHashes,
  domain: TypedDataDomain,
): ActionTypedData {
  const identity = identityMessage(action);
  const freshness = freshnessMessage(action);
  const hashes = hashesMessage(subHashes);
  const types = ACTION_TYPES[action.primaryType];

  switch (action.primaryType) {
    case "Open": {
      const b = action.bounds;
      return {
        domain,
        types,
        primaryType: "Open",
        message: {
          identity,
          freshness,
          executionKind: EXECUTION_KIND_U8[action.executionKind],
          mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
          mevWaiverBits: action.mevWaiverBits,
          marketParams: marketParamsMessage(marketParams),
          bounds: {
            minWstDiemReceived: b.minWstDiemReceived,
            minBorrowedDiem: b.minBorrowedDiem,
            maxBorrowedDiem: b.maxBorrowedDiem,
            maxSlippageBps: Number(b.maxSlippageBps),
            maxPriceImpactBps: Number(b.maxPriceImpactBps),
            maxLeverageBps: Number(b.maxLeverageBps),
            minHealthFactor: b.minHealthFactor,
            minLiquidationDistanceBps: Number(b.minLiquidationDistanceBps),
            maxMorphoUtilizationImpactBps: Number(b.maxMorphoUtilizationImpactBps),
            feeCapsHash: feeCapsHashFor(b),
          },
          hashes,
        },
      };
    }
    case "Rebalance": {
      const b = action.bounds;
      return {
        domain,
        types,
        primaryType: "Rebalance",
        message: {
          identity,
          freshness,
          executionKind: EXECUTION_KIND_U8[action.executionKind],
          mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
          mevWaiverBits: action.mevWaiverBits,
          marketParams: marketParamsMessage(marketParams),
          bounds: {
            targetLeverageBps: Number(b.targetLeverageBps),
            targetLeverageToleranceBps: Number(b.targetLeverageToleranceBps),
            minPostHealthFactor: b.minPostHealthFactor,
            minLiquidationDistanceBps: Number(b.minLiquidationDistanceBps),
            maxDebtIncrease: b.maxDebtIncrease,
            maxCollateralSold: b.maxCollateralSold,
            maxSlippageBps: Number(b.maxSlippageBps),
            maxCurvePositionShareBps: Number(b.maxCurvePositionShareBps),
            maxMorphoUtilizationImpactBps: Number(b.maxMorphoUtilizationImpactBps),
            feeCapsHash: feeCapsHashFor(b),
          },
          hashes,
        },
      };
    }
    case "Exit": {
      const b = action.bounds;
      return {
        domain,
        types,
        primaryType: "Exit",
        message: {
          identity,
          freshness,
          executionKind: EXECUTION_KIND_U8[action.executionKind],
          mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
          mevWaiverBits: action.mevWaiverBits,
          marketParams: marketParamsMessage(marketParams),
          bounds: {
            minRepayment: b.minRepayment,
            maxCollateralSold: b.maxCollateralSold,
            maxSlippageBps: Number(b.maxSlippageBps),
            maxCurvePositionShareBps: Number(b.maxCurvePositionShareBps),
            maxMorphoUtilizationImpactBps: Number(b.maxMorphoUtilizationImpactBps),
            feeCapsHash: feeCapsHashFor(b),
            repayOnly: b.repayOnly,
            acceptsThirdPartyRepay: b.acceptsThirdPartyRepay,
          },
          hashes,
        },
      };
    }
    case "ForceExit": {
      const b = action.bounds;
      return {
        domain,
        types,
        primaryType: "ForceExit",
        message: {
          identity,
          freshness,
          executionKind: EXECUTION_KIND_U8[action.executionKind],
          mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
          mevWaiverBits: action.mevWaiverBits,
          marketParams: marketParamsMessage(marketParams),
          bounds: {
            minRepayment: b.minRepayment,
            maxCollateralSold: b.maxCollateralSold,
            looseSlippageBps: Number(b.looseSlippageBps),
            looseFlashFeeCap: b.looseFlashFeeCap,
            maxCurvePositionShareBps: Number(b.maxCurvePositionShareBps),
            acknowledgedRisks: b.acknowledgedRisks,
          },
          hashes,
        },
      };
    }
    case "Revoke": {
      // Mirrors dispatchDigest: Phase 1 revoke binds policyId only; effectiveBlock
      // is 0 and policyClass defaults to OPEN.
      return {
        domain,
        types,
        primaryType: "Revoke",
        message: {
          identity,
          freshness,
          executionKind: EXECUTION_KIND_U8[action.executionKind],
          bounds: {
            policyId:
              action.revokePolicyId !== undefined
                ? BigInt(action.revokePolicyId)
                : 0n,
            policyClass: POLICY_CLASS_U8.OPEN,
            effectiveBlock: 0n,
          },
          hashes,
        },
      };
    }
    case "AutomationExec": {
      // Mirrors dispatchDigest's placeholder AutomationBounds.
      return {
        domain,
        types,
        primaryType: "AutomationExec",
        message: {
          identity,
          freshness,
          executionKind: EXECUTION_KIND_U8[action.executionKind],
          mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
          mevWaiverBits: action.mevWaiverBits,
          bounds: {
            triggerConditionHash: action.triggerConditionHash,
            underlyingPrimaryType: PRIMARY_TYPE_U8[action.underlyingPrimaryType],
            underlyingActionHash: action.underlyingBoundsHash,
            policyHash: ZERO32,
            boundSubsetHash: ZERO32,
            notBeforeBlock: 0n,
            notAfterBlock: 0n,
          },
          hashes,
        },
      };
    }
  }
}
