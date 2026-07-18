// WstdiemSdk interface per the SDK type definitions (lines 796-822).
//
// PR-11 ships the TYPED INTERFACE plus the foundational primitives (EIP-712,
// digest, evidence canonical-set, gates, errors). PR-12+ supply the live
// implementations that talk to the indexer + viem PublicClient.

import type {
  ActionDigest,
  Address,
  Bytes32,
  Hex,
  BlockNumber,
  MarketId,
  PolicyId,
  ProposalId,
} from "./types/branded.js";
import type {
  Action,
  Market,
  CommonActionEnvelope,
  OpenAction,
  RebalanceAction,
  ExitAction,
  ForceExitAction,
  OpenBounds,
  RebalanceBounds,
  ExitBounds,
  ForceExitBounds,
  ExitRouteKind,
  BuildOpenParamsInput,
  BuildRebalanceParamsInput,
  BuildExitParamsInput,
  BuildForceExitParamsInput,
} from "./types/action.js";
import type { ActionEvidence } from "./types/evidence.js";
import type {
  AnchorFreshness,
  ExternalProtocolFingerprint,
  IncidentTransition,
  Policy,
  PositionRisk,
  ReadinessResult,
  TransactionPreview,
} from "./types/readiness.js";
import type { CanonicalError } from "./errors/registry.js";
import type { PrimaryType } from "./types/enums.js";

/**
 * PR-17 Gap 3 closure: canonical authorizer NAME resolution. The frontend's
 * §6.3 phishing-defeat banner needs to render the verifyingContract's CONTRACT
 * NAME (LoopAuthorization vs LoopForceExitAuthorizer), NOT a hardcoded string
 * tied to the primaryType. An attacker who substitutes one address for the
 * other must surface as "UNRECOGNIZED" so the UI can block signing.
 */
export type AuthorizerName =
  | "LoopAuthorization"
  | "LoopForceExitAuthorizer"
  | "UNRECOGNIZED";

/**
 * PR-17 Gap 3 closure: SDK-exposed canonical contract address bundle. The SDK
 * pins these at construction time; reads default to fail-closed when any field
 * is the zero address. The app's `useSdk` populates this from VITE_CONTRACT_*
 * env vars; the follow-up commit removes `app/src/lib/contracts.ts` env-direct
 * reads in favor of routing through `sdk.contracts`.
 */
export interface SdkContractAddresses {
  readonly loopRegistry: Address;
  readonly loopAuthorization: Address;
  readonly loopForceExitAuthorizer: Address;
  readonly loopExecutorV2: Address;
  readonly loopForceExitExecutor: Address;
  readonly loopAnchorRegistry: Address;
  readonly loopRiskOracleAdapter: Address;
  readonly loopFeeRouter: Address;
  readonly emergencyGuardian: Address;
}

export interface WstdiemSdk {
  // Discovery
  getMarkets(): Promise<Market[]>;
  getReadiness(market: MarketId, owner?: Address): Promise<ReadinessResult>;
  getMarketEvidence(
    market: MarketId,
    primaryType?: PrimaryType,
  ): Promise<ActionEvidence>;
  getPositionRisk(market: MarketId, owner: Address): Promise<PositionRisk>;

  // Envelope derivation (T2a): turn friendly inputs (amount, leverage, MEV
  // mode) into a fully-assembled action envelope ready for quoteX /
  // previewTransaction. Sources registryVersion + merkleRoot (registry
  // reader), an unused nonce slot/bit (authorization reader), a fresh
  // quoteBlockNumber (readClient), verifyingContract + executor (config), and
  // evidenceBundleHash (same resolveEvidence path the digest assembly uses).
  // policyId = 0 and executionKind defaults to KEEPER_PERMISSIONLESS (users act
  // through the executor; OWNER_DIRECT reverts ExecutionKindMismatch). Callers
  // may pass an explicit `executionKind` on the input to override the default.
  buildOpenParams(input: BuildOpenParamsInput): Promise<OpenAction>;
  buildRebalanceParams(
    input: BuildRebalanceParamsInput,
  ): Promise<RebalanceAction>;
  buildExitParams(input: BuildExitParamsInput): Promise<ExitAction>;
  buildForceExitParams(
    input: BuildForceExitParamsInput,
  ): Promise<ForceExitAction>;

  // Action quoting (returns a complete TransactionPreview ready to sign)
  quoteOpen(
    params: CommonActionEnvelope & { primaryType: "Open"; bounds: OpenBounds },
  ): Promise<TransactionPreview>;
  quoteRebalance(
    params: CommonActionEnvelope & {
      primaryType: "Rebalance";
      bounds: RebalanceBounds;
    },
  ): Promise<TransactionPreview>;
  quoteExit(
    params: CommonActionEnvelope & {
      primaryType: "Exit";
      bounds: ExitBounds;
      routeKind: ExitRouteKind;
    },
  ): Promise<TransactionPreview>;
  quoteForceExit(
    params: CommonActionEnvelope & {
      primaryType: "ForceExit";
      bounds: ForceExitBounds;
    },
  ): Promise<TransactionPreview>;

  // Simulation
  simulate(action: Action): Promise<TransactionPreview>;
  previewTransaction(action: Action): Promise<TransactionPreview>;

  // Automation
  getAutomationPolicies(owner: Address, market?: MarketId): Promise<Policy[]>;
  proposeAutomationAction(policyId: PolicyId): Promise<TransactionPreview>;
  executeAutomationProposal(
    proposalIdOrDigest: ProposalId | ActionDigest,
  ): Promise<Hex>;

  // Authorization + tx construction
  buildAuthorization(action: Action): Promise<{
    typedData: unknown;
    digest: ActionDigest;
    evidence: ActionEvidence;
  }>;
  buildTransaction(action: Action): Promise<{
    to: Address;
    data: Hex;
    value: bigint;
    digest: ActionDigest;
  }>;
  /**
   * PR-17 Gap 1 closure: splice the wallet signature into the calldata produced
   * by `buildTransaction`. Re-runs the full action assembly so the digest the
   * wallet signed matches the digest the on-chain validator will recompute,
   * and pins to the same block as the originating `buildTransaction` call
   * (PR-15 H-2 closure) so chain advancement between build and sign does not
   * spuriously raise QuoteDrift.
   *
   * Throws when `expectedDigest` is supplied and disagrees with the recomputed
   * digest (QuoteDrift), and when `signature` is not a 0x-prefixed hex string.
   */
  attachSignature(
    action: Action,
    signature: Hex,
    expectedDigest?: ActionDigest,
    opts?: { pinnedBlockNumber?: BlockNumber },
  ): Promise<{
    to: Address;
    data: Hex;
    value: bigint;
    digest: ActionDigest;
  }>;
  decodeCalldata(calldata: Hex): Promise<Action>;
  revokeAuthorization(target: PolicyId | ActionDigest): Promise<{
    typedData: unknown;
    transaction: { to: Address; data: Hex };
  }>;

  // Event / subscription / risk
  decodeLoopEvent(log: {
    address: Address;
    topics: Hex[];
    data: Hex;
  }): Promise<unknown>;
  subscribePosition(
    owner: Address,
    market: MarketId,
    cb: (risk: PositionRisk) => void,
  ): () => void;
  getEvidenceBundle(
    owner: Address,
    market?: MarketId,
    range?: { fromBlock: BlockNumber; toBlock: BlockNumber },
  ): Promise<ActionEvidence[]>;
  getRiskStatus(market: MarketId): Promise<ReadinessResult>;
  getStateBitmap(market: MarketId): Promise<{
    stateBitmap: ReadinessResult["stateBitmap"];
    decisions: ReadinessResult["perAction"];
  }>;

  // Static / registry-pinned
  getCanonicalErrors(): Promise<CanonicalError[]>;
  getExternalProtocolFingerprints(
    market: MarketId,
  ): Promise<ExternalProtocolFingerprint[]>;
  getAnchorFreshness(): Promise<AnchorFreshness>;

  /**
   * PR-17 Gap 3 closure: SDK-pinned canonical contract addresses. Exposed as
   * a readonly field rather than a Promise getter so synchronous UI consumers
   * (phishing-defeat banners, authorizer-name resolution) can render without
   * an async hop. Populated from `config.contracts` at construction time.
   */
  readonly contracts: SdkContractAddresses;

  /**
   * PR-17 Gap 3 closure: resolve a verifyingContract address to its canonical
   * authorizer NAME using `sdk.contracts`. Returns "UNRECOGNIZED" when the
   * input matches neither the registered LoopAuthorization nor the registered
   * LoopForceExitAuthorizer. Pure / synchronous so the C-1 phishing banner can
   * resolve names without an async hop.
   */
  authorizerNameFor(verifyingContract: Address): AuthorizerName;

  /**
   * PR-17 Gap 4 closure: incident-history reader from EmergencyGuardian
   * `IncidentStateChanged(IncidentState, IncidentState)` events. Reads
   * block-pinned to a single chain head (consistent with PR-13 block-pinning);
   * events below the supplied finality threshold are flagged provisional. The
   * D.5 Evidence screen renders the returned transitions in reverse-chronological
   * order.
   *
   * Throws `IncidentReaderUnavailable` when the configured EmergencyGuardian
   * address is the zero address.
   */
  getIncidentHistory(opts?: {
    fromBlock?: BlockNumber;
    toBlock?: BlockNumber;
    limit?: number;
    finalityThreshold?: number;
  }): Promise<IncidentTransition[]>;
}
