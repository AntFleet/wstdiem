// Readiness + preview + risk types per the SDK type definitions (lines 654-794).

import type {
  Address,
  Bytes32,
  Hex,
  BlockNumber,
  MarketId,
  PolicyId,
  BasisPoints,
  ActionDigest,
  QuoteId,
  RouteId,
  StateBitmap,
  UnixSeconds,
} from "./branded.js";
import type {
  PrimaryType,
  ExecutionKind,
  MevProtectionMode,
  PolicyClass,
} from "./enums.js";
import type { Action } from "./action.js";
import type { ActionEvidence, EvidenceSource, SequencerStatus } from "./evidence.js";
import type { FailClosedErrorName } from "../errors/registry.js";

export type GateId =
  | "G_PM_1_HARVEST_CONVERGENCE"
  | "G_PM_2_INDEXER_ANCHOR_STALE"
  | "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT"
  | "G_PM_4_EIP1271_PREIMAGE"
  | "G_PM_5_MEV_WAIVER"
  | "G_PM_6_AUTOMATION_THROTTLE";

export interface GateStatus {
  gate: GateId;
  status: "pass" | "fail" | "notApplicable";
  error?: FailClosedErrorName;
  evidence?: Bytes32;
}

export type ActionDecision = "allowed" | "blocked" | "conditional";

export interface PerActionReadiness {
  decision: ActionDecision;
  predicates: string[];
  errors: FailClosedErrorName[];
}

export interface ReadinessResult {
  market: MarketId;
  owner?: Address;
  blockNumber: BlockNumber;
  stateBitmap: StateBitmap;
  perAction: Record<PrimaryType, PerActionReadiness>;
  sources: EvidenceSource[];
  sequencer: SequencerStatus;
  indexerAnchor: AnchorFreshness;
  rpcQuorum: RpcQuorumStatus;
  /**
   * PR-17 Gap 2 closure: post-matrix gate statuses orthogonal to the §7.1
   * state-bitmap matrix. Surfaces G-PM-1..6 evaluation results when the SDK
   * has enough inputs to evaluate; empty when no action context is supplied
   * (G-PM-4/5/6 are action-scoped). Frontend `allGatesClear` treats anything
   * other than `pass` as not-clear.
   */
  gateStatuses?: GateStatus[];
}

export interface PositionRisk {
  owner: Address;
  market: MarketId;
  blockNumber: BlockNumber;
  collateralWstDiem: bigint;
  debtDiem: bigint;
  healthFactorWad?: bigint;
  liquidationDistanceBps?: BasisPoints;
  leverageBps?: BasisPoints;
  morphoUtilizationImpactBps?: BasisPoints;
  curvePositionShareBps?: BasisPoints;
  errors: FailClosedErrorName[];
}

export interface TransactionPreviewSubHashes {
  quoteHash: Bytes32;
  spenderListHash: Bytes32;
  allowanceScheduleHash: Bytes32;
  feeCapHash: Bytes32;
  evidenceBundleHash: Bytes32;
  /** O19 closed 2026-06-12 Round-2: removed from digest. Surfaced in preview metadata only. */
  failureConditionHash?: never;
}

export interface TransactionPreview {
  action: Action;
  digest: ActionDigest;
  quoteId: QuoteId;
  routeId?: RouteId;
  before?: PositionRisk;
  after?: PositionRisk;
  evidence: ActionEvidence;
  subHashes: TransactionPreviewSubHashes;
  gateStatuses: GateStatus[];
  failureConditions: FailClosedErrorName[];
  calldata: Hex;
  calldataHash: Bytes32;
}

export type AnchorStatus = "fresh" | "degraded" | "emergencyStale";

export interface AnchorFreshness {
  lastAnchoredBlock: BlockNumber;
  anchorMaxStaleBlocks: number;
  anchorEmergencyMultiplier: number;
  status: AnchorStatus;
  error?: "IndexerAnchorStale";
}

export type FingerprintStatus = "match" | "drift" | "pendingUpdate";

export type FingerprintIntegrationKind =
  | "CurvePool"
  | "UniswapV3Pool"
  | "ChainlinkFeed"
  | "SequencerFeed"
  | "WstDiemVault"
  | "MorphoMarket";

export type FingerprintSubCause =
  | "curve-pool"
  | "uniswap-pool"
  | "chainlink-feed"
  | "wstdiem-vault"
  | "morpho-market"
  | "sequencer-feed";

export interface ExternalProtocolFingerprint {
  integrationId: Bytes32;
  integrationKind: FingerprintIntegrationKind;
  sourceAddress: Address;
  fingerprint: Bytes32;
  status: FingerprintStatus;
  tolerance?: {
    target: bigint;
    maxDriftBps?: BasisPoints;
    maxStalenessSeconds?: number;
  };
  subCause?: FingerprintSubCause;
}

export interface Policy {
  policyId: PolicyId;
  owner: Address;
  primaryType: Exclude<PrimaryType, "AutomationExec" | "Revoke">;
  policyClass: PolicyClass;
  policyHash: Bytes32;
  nonceSlot: bigint;
  nonceBit: number;
  expiryBlock?: BlockNumber;
  expiryTimestamp?: UnixSeconds;
  revocationBlock?: BlockNumber;
  mevProtectionMode: MevProtectionMode;
  mevWaiverBits: number;
  executionKind: Exclude<ExecutionKind, "OPERATOR_RECOVERY">;
  acceptsThirdPartyRepay?: boolean;
  maxFailedAttemptsPerWindow?: number;
  attemptThrottleWindowBlocks?: number;
  eip1271PreimageDisplayProof?: Hex;
  /**
   * PR-17 Gap 5 closure: ForceExit-only `acknowledgedRisks` bitmask exposed on
   * the Policy row so the §6.3 policy renderer can decode it via
   * `decodeAcknowledgedRisks` rather than re-implementing the bit-name map.
   * Zero for non-force-exit policies; undefined when the indexer has not
   * projected the bits yet.
   */
  acknowledgedRisks?: number;
}

/**
 * PR-17 Gap 4 closure: incident-history transition row decoded from
 * `EmergencyGuardian.IncidentStateChanged(IncidentState indexed previousState,
 * IncidentState indexed nextState)`. Block-pinned reads + finality envelope
 * per §11.
 */
export type IncidentState =
  | "NONE"
  | "INVESTIGATING"
  | "MITIGATING"
  | "RESOLVED";

export interface IncidentTransition {
  /** The IncidentState the contract transitioned INTO. */
  state: IncidentState;
  /** The IncidentState the contract transitioned OUT OF. */
  previousState: IncidentState;
  blockNumber: BlockNumber;
  /** Seconds since epoch from `block.timestamp`. */
  blockTimestamp: UnixSeconds;
  txHash: Bytes32;
  /** "provisional" when blockNumber + finalityThreshold > chainHead. */
  finality: "provisional" | "finalized";
}

export type RpcQuorumStatusKind =
  | "ok"
  | "degraded"
  | "notIndependent"
  | "blockInconsistent";

export interface RpcQuorumStatus {
  /** Spec default 2; PR-14 widened to support N-of-M configs. */
  threshold: number;
  /** Spec default 3; PR-14 widened to support N-of-M configs. */
  size: number;
  providerFamilies: string[];
  matchedFamilies: string[];
  maxRpcBlockLagBlocks: number;
  quorumTimeoutMs: number;
  status: RpcQuorumStatusKind;
}
