// Action digest construction per LoopV1Hashing. Each function mirrors the
// corresponding hashOpen/hashRebalance/... function in
// contracts/v2/libraries/LoopV1Hashing.sol byte-for-byte.

import {
  concat,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Hex as ViemHex,
} from "viem";
import type {
  ActionDigest,
  Bytes32,
  Hex,
} from "../types/branded.js";
import type {
  Action,
  OpenAction,
  RebalanceAction,
  ExitAction,
  ForceExitAction,
  AutomationExecAction,
  RevokeAction,
} from "../types/action.js";
import {
  EXECUTION_KIND_U8,
  MEV_PROTECTION_MODE_U8,
  POLICY_CLASS_U8,
  PRIMARY_TYPE_U8,
  type PolicyClass,
} from "../types/enums.js";
import {
  OPEN_TYPEHASH,
  REBALANCE_TYPEHASH,
  EXIT_TYPEHASH,
  FORCE_EXIT_TYPEHASH,
  REVOKE_TYPEHASH,
  AUTOMATION_EXEC_TYPEHASH,
} from "./typehashes.js";
import {
  hashIdentity,
  hashFreshness,
  hashMarketParams,
  hashDigestHashes,
  hashOpenBounds,
  hashRebalanceBounds,
  hashExitBounds,
  hashForceExitBounds,
  hashRevokeBounds,
  hashAutomationBounds,
  type DigestSubHashes,
  type MorphoMarketParams,
  type AutomationBoundsInputs,
} from "./sub-hashes.js";

const ACTION_PARAMS_WITH_MARKET = parseAbiParameters(
  "bytes32, bytes32, bytes32, uint8, uint8, uint8, bytes32, bytes32, bytes32",
);
const REVOKE_PARAMS = parseAbiParameters("bytes32, bytes32, bytes32, uint8, bytes32, bytes32");
const AUTOMATION_PARAMS = parseAbiParameters(
  "bytes32, bytes32, bytes32, uint8, uint8, uint8, bytes32, bytes32",
);

const EIP712_PREFIX = "0x1901" as const;

function toTyped(domainSeparator: Bytes32, structHash: Hex): ActionDigest {
  return keccak256(
    concat([EIP712_PREFIX, domainSeparator, structHash] as ViemHex[]),
  ) as ActionDigest;
}

export interface OpenDigestInputs {
  action: OpenAction;
  domainSeparator: Bytes32;
  marketParams: MorphoMarketParams;
  subHashes: DigestSubHashes;
}

export function computeOpenDigest(inputs: OpenDigestInputs): ActionDigest {
  const { action, domainSeparator, marketParams, subHashes } = inputs;
  const identityHash = hashIdentity({
    owner: action.owner,
    chainId: action.chainId,
    verifyingContract: action.verifyingContract,
    market: action.market,
    executor: action.executor,
    registryVersion: BigInt(action.registryVersion),
    registryMerkleRoot: action.registryMerkleRoot,
    policyId: BigInt(action.policyId),
    nonceSlot: action.nonceSlot,
    nonceBit: action.nonceBit,
  });
  const freshnessHash = hashFreshness({
    deadline: BigInt(action.deadline),
    quoteBlockNumber: BigInt(action.quoteBlockNumber),
    maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
    maxQuoteDeviationBps: action.maxQuoteDeviationBps,
  });
  const boundsHash = hashOpenBounds({
    minWstDiemReceived: action.bounds.minWstDiemReceived,
    minBorrowedDiem: action.bounds.minBorrowedDiem,
    maxBorrowedDiem: action.bounds.maxBorrowedDiem,
    maxSlippageBps: action.bounds.maxSlippageBps,
    maxPriceImpactBps: action.bounds.maxPriceImpactBps,
    maxLeverageBps: action.bounds.maxLeverageBps,
    minHealthFactor: action.bounds.minHealthFactor,
    minLiquidationDistanceBps: action.bounds.minLiquidationDistanceBps,
    maxMorphoUtilizationImpactBps: action.bounds.maxMorphoUtilizationImpactBps,
    feeCaps: {
      flashFeeCap: action.bounds.flashFeeCap,
      protocolFeeCap: action.bounds.protocolFeeCap,
      automationFeeCap: action.bounds.automationFeeCap,
    },
  });
  const structHash = keccak256(
    encodeAbiParameters(ACTION_PARAMS_WITH_MARKET, [
      OPEN_TYPEHASH,
      identityHash,
      freshnessHash,
      EXECUTION_KIND_U8[action.executionKind],
      MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      action.mevWaiverBits,
      hashMarketParams(marketParams),
      boundsHash,
      hashDigestHashes(subHashes),
    ]),
  );
  return toTyped(domainSeparator, structHash);
}

export interface RebalanceDigestInputs {
  action: RebalanceAction;
  domainSeparator: Bytes32;
  marketParams: MorphoMarketParams;
  subHashes: DigestSubHashes;
}

export function computeRebalanceDigest(inputs: RebalanceDigestInputs): ActionDigest {
  const { action, domainSeparator, marketParams, subHashes } = inputs;
  const identityHash = hashIdentity({
    owner: action.owner,
    chainId: action.chainId,
    verifyingContract: action.verifyingContract,
    market: action.market,
    executor: action.executor,
    registryVersion: BigInt(action.registryVersion),
    registryMerkleRoot: action.registryMerkleRoot,
    policyId: BigInt(action.policyId),
    nonceSlot: action.nonceSlot,
    nonceBit: action.nonceBit,
  });
  const freshnessHash = hashFreshness({
    deadline: BigInt(action.deadline),
    quoteBlockNumber: BigInt(action.quoteBlockNumber),
    maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
    maxQuoteDeviationBps: action.maxQuoteDeviationBps,
  });
  const boundsHash = hashRebalanceBounds({
    targetLeverageBps: action.bounds.targetLeverageBps,
    targetLeverageToleranceBps: action.bounds.targetLeverageToleranceBps,
    minPostHealthFactor: action.bounds.minPostHealthFactor,
    minLiquidationDistanceBps: action.bounds.minLiquidationDistanceBps,
    maxDebtIncrease: action.bounds.maxDebtIncrease,
    maxCollateralSold: action.bounds.maxCollateralSold,
    maxSlippageBps: action.bounds.maxSlippageBps,
    maxCurvePositionShareBps: action.bounds.maxCurvePositionShareBps,
    maxMorphoUtilizationImpactBps: action.bounds.maxMorphoUtilizationImpactBps,
    feeCaps: {
      flashFeeCap: action.bounds.flashFeeCap,
      protocolFeeCap: action.bounds.protocolFeeCap,
      automationFeeCap: action.bounds.automationFeeCap,
    },
  });
  const structHash = keccak256(
    encodeAbiParameters(ACTION_PARAMS_WITH_MARKET, [
      REBALANCE_TYPEHASH,
      identityHash,
      freshnessHash,
      EXECUTION_KIND_U8[action.executionKind],
      MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      action.mevWaiverBits,
      hashMarketParams(marketParams),
      boundsHash,
      hashDigestHashes(subHashes),
    ]),
  );
  return toTyped(domainSeparator, structHash);
}

export interface ExitDigestInputs {
  action: ExitAction;
  domainSeparator: Bytes32;
  marketParams: MorphoMarketParams;
  subHashes: DigestSubHashes;
}

export function computeExitDigest(inputs: ExitDigestInputs): ActionDigest {
  const { action, domainSeparator, marketParams, subHashes } = inputs;
  const identityHash = hashIdentity({
    owner: action.owner,
    chainId: action.chainId,
    verifyingContract: action.verifyingContract,
    market: action.market,
    executor: action.executor,
    registryVersion: BigInt(action.registryVersion),
    registryMerkleRoot: action.registryMerkleRoot,
    policyId: BigInt(action.policyId),
    nonceSlot: action.nonceSlot,
    nonceBit: action.nonceBit,
  });
  const freshnessHash = hashFreshness({
    deadline: BigInt(action.deadline),
    quoteBlockNumber: BigInt(action.quoteBlockNumber),
    maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
    maxQuoteDeviationBps: action.maxQuoteDeviationBps,
  });
  const boundsHash = hashExitBounds({
    minRepayment: action.bounds.minRepayment,
    maxCollateralSold: action.bounds.maxCollateralSold,
    maxSlippageBps: action.bounds.maxSlippageBps,
    maxCurvePositionShareBps: action.bounds.maxCurvePositionShareBps,
    maxMorphoUtilizationImpactBps: action.bounds.maxMorphoUtilizationImpactBps,
    feeCaps: {
      flashFeeCap: action.bounds.flashFeeCap,
      protocolFeeCap: action.bounds.protocolFeeCap,
      automationFeeCap: action.bounds.automationFeeCap,
    },
    repayOnly: action.bounds.repayOnly,
    acceptsThirdPartyRepay: action.bounds.acceptsThirdPartyRepay,
  });
  const structHash = keccak256(
    encodeAbiParameters(ACTION_PARAMS_WITH_MARKET, [
      EXIT_TYPEHASH,
      identityHash,
      freshnessHash,
      EXECUTION_KIND_U8[action.executionKind],
      MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      action.mevWaiverBits,
      hashMarketParams(marketParams),
      boundsHash,
      hashDigestHashes(subHashes),
    ]),
  );
  return toTyped(domainSeparator, structHash);
}

export interface ForceExitDigestInputs {
  action: ForceExitAction;
  domainSeparator: Bytes32;
  marketParams: MorphoMarketParams;
  subHashes: DigestSubHashes;
}

export function computeForceExitDigest(inputs: ForceExitDigestInputs): ActionDigest {
  const { action, domainSeparator, marketParams, subHashes } = inputs;
  const identityHash = hashIdentity({
    owner: action.owner,
    chainId: action.chainId,
    verifyingContract: action.verifyingContract,
    market: action.market,
    executor: action.executor,
    registryVersion: BigInt(action.registryVersion),
    registryMerkleRoot: action.registryMerkleRoot,
    policyId: BigInt(action.policyId),
    nonceSlot: action.nonceSlot,
    nonceBit: action.nonceBit,
  });
  const freshnessHash = hashFreshness({
    deadline: BigInt(action.deadline),
    quoteBlockNumber: BigInt(action.quoteBlockNumber),
    maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
    maxQuoteDeviationBps: action.maxQuoteDeviationBps,
  });
  const boundsHash = hashForceExitBounds({
    minRepayment: action.bounds.minRepayment,
    maxCollateralSold: action.bounds.maxCollateralSold,
    looseSlippageBps: action.bounds.looseSlippageBps,
    looseFlashFeeCap: action.bounds.looseFlashFeeCap,
    maxCurvePositionShareBps: action.bounds.maxCurvePositionShareBps,
    acknowledgedRisks: action.bounds.acknowledgedRisks,
  });
  const structHash = keccak256(
    encodeAbiParameters(ACTION_PARAMS_WITH_MARKET, [
      FORCE_EXIT_TYPEHASH,
      identityHash,
      freshnessHash,
      EXECUTION_KIND_U8[action.executionKind],
      MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      action.mevWaiverBits,
      hashMarketParams(marketParams),
      boundsHash,
      hashDigestHashes(subHashes),
    ]),
  );
  return toTyped(domainSeparator, structHash);
}

export interface RevokeDigestInputs {
  action: RevokeAction;
  domainSeparator: Bytes32;
  subHashes: DigestSubHashes;
  effectiveBlock: bigint;
  policyClass: PolicyClass;
}

export function computeRevokeDigest(inputs: RevokeDigestInputs): ActionDigest {
  const { action, domainSeparator, subHashes, effectiveBlock, policyClass } = inputs;
  // Phase 1: digest-targeted revoke is unsupported. RevokeBounds.policyId is
  // the only digest-bound revocation field. If action.revokeDigest is set, the
  // caller intends a digest-specific revoke which the on-chain RevokeBounds
  // struct does not encode; falling back to policyId=0 would silently misroute
  // intent (revoking policy 0 instead of the targeted digest).
  if (action.revokeDigest !== undefined && action.revokePolicyId === undefined) {
    throw new Error(
      "Phase 1 Revoke supports revokePolicyId only; digest-targeted revoke is not in RevokeBounds. " +
        "Reserved for Phase G.",
    );
  }
  const identityHash = hashIdentity({
    owner: action.owner,
    chainId: action.chainId,
    verifyingContract: action.verifyingContract,
    market: action.market,
    executor: action.executor,
    registryVersion: BigInt(action.registryVersion),
    registryMerkleRoot: action.registryMerkleRoot,
    policyId: BigInt(action.policyId),
    nonceSlot: action.nonceSlot,
    nonceBit: action.nonceBit,
  });
  const freshnessHash = hashFreshness({
    deadline: BigInt(action.deadline),
    quoteBlockNumber: BigInt(action.quoteBlockNumber),
    maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
    maxQuoteDeviationBps: action.maxQuoteDeviationBps,
  });
  const boundsHash = hashRevokeBounds({
    policyId: action.revokePolicyId !== undefined ? BigInt(action.revokePolicyId) : 0n,
    policyClass: POLICY_CLASS_U8[policyClass],
    effectiveBlock,
  });
  const structHash = keccak256(
    encodeAbiParameters(REVOKE_PARAMS, [
      REVOKE_TYPEHASH,
      identityHash,
      freshnessHash,
      EXECUTION_KIND_U8[action.executionKind],
      boundsHash,
      hashDigestHashes(subHashes),
    ]),
  );
  return toTyped(domainSeparator, structHash);
}

export interface AutomationExecDigestInputs {
  action: AutomationExecAction;
  domainSeparator: Bytes32;
  subHashes: DigestSubHashes;
  bounds: AutomationBoundsInputs;
}

export function computeAutomationExecDigest(
  inputs: AutomationExecDigestInputs,
): ActionDigest {
  const { action, domainSeparator, subHashes, bounds: rawBounds } = inputs;
  // Defense: override caller-supplied bounds.underlyingPrimaryType with the
  // typed Action's value. A caller cannot bind an AutomationExec digest whose
  // bounds claim a different underlying primaryType than the typed Action —
  // the on-chain expectation is that bounds.underlyingPrimaryType matches
  // action.underlyingPrimaryType.
  const bounds: AutomationBoundsInputs = {
    ...rawBounds,
    underlyingPrimaryType: PRIMARY_TYPE_U8[action.underlyingPrimaryType],
  };
  const identityHash = hashIdentity({
    owner: action.owner,
    chainId: action.chainId,
    verifyingContract: action.verifyingContract,
    market: action.market,
    executor: action.executor,
    registryVersion: BigInt(action.registryVersion),
    registryMerkleRoot: action.registryMerkleRoot,
    policyId: BigInt(action.policyId),
    nonceSlot: action.nonceSlot,
    nonceBit: action.nonceBit,
  });
  const freshnessHash = hashFreshness({
    deadline: BigInt(action.deadline),
    quoteBlockNumber: BigInt(action.quoteBlockNumber),
    maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
    maxQuoteDeviationBps: action.maxQuoteDeviationBps,
  });
  const boundsHash = hashAutomationBounds(bounds);
  const structHash = keccak256(
    encodeAbiParameters(AUTOMATION_PARAMS, [
      AUTOMATION_EXEC_TYPEHASH,
      identityHash,
      freshnessHash,
      EXECUTION_KIND_U8[action.executionKind],
      MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      action.mevWaiverBits,
      boundsHash,
      hashDigestHashes(subHashes),
    ]),
  );
  return toTyped(domainSeparator, structHash);
}

// Discriminated dispatcher for callers that hold a raw Action union.
export type DigestInputs =
  | ({ kind: "Open" } & OpenDigestInputs)
  | ({ kind: "Rebalance" } & RebalanceDigestInputs)
  | ({ kind: "Exit" } & ExitDigestInputs)
  | ({ kind: "ForceExit" } & ForceExitDigestInputs)
  | ({ kind: "Revoke" } & RevokeDigestInputs)
  | ({ kind: "AutomationExec" } & AutomationExecDigestInputs);

export function computeDigest(input: DigestInputs): ActionDigest {
  switch (input.kind) {
    case "Open":
      return computeOpenDigest(input);
    case "Rebalance":
      return computeRebalanceDigest(input);
    case "Exit":
      return computeExitDigest(input);
    case "ForceExit":
      return computeForceExitDigest(input);
    case "Revoke":
      return computeRevokeDigest(input);
    case "AutomationExec":
      return computeAutomationExecDigest(input);
  }
}

// Identifies which uint8 PrimaryType ABI value a TS Action belongs to.
export function primaryTypeU8(action: Action): number {
  return PRIMARY_TYPE_U8[action.primaryType];
}
