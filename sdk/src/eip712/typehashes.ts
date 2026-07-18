// EIP-712 typehash constants per the SDK type definitions and the contract
// snapshot at test/foundry/v2/snapshots/typehashes.json.
//
// The top-level action typehashes (OPEN/REBALANCE/EXIT/FORCE_EXIT/REVOKE/
// AUTOMATION_EXEC) and MorphoMarketParams are CANONICAL EIP-712 encodeType
// strings: the primary type followed by the definitions of ALL referenced
// structs, sorted alphabetically by type name. These strings are derived from
// viem's encodeType (the EIP-712 reference implementation), so a wallet's
// eth_signTypedData_v4 reproduces the contract's hashOpen(...) and this SDK's
// digest byte-for-byte. See test/eip712-wallet-parity.test.ts for the oracle.
//
// Leaf structs (ActionIdentity, Freshness, MorphoMarketParams, *Bounds,
// DigestHashes) have no nested struct references, so their typehash is just
// keccak256 of their own single-struct definition — identical whether computed
// canonically or standalone. The contract's hashStruct functions concatenate
// the typehash with pre-computed sub-struct hashes via abi.encode; see
// src/eip712/digest.ts and src/eip712/sub-hashes.ts for the matching encoder.

import { keccak256, toBytes } from "viem";
import type { Hex } from "../types/branded.js";

interface NamedTypehash {
  preimage: string;
  hash: Hex;
}

export const TYPE_PREIMAGES = {
  DOMAIN_SEPARATOR:
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)",
  ACTION_IDENTITY:
    "ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)",
  FRESHNESS:
    "Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)",
  FEE_CAPS:
    "FeeCaps(uint256 flashFeeCap,uint256 protocolFeeCap,uint256 automationFeeCap)",
  DIGEST_HASHES:
    "DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)",
  MARKET_PARAMS:
    "MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)",
  EVIDENCE_SOURCE:
    "EvidenceSource(bytes32 sourceId,address sourceAddress,uint8 status,uint256 lastUpdateBlock,bytes32 valueHash)",
  EVIDENCE_BUNDLE:
    "ActionEvidence(bytes32 actionId,bytes32 evidenceSetId,address owner,bytes32 market,uint256 blockNumber,uint16 stateBitmap,bytes32 sourcesHash)",
  SPENDER_LIST: "SpenderList(bytes32 sortedTokenSpenderAllowanceHash)",
  ALLOWANCE_SCHEDULE: "AllowanceSchedule(bytes32 sequentialDeltaHash)",
  FEE_CAP_HASH:
    "FeeCapHash(uint256 flashFeeCap,uint256 protocolFeeCap,uint256 automationFeeCap)",
  FAILURE_CONDITION: "FailureCondition(bytes32 previewOnlyHash)",
  ARMING_CONTEXT:
    "ArmingContext(uint256 chainId,address executor,bytes4 callbackSelector,uint8 primaryType,address owner,bytes32 market,uint256 registryVersion,address flashProvider,bytes32 routeId,bytes32 quoteHash,uint256 nonceSlot,uint8 nonceBit,uint256 deadline)",
  OPEN_BOUNDS:
    "OpenBounds(uint256 minWstDiemReceived,uint256 minBorrowedDiem,uint256 maxBorrowedDiem,uint16 maxSlippageBps,uint16 maxPriceImpactBps,uint16 maxLeverageBps,uint256 minHealthFactor,uint16 minLiquidationDistanceBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)",
  REBALANCE_BOUNDS:
    "RebalanceBounds(uint16 targetLeverageBps,uint16 targetLeverageToleranceBps,uint256 minPostHealthFactor,uint16 minLiquidationDistanceBps,uint256 maxDebtIncrease,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)",
  EXIT_BOUNDS:
    "ExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash,bool repayOnly,bool acceptsThirdPartyRepay)",
  FORCE_EXIT_BOUNDS:
    "ForceExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 looseSlippageBps,uint256 looseFlashFeeCap,uint16 maxCurvePositionShareBps,uint8 acknowledgedRisks)",
  REVOKE_BOUNDS:
    "RevokeBounds(uint64 policyId,uint8 policyClass,uint256 effectiveBlock)",
  AUTOMATION_BOUNDS:
    "AutomationBounds(bytes32 triggerConditionHash,uint8 underlyingPrimaryType,bytes32 underlyingActionHash,bytes32 policyHash,bytes32 boundSubsetHash,uint256 notBeforeBlock,uint256 notAfterBlock)",
  OPEN:
    "Open(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,OpenBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)OpenBounds(uint256 minWstDiemReceived,uint256 minBorrowedDiem,uint256 maxBorrowedDiem,uint16 maxSlippageBps,uint16 maxPriceImpactBps,uint16 maxLeverageBps,uint256 minHealthFactor,uint16 minLiquidationDistanceBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)",
  REBALANCE:
    "Rebalance(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,RebalanceBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)RebalanceBounds(uint16 targetLeverageBps,uint16 targetLeverageToleranceBps,uint256 minPostHealthFactor,uint16 minLiquidationDistanceBps,uint256 maxDebtIncrease,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)",
  EXIT:
    "Exit(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,ExitBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)ExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash,bool repayOnly,bool acceptsThirdPartyRepay)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)",
  FORCE_EXIT:
    "ForceExit(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,ForceExitBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)ForceExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 looseSlippageBps,uint256 looseFlashFeeCap,uint16 maxCurvePositionShareBps,uint8 acknowledgedRisks)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)",
  REVOKE:
    "Revoke(ActionIdentity identity,Freshness freshness,uint8 executionKind,RevokeBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)RevokeBounds(uint64 policyId,uint8 policyClass,uint256 effectiveBlock)",
  AUTOMATION_EXEC:
    "AutomationExec(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,AutomationBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)AutomationBounds(bytes32 triggerConditionHash,uint8 underlyingPrimaryType,bytes32 underlyingActionHash,bytes32 policyHash,bytes32 boundSubsetHash,uint256 notBeforeBlock,uint256 notAfterBlock)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)",
  PREIMAGE_PROOF:
    "Eip1271PreimageDisplayProof(address owner,uint8 primaryType,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,uint8 acknowledgedRisks,uint8 policyClass,bytes32 market,uint256 registryVersion,uint248 nonceSlot,uint8 nonceBit,uint256 maxCollateralSold,uint256 maxDebtIncrease,uint256 deadline,address verifyingContract)",
} as const;

export type TypeName = keyof typeof TYPE_PREIMAGES;

const computed: Record<TypeName, Hex> = Object.fromEntries(
  Object.entries(TYPE_PREIMAGES).map(([name, preimage]) => [
    name,
    keccak256(toBytes(preimage)) as Hex,
  ]),
) as Record<TypeName, Hex>;

export const TYPEHASHES: Readonly<Record<TypeName, Hex>> = computed;

export function getTypehash(name: TypeName): Hex {
  return computed[name];
}

export function getNamedTypehash(name: TypeName): NamedTypehash {
  return { preimage: TYPE_PREIMAGES[name], hash: computed[name] };
}

// Re-exports for ergonomic per-name access.
export const DOMAIN_SEPARATOR_TYPEHASH = computed.DOMAIN_SEPARATOR;
export const ACTION_IDENTITY_TYPEHASH = computed.ACTION_IDENTITY;
export const FRESHNESS_TYPEHASH = computed.FRESHNESS;
export const FEE_CAPS_TYPEHASH = computed.FEE_CAPS;
export const DIGEST_HASHES_TYPEHASH = computed.DIGEST_HASHES;
export const MARKET_PARAMS_TYPEHASH = computed.MARKET_PARAMS;
export const EVIDENCE_SOURCE_TYPEHASH = computed.EVIDENCE_SOURCE;
export const EVIDENCE_BUNDLE_TYPEHASH = computed.EVIDENCE_BUNDLE;
export const SPENDER_LIST_TYPEHASH = computed.SPENDER_LIST;
export const ALLOWANCE_SCHEDULE_TYPEHASH = computed.ALLOWANCE_SCHEDULE;
export const FEE_CAP_HASH_TYPEHASH = computed.FEE_CAP_HASH;
export const FAILURE_CONDITION_TYPEHASH = computed.FAILURE_CONDITION;
export const ARMING_CONTEXT_TYPEHASH = computed.ARMING_CONTEXT;
export const OPEN_BOUNDS_TYPEHASH = computed.OPEN_BOUNDS;
export const REBALANCE_BOUNDS_TYPEHASH = computed.REBALANCE_BOUNDS;
export const EXIT_BOUNDS_TYPEHASH = computed.EXIT_BOUNDS;
export const FORCE_EXIT_BOUNDS_TYPEHASH = computed.FORCE_EXIT_BOUNDS;
export const REVOKE_BOUNDS_TYPEHASH = computed.REVOKE_BOUNDS;
export const AUTOMATION_BOUNDS_TYPEHASH = computed.AUTOMATION_BOUNDS;
export const OPEN_TYPEHASH = computed.OPEN;
export const REBALANCE_TYPEHASH = computed.REBALANCE;
export const EXIT_TYPEHASH = computed.EXIT;
export const FORCE_EXIT_TYPEHASH = computed.FORCE_EXIT;
export const REVOKE_TYPEHASH = computed.REVOKE;
export const AUTOMATION_EXEC_TYPEHASH = computed.AUTOMATION_EXEC;
export const PREIMAGE_PROOF_TYPEHASH = computed.PREIMAGE_PROOF;
