// Canonical fail-closed error registry per the SDK type definitions and
// contracts/v2/libraries/LoopV1Errors.sol.
//
// FailClosedErrorName is the typed union of §A5 user-facing names. The internal
// CanonicalError[] registry below stores each name's canonical Solidity error
// signature so selectors can be derived (via toErrorSelector) and on-chain
// reverts can be matched back to a typed name.
//
// Items marked contractEmitted=false are SDK-only fail-closed gates: the SDK
// raises them off-chain (e.g. IndexerAnchorStale, RpcQuorumDegraded), the
// contract does NOT revert with that selector at runtime.

import { toFunctionSelector } from "viem";
import type { Hex } from "../types/branded.js";

export type FailClosedErrorName =
  // Identity / config
  | "WrongChain"
  | "RegistryVersionMismatch"
  | "RegistryMerkleRootMismatch"
  | "ExecutorMismatch"
  | "SpenderNotRegistered"
  | "BytecodeMismatch"
  | "VaultAssetMismatch"
  | "VaultEvidenceMissing"
  | "MorphoParamsMismatch"
  // Authorization
  | "InvalidSignature"
  | "DigestTypeMismatch"
  | "NonceAlreadyUsed"
  | "PolicyRevoking"
  | "PolicyExpired"
  | "PolicyClassMismatch"
  | "ForceAuthorizationRequired"
  | "AckRiskBitMissing"
  | "ExecutionKindMismatch"
  | "CallbackDataForbidden"
  | "ReentrantCallback"
  | "InvalidCallbackSender"
  | "InvalidCallbackContext"
  | "Phase1AutomationScopeViolation"
  // Freshness
  | "QuoteStale"
  | "QuoteDeviationExceeded"
  | "EvidenceStale"
  | "BlockInconsistent"
  | "DeadlineExceeded"
  // Submission posture
  | "RpcQuorumDegraded"
  | "MevModeMismatch"
  | "RevealTooEarly"
  // Liquidity
  | "CurveLiquidityInsufficient"
  | "CurveSlippageExceeded"
  | "CurvePriceImpactExceeded"
  | "FlashLiquidityUnavailable"
  | "AlternateProviderMissing"
  // Oracle / sequencer
  | "OracleStale"
  | "OracleMissing"
  | "OracleDeviationExceeded"
  | "SequencerDown"
  | "SequencerGracePeriod"
  | "NavStepExceeded"
  // Economic bounds
  | "MorphoEvidenceMissing"
  | "HealthFactorBoundFailure"
  | "HealthIndeterminate"
  | "LeverageBoundFailure"
  | "BorrowedDiemOutOfBand"
  | "CollateralSoldExceeded"
  | "DustBoundExceeded"
  | "LiquidationDistanceBoundFailure"
  | "UtilizationImpactExceeded"
  | "CurveShareExceeded"
  | "VaultDepositShortfall"
  // Gates / pause
  | "AuditGateClosed"
  | "PausedAction"
  | "IncidentInvestigating"
  | "IncidentMitigating"
  | "RevokedAuthorization"
  // Preview
  | "LedgerBeforeUnavailable"
  | "LedgerAfterUnavailable"
  // High-risk / posture
  | "ConfigIntegrityFailure"
  | "Eip1271PreimageNotAttested"
  | "ForceExitWaiverOverbroad"
  | "ForceExitPolicyNotAllowedInPhase1"
  | "ForceExitDeadlineExceedsBound"
  | "MevWaiverMissing"
  // SDK-only post-matrix gates
  | "IndexerAnchorStale"
  | "HarvestConvergencePending"
  | "RpcQuorumNotIndependent"
  | "KeeperBuilderOutage"
  // Evidence canonical-set (I-70)
  | "EvidenceUnsorted"
  | "EvidenceSourceUnexpected"
  | "EvidenceSourceMissing"
  | "EvidenceSourceAddressMismatch"
  // Permission / throttle
  | "ThirdPartyRepayNotAccepted"
  | "AutomationAttemptThrottled"
  | "BuilderQuotaExceeded"
  | "CallerNotAllowed"
  // PR-17 SDK-only fail-closed signals
  | "ContractsConfigInvalid"
  | "IncidentReaderUnavailable";

export type ErrorCategory =
  | "identity"
  | "authorization"
  | "freshness"
  | "submissionPosture"
  | "liquidity"
  | "oracle"
  | "economicBound"
  | "gate"
  | "preview"
  | "highRisk"
  | "sdkGate"
  | "evidence"
  | "permission";

export interface CanonicalError {
  name: FailClosedErrorName;
  signature: string;
  selector: Hex;
  category: ErrorCategory;
  humanReadable: string;
  contractEmitted: boolean;
}

interface CanonicalErrorSeed {
  name: FailClosedErrorName;
  signature: string;
  category: ErrorCategory;
  humanReadable: string;
  contractEmitted: boolean;
}

const SEED: CanonicalErrorSeed[] = [
  // Identity / config
  { name: "WrongChain", signature: "WrongChain()", category: "identity", humanReadable: "digest chainId does not match block.chainid", contractEmitted: true },
  { name: "RegistryVersionMismatch", signature: "RegistryVersionMismatch()", category: "identity", humanReadable: "digest registryVersion is stale", contractEmitted: true },
  { name: "RegistryMerkleRootMismatch", signature: "RegistryMerkleRootMismatch()", category: "identity", humanReadable: "digest registry root differs from on-chain root", contractEmitted: true },
  { name: "ExecutorMismatch", signature: "ExecutorMismatch()", category: "identity", humanReadable: "digest executor is not the registry-pinned executor", contractEmitted: true },
  { name: "SpenderNotRegistered", signature: "SpenderNotRegistered()", category: "identity", humanReadable: "token/spender pair absent from registry", contractEmitted: true },
  { name: "BytecodeMismatch", signature: "BytecodeMismatch()", category: "identity", humanReadable: "spender or integration codehash mismatch", contractEmitted: true },
  { name: "VaultAssetMismatch", signature: "VaultAssetMismatch()", category: "identity", humanReadable: "wstDIEM.asset() differs from registry DIEM", contractEmitted: true },
  { name: "VaultEvidenceMissing", signature: "VaultEvidenceMissing()", category: "identity", humanReadable: "vault evidence absent", contractEmitted: true },
  { name: "MorphoParamsMismatch", signature: "MorphoParamsMismatch(uint8)", category: "identity", humanReadable: "Morpho params, market id, or onBehalf disagrees with digest", contractEmitted: true },
  // Authorization
  { name: "InvalidSignature", signature: "InvalidSignature()", category: "authorization", humanReadable: "ECDSA or EIP-1271 signature failed verification", contractEmitted: true },
  { name: "DigestTypeMismatch", signature: "DigestTypeMismatch()", category: "authorization", humanReadable: "primaryType routed to wrong entrypoint", contractEmitted: true },
  { name: "NonceAlreadyUsed", signature: "NonceAlreadyUsed()", category: "authorization", humanReadable: "nonce bit already consumed", contractEmitted: true },
  { name: "PolicyRevoking", signature: "PolicyRevoking()", category: "authorization", humanReadable: "policy is inside revocation grace window", contractEmitted: true },
  { name: "PolicyExpired", signature: "PolicyExpired()", category: "authorization", humanReadable: "policy or action expired", contractEmitted: true },
  { name: "PolicyClassMismatch", signature: "PolicyClassMismatch()", category: "authorization", humanReadable: "policy class cannot authorize requested action", contractEmitted: true },
  { name: "ForceAuthorizationRequired", signature: "ForceAuthorizationRequired()", category: "authorization", humanReadable: "force path lacks force-specific authorization", contractEmitted: true },
  { name: "AckRiskBitMissing", signature: "AckRiskBitMissing()", category: "authorization", humanReadable: "required ForceExit risk bit unset", contractEmitted: true },
  { name: "ExecutionKindMismatch", signature: "ExecutionKindMismatch()", category: "authorization", humanReadable: "runtime caller class disagrees with signed executionKind", contractEmitted: true },
  { name: "CallbackDataForbidden", signature: "CallbackDataForbidden()", category: "authorization", humanReadable: "Morpho callback data was non-empty", contractEmitted: true },
  { name: "ReentrantCallback", signature: "ReentrantCallback()", category: "authorization", humanReadable: "I-54 reentrancy guard tripped", contractEmitted: true },
  { name: "InvalidCallbackSender", signature: "InvalidCallbackSender()", category: "authorization", humanReadable: "flash callback caller is not the canonical pool", contractEmitted: true },
  { name: "InvalidCallbackContext", signature: "InvalidCallbackContext()", category: "authorization", humanReadable: "armed context hash mismatch", contractEmitted: true },
  { name: "Phase1AutomationScopeViolation", signature: "Phase1AutomationScopeViolation()", category: "authorization", humanReadable: "permissionless execution out of Phase 1 scope", contractEmitted: true },
  // Freshness
  { name: "QuoteStale", signature: "QuoteStale()", category: "freshness", humanReadable: "quoteBlockNumber + maxQuoteAgeBlocks exceeded", contractEmitted: true },
  { name: "QuoteDeviationExceeded", signature: "QuoteDeviationExceeded()", category: "freshness", humanReadable: "automation quote reread above max deviation", contractEmitted: true },
  { name: "EvidenceStale", signature: "EvidenceStale()", category: "freshness", humanReadable: "ActionEvidence source stale for action class", contractEmitted: true },
  { name: "BlockInconsistent", signature: "BlockInconsistent()", category: "freshness", humanReadable: "safety reads span inconsistent blocks", contractEmitted: true },
  { name: "DeadlineExceeded", signature: "DeadlineExceeded()", category: "freshness", humanReadable: "block.timestamp past deadline", contractEmitted: true },
  // Submission posture
  { name: "RpcQuorumDegraded", signature: "RpcQuorumDegraded()", category: "submissionPosture", humanReadable: "fewer than threshold healthy RPC providers", contractEmitted: false },
  { name: "MevModeMismatch", signature: "MevModeMismatch()", category: "submissionPosture", humanReadable: "submission channel disagrees with signed mevProtectionMode", contractEmitted: true },
  { name: "RevealTooEarly", signature: "RevealTooEarly()", category: "submissionPosture", humanReadable: "Phase G commit-reveal: reveal before earliest block", contractEmitted: true },
  // Liquidity
  { name: "CurveLiquidityInsufficient", signature: "CurveLiquidityInsufficient()", category: "liquidity", humanReadable: "Curve route depth below registry minimum", contractEmitted: true },
  { name: "CurveSlippageExceeded", signature: "CurveSlippageExceeded()", category: "liquidity", humanReadable: "Curve realized slippage above signed bound", contractEmitted: true },
  { name: "CurvePriceImpactExceeded", signature: "CurvePriceImpactExceeded()", category: "liquidity", humanReadable: "Curve price impact above signed bound", contractEmitted: true },
  { name: "FlashLiquidityUnavailable", signature: "FlashLiquidityUnavailable()", category: "liquidity", humanReadable: "Uniswap V3 flash cannot supply amount", contractEmitted: true },
  { name: "AlternateProviderMissing", signature: "AlternateProviderMissing()", category: "liquidity", humanReadable: "alternate flash provider unavailable (Phase G)", contractEmitted: true },
  // Oracle / sequencer
  { name: "OracleStale", signature: "OracleStale()", category: "oracle", humanReadable: "oracle source stale", contractEmitted: true },
  { name: "OracleMissing", signature: "OracleMissing()", category: "oracle", humanReadable: "required oracle source missing", contractEmitted: true },
  { name: "OracleDeviationExceeded", signature: "OracleDeviationExceeded()", category: "oracle", humanReadable: "cross-feed deviation above threshold", contractEmitted: true },
  { name: "SequencerDown", signature: "SequencerDown()", category: "oracle", humanReadable: "Base sequencer feed reports down", contractEmitted: true },
  { name: "SequencerGracePeriod", signature: "SequencerGracePeriod()", category: "oracle", humanReadable: "sequencer resumed but grace still active", contractEmitted: true },
  { name: "NavStepExceeded", signature: "NavStepExceeded()", category: "oracle", humanReadable: "unexplained NAV step above MAX_NAV_STEP_BPS", contractEmitted: true },
  // Economic bounds
  { name: "MorphoEvidenceMissing", signature: "MorphoEvidenceMissing()", category: "economicBound", humanReadable: "owner/market position evidence unavailable", contractEmitted: true },
  { name: "HealthFactorBoundFailure", signature: "HealthFactorBoundFailure()", category: "economicBound", humanReadable: "post-action HF below signed minimum", contractEmitted: true },
  { name: "HealthIndeterminate", signature: "HealthIndeterminate()", category: "economicBound", humanReadable: "health factor cannot be safely computed", contractEmitted: true },
  { name: "LeverageBoundFailure", signature: "LeverageBoundFailure()", category: "economicBound", humanReadable: "leverage above signed maximum", contractEmitted: true },
  { name: "BorrowedDiemOutOfBand", signature: "BorrowedDiemOutOfBand()", category: "economicBound", humanReadable: "Open borrow outside signed min/max band", contractEmitted: true },
  { name: "CollateralSoldExceeded", signature: "CollateralSoldExceeded()", category: "economicBound", humanReadable: "sold wstDIEM above signed cap", contractEmitted: true },
  { name: "DustBoundExceeded", signature: "DustBoundExceeded()", category: "economicBound", humanReadable: "residual / dust above bound", contractEmitted: true },
  { name: "LiquidationDistanceBoundFailure", signature: "LiquidationDistanceBoundFailure()", category: "economicBound", humanReadable: "economic liquidation distance below bound", contractEmitted: true },
  { name: "UtilizationImpactExceeded", signature: "UtilizationImpactExceeded()", category: "economicBound", humanReadable: "Morpho utilization impact above bound", contractEmitted: true },
  { name: "CurveShareExceeded", signature: "CurveShareExceeded()", category: "economicBound", humanReadable: "Curve route share above bound", contractEmitted: true },
  { name: "VaultDepositShortfall", signature: "VaultDepositShortfall()", category: "economicBound", humanReadable: "vault.deposit minted below signed floor", contractEmitted: true },
  // Gates / pause
  { name: "AuditGateClosed", signature: "AuditGateClosed()", category: "gate", humanReadable: "Protocol Audit Gate v2 closed", contractEmitted: true },
  { name: "PausedAction", signature: "PausedAction()", category: "gate", humanReadable: "action blocked by valid pause row", contractEmitted: true },
  { name: "IncidentInvestigating", signature: "IncidentInvestigating()", category: "gate", humanReadable: "incident matrix row blocks action (investigating)", contractEmitted: true },
  { name: "IncidentMitigating", signature: "IncidentMitigating()", category: "gate", humanReadable: "incident matrix row blocks action (mitigating)", contractEmitted: true },
  { name: "RevokedAuthorization", signature: "RevokedAuthorization()", category: "gate", humanReadable: "policy fully revoked after grace", contractEmitted: true },
  // Preview
  { name: "LedgerBeforeUnavailable", signature: "LedgerBeforeUnavailable()", category: "preview", humanReadable: "preview cannot compute before ledger", contractEmitted: false },
  { name: "LedgerAfterUnavailable", signature: "LedgerAfterUnavailable()", category: "preview", humanReadable: "preview cannot compute after ledger", contractEmitted: false },
  // High-risk
  { name: "ConfigIntegrityFailure", signature: "ConfigIntegrityFailure()", category: "highRisk", humanReadable: "ExternalProtocolFingerprint drift detected", contractEmitted: true },
  { name: "Eip1271PreimageNotAttested", signature: "Eip1271PreimageNotAttested()", category: "highRisk", humanReadable: "high-risk smart-wallet preimage proof missing", contractEmitted: true },
  { name: "ForceExitWaiverOverbroad", signature: "ForceExitWaiverOverbroad()", category: "highRisk", humanReadable: "more than one critical ForceExit override bit set", contractEmitted: true },
  { name: "ForceExitPolicyNotAllowedInPhase1", signature: "ForceExitPolicyNotAllowedInPhase1()", category: "highRisk", humanReadable: "stored ForceExit policy attempted in Phase 1", contractEmitted: true },
  { name: "ForceExitDeadlineExceedsBound", signature: "ForceExitDeadlineExceedsBound()", category: "highRisk", humanReadable: "ForceExit deadline beyond 24h Phase 1 cap", contractEmitted: true },
  { name: "MevWaiverMissing", signature: "MevWaiverMissing()", category: "highRisk", humanReadable: "submission path requires unset mevWaiverBits", contractEmitted: true },
  // Post-matrix gates (G-PM-1..6). HarvestConvergencePending is contract-emitted
  // (I-69 enforced on-chain); the other three are SDK-only fail-closed signals.
  { name: "HarvestConvergencePending", signature: "HarvestConvergencePending()", category: "sdkGate", humanReadable: "risk-increase inside harvest cooling window", contractEmitted: true },
  { name: "IndexerAnchorStale", signature: "IndexerAnchorStale()", category: "sdkGate", humanReadable: "indexer anchor stale: SDK refuses to sign", contractEmitted: false },
  { name: "RpcQuorumNotIndependent", signature: "RpcQuorumNotIndependent()", category: "sdkGate", humanReadable: "RPC quorum lacks provider-family independence", contractEmitted: false },
  { name: "KeeperBuilderOutage", signature: "KeeperBuilderOutage()", category: "sdkGate", humanReadable: "keeper-side builder outage signal", contractEmitted: false },
  // Evidence canonical set (I-70)
  { name: "EvidenceUnsorted", signature: "EvidenceUnsorted()", category: "evidence", humanReadable: "sources not strict ascending by (sourceId, sourceAddress)", contractEmitted: true },
  { name: "EvidenceSourceUnexpected", signature: "EvidenceSourceUnexpected()", category: "evidence", humanReadable: "sourceId not required for action class", contractEmitted: true },
  { name: "EvidenceSourceMissing", signature: "EvidenceSourceMissing()", category: "evidence", humanReadable: "required sourceId absent", contractEmitted: true },
  { name: "EvidenceSourceAddressMismatch", signature: "EvidenceSourceAddressMismatch()", category: "evidence", humanReadable: "sourceAddress not registry canonical", contractEmitted: true },
  // Permission / throttle
  { name: "ThirdPartyRepayNotAccepted", signature: "ThirdPartyRepayNotAccepted()", category: "permission", humanReadable: "owner did not opt in to third-party repay", contractEmitted: true },
  { name: "AutomationAttemptThrottled", signature: "AutomationAttemptThrottled()", category: "permission", humanReadable: "I-72 failed-attempt throttle hit", contractEmitted: true },
  { name: "BuilderQuotaExceeded", signature: "BuilderQuotaExceeded()", category: "permission", humanReadable: "builder API quota exhausted", contractEmitted: true },
  { name: "CallerNotAllowed", signature: "CallerNotAllowed()", category: "permission", humanReadable: "permissionless caller not registry-allowlisted", contractEmitted: true },
  // PR-17 SDK-only fail-closed signals (no on-chain selector — emitted by the
  // SDK constructor / reader paths to refuse insecure operation).
  { name: "ContractsConfigInvalid", signature: "ContractsConfigInvalid()", category: "sdkGate", humanReadable: "WstdiemSdkConfig.contracts contains a zero address; SDK refuses to construct", contractEmitted: false },
  { name: "IncidentReaderUnavailable", signature: "IncidentReaderUnavailable()", category: "sdkGate", humanReadable: "getIncidentHistory requires a non-zero EmergencyGuardian address in config.contracts", contractEmitted: false },
];

function buildRegistry(): CanonicalError[] {
  return SEED.map((seed) => ({
    name: seed.name,
    signature: seed.signature,
    selector: toFunctionSelector(seed.signature) as Hex,
    category: seed.category,
    humanReadable: seed.humanReadable,
    contractEmitted: seed.contractEmitted,
  }));
}

export const CANONICAL_ERRORS: readonly CanonicalError[] = buildRegistry();

const BY_SELECTOR: Map<Hex, CanonicalError> = new Map(
  CANONICAL_ERRORS.map((e) => [e.selector.toLowerCase() as Hex, e]),
);
const BY_NAME: Map<FailClosedErrorName, CanonicalError> = new Map(
  CANONICAL_ERRORS.map((e) => [e.name, e]),
);

/** Look up the canonical error for a name. Returns undefined if not in §A5. */
export function getErrorByName(name: FailClosedErrorName): CanonicalError | undefined {
  return BY_NAME.get(name);
}

/** Decode a 4-byte selector to its canonical error, if registered. */
export function getErrorBySelector(selector: Hex): CanonicalError | undefined {
  return BY_SELECTOR.get(selector.toLowerCase() as Hex);
}

/** Decode the first 4 bytes of returndata as a FailClosedErrorName, if registered.
 *
 * SECURITY NOTE: 4-byte selectors are namespace-flat across all of Solidity.
 * Calling this on returnData from a non-WSTDIEM contract may produce a
 * misleading WSTDIEM error name on a coincidental selector collision. Only call
 * on returnData known to come from one of: LoopAuthorization,
 * LoopForceExitAuthorizer, LoopExecutorV2, LoopForceExitExecutor, LoopRegistry,
 * LoopFeeRouter, LoopAnchorRegistry, EmergencyGuardian. */
export function decodeRevertSelector(returnData: Hex): CanonicalError | undefined {
  if (returnData.length < 10) return undefined;
  const selector = returnData.slice(0, 10) as Hex;
  return getErrorBySelector(selector);
}
