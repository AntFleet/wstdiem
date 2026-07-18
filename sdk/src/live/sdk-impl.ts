// Live WstdiemSdk implementation composing IndexerClient + RegistryReader +
// AuthorizationReader + MorphoReader + Chainlink + SequencerFeed + VaultReader.
//
// PR-13 scope (per §A5 interface):
//   - Full read-side with block-pinned reads (audit B5-1 / TOCTOU closure):
//     getMarkets, getReadiness, getMarketEvidence, getPositionRisk
//     (now full LTV/HF/liquidationPrice), getAnchorFreshness with on-chain
//     LoopAnchorRegistry cross-check (A5-3 closure), getCanonicalErrors,
//     getExternalProtocolFingerprints, getAutomationPolicies, decodeLoopEvent
//     across the full §11 event set, getEvidenceBundle, getRiskStatus,
//     getStateBitmap.
//   - Full quote/build:
//     - quoteOpen/quoteRebalance/quoteExit live-quote Curve get_dy +
//       Uniswap V3 QuoterV2 when configured;
//     - buildAuthorization assembles real sub-hashes
//       (quoteHash + spenderListHash + allowanceScheduleHash + feeCapHash +
//       evidenceBundleHash) so the EIP-712 digest matches the on-chain
//       validator's recompute byte-for-byte;
//     - buildTransaction returns full LoopExecutorV2 / LoopForceExitExecutor
//       executeOpen/executeRebalance/executeExit/executeForceExit calldata
//       with sig + evidence + eip1271PreimageDisplayProof arguments.
//   - decodeCalldata round-trip via decodeFunctionData against the executor ABI.
//   - subscribePosition polling-based (PR-14 may upgrade to websockets).
//   - Deferred to PR-14+:
//     - proposeAutomationAction / executeAutomationProposal write paths
//       (Phase 1 permissionless AutomationExec disabled per AC-17).

import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  toFunctionSelector,
  type Log,
  type PublicClient,
} from "viem";
import { createCanonicalEvidenceResolver } from "./canonical-evidence-resolver.js";
import { createLiveEvidenceResolver } from "./live-evidence-resolver.js";
import {
  assertForceExitRisksCoverRequired,
  forceExitBlockedByMultiCritical,
  requiredForceExitRiskBitsFromStateBitmap,
} from "../force-exit/waivers.js";
import { LOOP_RISK_ORACLE_READ_ABI } from "./abis.js";
import type {
  Action,
  AutomationExecAction,
  BuildExitParamsInput,
  BuildForceExitParamsInput,
  BuildOpenParamsInput,
  BuildParamsCommon,
  BuildRebalanceParamsInput,
  CommonActionEnvelope,
  ExitAction,
  ExitBounds,
  ExitRouteKind,
  ForceExitAction,
  ForceExitBounds,
  Market,
  OpenAction,
  OpenBounds,
  RebalanceAction,
  RebalanceBounds,
  RevokeAction,
} from "../types/action.js";
import type {
  ActionEvidence,
  EvidenceSource,
  EvidenceSourceId,
} from "../types/evidence.js";
import type {
  AnchorFreshness,
  ExternalProtocolFingerprint,
  GateStatus,
  IncidentState,
  IncidentTransition,
  PerActionReadiness,
  Policy,
  PositionRisk,
  ReadinessResult,
  RpcQuorumStatus,
  TransactionPreview,
} from "../types/readiness.js";
import type {
  ActionDigest,
  Address,
  BlockNumber,
  Bytes32,
  Hex,
  MarketId,
  PolicyId,
  ProposalId,
  RegistryVersion,
} from "../types/branded.js";
import {
  asBasisPoints,
  asBlockNumber,
  asChainId,
  asMarketId,
  asPolicyId,
  asRegistryVersion,
  asStateBitmap,
  asUnixSeconds,
} from "../types/branded.js";
import type {
  BasisPoints,
  BlockNumber as BrandedBlockNumber,
  RegistryVersion as BrandedRegistryVersion,
  UnixSeconds,
} from "../types/branded.js";
import {
  EXECUTION_KIND_FROM_U8,
  EXECUTION_KIND_U8,
  MEV_PROTECTION_MODE_FROM_U8,
  MEV_PROTECTION_MODE_U8,
  PRIMARY_TYPE_FROM_U8,
  POLICY_CLASS_FROM_U8,
  SOURCE_STATUS_U8,
  type PrimaryType,
  type SourceStatus,
} from "../types/enums.js";
import {
  CANONICAL_ERRORS,
  type CanonicalError,
  type FailClosedErrorName,
} from "../errors/registry.js";
import {
  classifyAnchorFreshness,
  DEFAULT_ANCHOR_EMERGENCY_MULTIPLIER,
  DEFAULT_ANCHOR_MAX_STALE_BLOCKS,
} from "../anchor/freshness.js";
import { classifyFingerprint } from "../external/fingerprint.js";
import {
  buildActionEvidence,
} from "../evidence/encoder.js";
import { computeDomainSeparator, type Eip712Domain, ZERO_SALT } from "../eip712/domain.js";
import { buildActionTypedData } from "../eip712/typed-data.js";
import {
  computeAutomationExecDigest,
  computeExitDigest,
  computeForceExitDigest,
  computeOpenDigest,
  computeRebalanceDigest,
  computeRevokeDigest,
} from "../eip712/digest.js";
import {
  emptyAllowanceScheduleHash,
  emptySpenderListHash,
  hashFeeCaps,
  hashQuoteRoutes,
  type AutomationBoundsInputs,
  type DigestSubHashes,
  type MorphoMarketParams,
  type QuoteRoute,
} from "../eip712/sub-hashes.js";
import type { WstdiemSdk } from "../sdk.js";
import type { WstdiemSdkConfig, MarketAddressBundle } from "./config.js";
import { IndexerClient } from "./indexer-client.js";
import { RpcQuorum, type QuorumStatus } from "./quorum.js";
import {
  AnchorRegistryReader,
  AuthorizationReader,
  ChainlinkReader,
  CurveQuoter,
  ForceExitAuthorizerReader,
  MorphoReader,
  RegistryReader,
  SequencerFeedReader,
  UniswapV3Quoter,
  VaultReader,
  crossCheckAnchor,
  type CurveQuote,
  type UniV3Quote,
} from "./readers/index.js";
import {
  EMERGENCY_GUARDIAN_EVENTS_ABI,
  LOOP_EVENTS_FULL_ABI,
  LOOP_EXECUTOR_V2_ABI,
  LOOP_FORCE_EXIT_EXECUTOR_ABI,
} from "./abis.js";
import {
  evaluatePostMatrixGates,
  type PostMatrixGateInputs,
  type SubmissionChannel,
} from "../gates/post-matrix.js";
import type { AuthorizerName, SdkContractAddresses } from "../sdk.js";

const FINGERPRINT_INTEGRATIONS = [
  { id: "curve-pool", kind: "CurvePool" as const },
  { id: "uniswap-pool", kind: "UniswapV3Pool" as const },
  { id: "chainlink-feed", kind: "ChainlinkFeed" as const },
  { id: "sequencer-feed", kind: "SequencerFeed" as const },
  { id: "wstdiem-vault", kind: "WstDiemVault" as const },
  { id: "morpho-market", kind: "MorphoMarket" as const },
];

const PRIMARY_TYPES_FOR_READINESS: PrimaryType[] = [
  "Open",
  "Rebalance",
  "Exit",
  "ForceExit",
  "AutomationExec",
  "Revoke",
];

// ─── T2a envelope-derivation defaults ───────────────────────────────────────
//
// Heuristic defaults for the `build*Params` helpers. These populate the
// bounds + freshness envelope from friendly inputs; they are deliberately
// conservative fail-closed defaults and are re-validated against live quote
// routes + on-chain marketParams at `quoteX` / execution time. See the
// helper docs for how each field is sourced.
const BPS_DENOM = 10_000n;
const DEFAULT_DEADLINE_SECONDS = 600; // 10 min
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
const DEFAULT_MAX_QUOTE_AGE_BLOCKS = 30; // ≈ 1 min at 2s Base blocks
const DEFAULT_MAX_QUOTE_DEVIATION_BPS = 100; // 1%
const DEFAULT_MIN_HEALTH_FACTOR_WAD = 1_050_000_000_000_000_000n; // 1.05 WAD
const DEFAULT_MIN_LIQ_DISTANCE_BPS = 500; // 5%
const DEFAULT_MAX_UTIL_IMPACT_BPS = 500; // 5%
const DEFAULT_MAX_CURVE_SHARE_BPS = 2_000; // 20%
const DEFAULT_LEVERAGE_TOLERANCE_BPS = 200; // 2%
const DEFAULT_FLASH_FEE_BPS = 30n; // 0.3% of borrow
const DEFAULT_FORCE_EXIT_FLASH_FEE_BPS = 50n; // looser 0.5% budget
const DEFAULT_PROTOCOL_FEE_BPS = 100n; // 1% of collateral
const NONCE_SLOT_SCAN_LIMIT = 4n; // scan up to 1024 nonces before failing
const ZERO_BYTES32 = ("0x" + "00".repeat(32)) as Bytes32;

interface EnvelopeBase {
  registryVersion: BrandedRegistryVersion;
  registryMerkleRoot: Bytes32;
  quoteBlockNumber: BrandedBlockNumber;
  /** Raw bigint block used to pin the evidence resolve. */
  pinned: bigint;
  nonceSlot: bigint;
  nonceBit: number;
  deadline: UnixSeconds;
}

/**
 * Live WstdiemSdk implementation. Construct via `createSdk(config)`.
 *
 * The implementation is designed for browser + Node parity: every method uses
 * the user-supplied viem `PublicClient` (which may target any RPC transport),
 * the user-supplied `indexerBaseUrl` for HTTP reads, and produces strictly
 * branded values per the SDK type definitions.
 */
export class LiveWstdiemSdk implements WstdiemSdk {
  readonly config: WstdiemSdkConfig;
  readonly indexer: IndexerClient;
  readonly registry: RegistryReader;
  readonly authorization: AuthorizationReader;
  readonly forceExitAuthorizer: ForceExitAuthorizerReader;
  readonly anchorRegistry: AnchorRegistryReader;
  readonly curveQuoter: CurveQuoter;
  readonly uniswapQuoter: UniswapV3Quoter;
  /** Optional RPC quorum (PR-14, audit A3-9 / I-68 closure). Constructed when
   * `config.publicClients` is supplied. */
  readonly rpcQuorum: RpcQuorum | null;
  /** When strictAnchorCrossCheck is true (default), readiness queries enforce
   * the on-chain LoopAnchorRegistry comparison. */
  private readonly strictAnchor: boolean;

  /**
   * PR-15 audit C-1 closure: the client every reader is wired to. When
   * `config.publicClients` supplies a quorum, `readClient` is the quorum-
   * wrapped proxy so every `readContract`/`getBlockNumber`/`getBlock`/
   * `getLogs`/`simulateContract` fans out and requires `threshold` distinct
   * provider families to agree. When no quorum is configured, falls back
   * to `config.publicClient` (single-RPC mode requires the explicit
   * `allowSingleClientReads: true` opt-in, see `getReadiness`).
   */
  readonly readClient: PublicClient;

  /**
   * PR-17 Gap 3 closure: canonical contract address bundle exposed to
   * synchronous UI consumers (phishing-defeat banner, authorizer-name
   * resolution). Populated from `config.contracts` after the zero-address
   * check passes; the `ContractsConfigInvalid` fail-closed signal is raised
   * if any field is the zero address at construction time.
   */
  readonly contracts: SdkContractAddresses;

  constructor(config: WstdiemSdkConfig) {
    // PR-17 Gap 3 closure: fail-closed when any pinned address is zero. The
    // SDK refuses to construct rather than letting downstream calls succeed
    // against the zero address (silent miss-reads + zero-init evidence). The
    // app populates these from VITE_CONTRACT_* env at startup; missing env
    // surfaces here as ContractsConfigInvalid.
    validateContractsConfig(config.contracts);
    this.contracts = freezeContracts(config.contracts);
    this.config = config;
    // 2026-06-17: production apps should set requireIndexerSignatures so the
    // SDK cannot silently trust an unsigned indexer over the network.
    if (config.requireIndexerSignatures) {
      if (!config.indexerSigningKey) {
        throw new Error(
          "requireIndexerSignatures=true but indexerSigningKey is missing",
        );
      }
      if (!config.indexerVerifier) {
        throw new Error(
          "requireIndexerSignatures=true but indexerVerifier is missing",
        );
      }
    }
    this.indexer = new IndexerClient({
      baseUrl: config.indexerBaseUrl,
      ...(config.fetch !== undefined ? { fetch: config.fetch } : {}),
      ...(config.indexerSigningKey !== undefined
        ? { signingKey: config.indexerSigningKey }
        : {}),
      ...(config.indexerVerifier !== undefined
        ? { verifier: config.indexerVerifier }
        : {}),
    });
    this.rpcQuorum =
      config.publicClients && config.publicClients.length > 0
        ? new RpcQuorum(config.publicClients, config.quorum)
        : null;
    // PR-15 audit C-1 closure: wire all readers to the quorum-wrapped client
    // when available so contract reads (marketParams, validateExternalConfig,
    // position, oracle, anchor, etc.) inherit threshold-of-N family
    // agreement transparently.
    this.readClient = this.rpcQuorum
      ? this.rpcQuorum.asPublicClient()
      : config.publicClient;
    this.registry = new RegistryReader(this.readClient, config.contracts.loopRegistry);
    // When no evidenceResolver is supplied:
    //   - preferPlaceholderEvidence → lightweight FRESH placeholders (tests)
    //   - otherwise live venue resolver (D-4 richer values); on RPC failure
    //     individual sources fall back to bound placeholders inside the live
    //     resolver. Production apps should leave preferPlaceholderEvidence unset.
    if (!this.config.evidenceResolver) {
      const preferPlaceholder =
        this.config.preferPlaceholderEvidence === true ||
        // Single-client test harnesses typically lack full venue mocks.
        (this.config.allowSingleClientReads === true &&
          this.config.preferPlaceholderEvidence !== false);
      this.config = {
        ...this.config,
        evidenceResolver: preferPlaceholder
          ? createCanonicalEvidenceResolver(this.registry)
          : createLiveEvidenceResolver({
              registry: this.registry,
              client: this.readClient,
            }),
      };
    }
    this.authorization = new AuthorizationReader(
      this.readClient,
      config.contracts.loopAuthorization,
    );
    this.forceExitAuthorizer = new ForceExitAuthorizerReader(
      this.readClient,
      config.contracts.loopForceExitAuthorizer,
    );
    this.anchorRegistry = new AnchorRegistryReader(
      this.readClient,
      config.contracts.loopAnchorRegistry,
    );
    this.curveQuoter = new CurveQuoter(this.readClient);
    this.uniswapQuoter = new UniswapV3Quoter(this.readClient);
    this.strictAnchor = config.strictAnchorCrossCheck !== false;
  }

  // ─── Discovery ───────────────────────────────────────────────────────────

  async getMarkets(): Promise<Market[]> {
    const bundles = this.config.initialMarkets ?? [];
    if (bundles.length === 0) {
      throw new Error(
        "getMarkets() requires config.initialMarkets — the registry does not expose " +
          "an iterator in Phase 1. Resolve marketIds out-of-band (from indexer events) and " +
          "supply via WstdiemSdkConfig.initialMarkets.",
      );
    }
    const [registryVersion, registryMerkleRoot] = await Promise.all([
      this.registry.registryVersion(),
      this.registry.registryMerkleRoot(),
    ]);
    return bundles.map((b) => this.bundleToMarket(b, registryVersion, registryMerkleRoot));
  }

  private bundleToMarket(
    bundle: MarketAddressBundle,
    registryVersion: bigint,
    registryMerkleRoot: Bytes32,
  ): Market {
    return {
      id: asMarketId(bundle.marketId as Bytes32),
      chainId: this.config.chainId,
      loanToken: bundle.loanToken,
      collateralToken: bundle.collateralToken,
      morpho: bundle.morpho,
      vault: bundle.vault,
      ...(bundle.curvePool !== undefined ? { curvePool: bundle.curvePool } : {}),
      uniswapV3FlashPool: bundle.uniswapV3FlashPool,
      ...(bundle.chainlinkFeed !== undefined ? { chainlinkFeed: bundle.chainlinkFeed } : {}),
      sequencerUptimeFeed: bundle.sequencerUptimeFeed,
      registryVersion: asRegistryVersion(registryVersion),
      registryMerkleRoot,
    };
  }

  // ─── Readiness composition ───────────────────────────────────────────────

  async getReadiness(market: MarketId, owner?: Address): Promise<ReadinessResult> {
    // PR-15: evaluate the RPC quorum status FIRST using the raw, un-proxied
    // path. If the quorum is configured but degraded, short-circuit to
    // return a fully-blocked readiness without attempting any reader
    // contract reads — those reads would themselves throw RpcQuorumMismatch
    // and the consumer never gets a structured "blocked" answer back. The
    // same short-circuit applies when no quorum is configured AND the
    // consumer hasn't opted into single-client reads.
    const rpcQuorum = await this.evaluateRpcQuorum();
    const singleClientAllowed = this.config.allowSingleClientReads === true;
    if ((!this.rpcQuorum && !singleClientAllowed) || (this.rpcQuorum && rpcQuorum.status !== "ok")) {
      // D-8: prefer quorum-wrapped readClient for blockNumber even on the
      // short-circuit path; only fall back to single publicClient when
      // quorum is unavailable (and single-client was already allowed).
      let currentBlockEarly: bigint;
      try {
        currentBlockEarly = await this.readClient.getBlockNumber();
      } catch {
        currentBlockEarly = await this.config.publicClient.getBlockNumber();
      }
      // PR-17 Gap 2: even in the short-circuit blocked path, surface the
      // G-PM gate evaluation so the consumer sees G-PM-3 fail with
      // RpcQuorumDegraded (rather than the empty `gateStatuses: []` that
      // produced the legacy "every gate Blocked" UI).
      const earlyAnchor: AnchorFreshness = {
        lastAnchoredBlock: asBlockNumber(0n),
        anchorMaxStaleBlocks: 100,
        anchorEmergencyMultiplier: 3,
        status: "emergencyStale" as const,
      };
      const earlyGateStatuses = evaluatePostMatrixGates({
        g2: { anchor: earlyAnchor },
        g3: { quorum: rpcQuorum },
      });
      return {
        market,
        ...(owner !== undefined ? { owner } : {}),
        blockNumber: asBlockNumber(currentBlockEarly),
        stateBitmap: asStateBitmap(0),
        perAction: this.gatePerActionOnQuorum(
          this.buildAllAllowedPerAction(),
          this.rpcQuorum ? rpcQuorum.status : "degraded",
        ),
        sources: [],
        sequencer: "down",
        indexerAnchor: earlyAnchor,
        rpcQuorum,
        gateStatuses: earlyGateStatuses,
      };
    }
    // PR-13: pin all sub-reads to one chain head so the cross-checks operate
    // on a consistent state. Without pinning, the validateExternalConfig per-
    // primaryType checks could observe a different registryVersion than the
    // sequencer / anchor reads.
    const currentBlock = await this.readClient.getBlockNumber();
    const pinned = currentBlock;
    const [snapshot, head, sequencer, perActionDecisions, liveBitmap] =
      await Promise.all([
        this.indexer.snapshotsLatest(),
        this.indexer.health(),
        this.readSequencer(market, pinned),
        this.evaluatePerActionReadiness(market, pinned),
        this.readLiveStateBitmap(market, owner),
      ]);
    const indexerAnchor = this.classifyAnchor(snapshot, head);
    // A5-3 + PR-13 audit C-1/C-2/H-3: cross-check the indexer's anchor claim
    // against the on-chain LoopAnchorRegistry, pinned to the planning block.
    // Fail-closed when:
    //   - strictAnchor is on AND indexer returned no snapshot (C-1)
    //   - strictAnchor is on AND indexer returned anchorBlock == 0 (C-1)
    //   - the on-chain registry rejects the claim (cross-check fails)
    // Reads are pinned to `pinned` so the cross-check sees the same state as
    // the rest of the readiness fan-out (C-2). Submitter is verified against
    // the registry's currently-registered anchorSubmitter (H-3).
    if (this.strictAnchor) {
      if (!snapshot || snapshot.anchorBlock === 0n) {
        throw new Error(
          "Anchor cross-check failed (no-indexer-anchor-claim): strictAnchorCrossCheck is on but the indexer returned no anchor claim. Disable strict mode only for diagnostic / staging environments.",
        );
      }
      const expectedSubmitter = await this.registry.anchorSubmitter(pinned);
      const result = await crossCheckAnchor(
        this.anchorRegistry,
        {
          anchorBlock: snapshot.anchorBlock,
          manifestHash: snapshot.manifestHash,
          blockNumber: snapshot.blockNumber,
          blockHash: snapshot.blockHash,
        },
        {
          planningBlock: asBlockNumber(pinned),
          expectedSubmitter,
          // Audit B: verify indexer emission blockHash against RPC when fresh.
          publicClient: this.readClient,
        },
      );
      if (!result.ok) {
        throw new Error(
          `Anchor cross-check failed (${result.reason}): ${result.details}`,
        );
      }
    }
    // PR-17 Gap 2 closure: evaluate the orthogonal G-PM-1..6 post-matrix
    // gates so the readiness surface carries both the §7.1 state-bitmap
    // matrix and the post-matrix gate status. Gates that need action context
    // (G-PM-1/4/5/6) surface as notApplicable here — getReadiness is a
    // market-scoped query, not an action-scoped one.
    const gateStatuses = evaluatePostMatrixGates({
      g2: { anchor: indexerAnchor },
      g3: { quorum: rpcQuorum },
    });
    // Audit B: under strict anchor mode, non-fresh anchors block every action
    // class (G-PM-2 is not only diagnostic — it fails closed on perAction).
    const perAction =
      this.strictAnchor && indexerAnchor.status !== "fresh"
        ? this.gatePerActionOnAnchor(perActionDecisions, indexerAnchor)
        : perActionDecisions;
    return {
      market,
      ...(owner !== undefined ? { owner } : {}),
      blockNumber: asBlockNumber(currentBlock),
      stateBitmap: asStateBitmap(liveBitmap),
      perAction,
      sources: [],
      sequencer: sequencer.status,
      indexerAnchor,
      rpcQuorum,
      gateStatuses,
    };
  }

  /**
   * Build a stub `perAction` map with every primaryType set to `allowed`,
   * used as the input to `gatePerActionOnQuorum` in the short-circuit path.
   * `gatePerActionOnQuorum` then forces every entry to `blocked`.
   */
  private buildAllAllowedPerAction(): Record<PrimaryType, PerActionReadiness> {
    const out: Partial<Record<PrimaryType, PerActionReadiness>> = {};
    for (const pt of PRIMARY_TYPES_FOR_READINESS) {
      out[pt] = { decision: "allowed", predicates: [], errors: [] };
    }
    return out as Record<PrimaryType, PerActionReadiness>;
  }

  private gatePerActionOnQuorum(
    decisions: Record<PrimaryType, PerActionReadiness>,
    quorumStatus: RpcQuorumStatus["status"],
  ): Record<PrimaryType, PerActionReadiness> {
    const predicate = `rpcQuorum=${quorumStatus}`;
    const out: Partial<Record<PrimaryType, PerActionReadiness>> = {};
    for (const [pt, d] of Object.entries(decisions) as Array<[
      PrimaryType,
      PerActionReadiness,
    ]>) {
      out[pt] = {
        decision: "blocked",
        predicates: [...d.predicates, predicate],
        errors: [...d.errors, "RpcQuorumDegraded"],
      };
    }
    return out as Record<PrimaryType, PerActionReadiness>;
  }

  /** Fail-closed per-action map when G-PM-2 indexer anchor is not fresh. */
  private gatePerActionOnAnchor(
    decisions: Record<PrimaryType, PerActionReadiness>,
    anchor: AnchorFreshness,
  ): Record<PrimaryType, PerActionReadiness> {
    const predicate = `indexerAnchor=${anchor.status}`;
    const out: Partial<Record<PrimaryType, PerActionReadiness>> = {};
    for (const [pt, d] of Object.entries(decisions) as Array<[
      PrimaryType,
      PerActionReadiness,
    ]>) {
      out[pt] = {
        decision: "blocked",
        predicates: [...d.predicates, predicate],
        errors: [...d.errors, "IndexerAnchorStale"],
      };
    }
    return out as Record<PrimaryType, PerActionReadiness>;
  }

  async getRiskStatus(market: MarketId): Promise<ReadinessResult> {
    return this.getReadiness(market);
  }

  async getStateBitmap(market: MarketId): Promise<{
    stateBitmap: ReadinessResult["stateBitmap"];
    decisions: ReadinessResult["perAction"];
  }> {
    const readiness = await this.getReadiness(market);
    return { stateBitmap: readiness.stateBitmap, decisions: readiness.perAction };
  }

  private async evaluatePerActionReadiness(
    market: MarketId,
    pinnedBlock?: bigint,
  ): Promise<Record<PrimaryType, PerActionReadiness>> {
    const validations = await Promise.all(
      PRIMARY_TYPES_FOR_READINESS.map((pt) =>
        this.registry.validateExternalConfig(market, pt, pinnedBlock).then(
          (valid) => ({ pt, valid }),
          (_err) => ({ pt, valid: false }),
        ),
      ),
    );
    const record: Partial<Record<PrimaryType, PerActionReadiness>> = {};
    for (const { pt, valid } of validations) {
      record[pt] = valid
        ? { decision: "allowed", predicates: [], errors: [] }
        : { decision: "blocked", predicates: ["validateExternalConfig=false"], errors: ["ConfigIntegrityFailure"] };
    }
    return record as Record<PrimaryType, PerActionReadiness>;
  }

  private async evaluateRpcQuorum(): Promise<RpcQuorumStatus> {
    // PR-14 audit A3-9 / I-68 closure: when config.publicClients is
    // populated, fan out a real `getBlockNumber` call to all members and
    // compute provider-family diversity. Without `publicClients`, we surface
    // "degraded" so consumers don't mistake the placeholder for "ok".
    if (this.rpcQuorum && this.rpcQuorum.size > 0) {
      const { status } = await this.rpcQuorum.getBlockNumber();
      return status;
    }
    return {
      threshold: 2,
      size: 1,
      providerFamilies: [],
      matchedFamilies: [],
      maxRpcBlockLagBlocks: 5,
      quorumTimeoutMs: 5000,
      status: "degraded",
    };
  }

  // ─── Evidence ───────────────────────────────────────────────────────────

  async getMarketEvidence(market: MarketId, primaryType?: PrimaryType): Promise<ActionEvidence> {
    void primaryType; // PR-13 will use this to scope the source set
    const owner = "0x0000000000000000000000000000000000000000" as Address;
    return this.buildEmptyEvidenceBundle(market, owner);
  }

  async getEvidenceBundle(
    owner: Address,
    market?: MarketId,
    _range?: { fromBlock: BlockNumber; toBlock: BlockNumber },
  ): Promise<ActionEvidence[]> {
    if (!market) return [];
    return [await this.buildEmptyEvidenceBundle(market, owner)];
  }

  private async buildEmptyEvidenceBundle(
    market: MarketId,
    owner: Address,
    pinnedBlock?: bigint,
  ): Promise<ActionEvidence> {
    const blockNumber = pinnedBlock ?? (await this.readClient.getBlockNumber());
    return buildActionEvidence({
      actionId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32,
      evidenceSetId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32,
      owner,
      market,
      blockNumber: asBlockNumber(blockNumber),
      stateBitmap: asStateBitmap(0),
      sources: [] as EvidenceSource[],
    });
  }

  /**
   * PR-14 audit M-4 closure: assemble a real ActionEvidence bundle by
   * delegating to `config.evidenceResolver` when supplied, then validate
   * the result against `registry.requiredEvidenceSourceSet` so signing
   * with a missing-source bundle fails closed rather than producing a
   * calldata the on-chain validator rejects.
   *
   * When NO resolver is supplied AND the registry's required set is
   * non-empty, the SDK throws — refusing to sign a digest committing
   * evidence the executor will demand.
   *
   * When NO resolver AND the registry's required set is empty, falls
   * back to the empty bundle (backwards-compatible default for action
   * classes that don't require evidence).
   */
  private async resolveEvidence(
    action: Action,
    pinnedBlock?: bigint,
  ): Promise<ActionEvidence> {
    const requiredSet = await this.registry
      .requiredEvidenceSourceSet(action.primaryType as PrimaryType)
      .catch(() => [] as readonly Bytes32[]);
    if (!this.config.evidenceResolver) {
      if (requiredSet.length > 0) {
        throw new Error(
          `buildAuthorization: registry.requiredEvidenceSourceSet(${action.primaryType}) ` +
            `returned ${requiredSet.length} required source(s) but no config.evidenceResolver ` +
            "was supplied. Refusing to sign with an empty evidence bundle that the on-chain " +
            "validator will reject. Configure an evidenceResolver to fetch the actual sources.",
        );
      }
      return this.buildEmptyEvidenceBundle(action.market, action.owner, pinnedBlock);
    }
    // PR-15: respect caller-pinned block (from assembleAuthorization with
    // pinnedBlockNumber) so the resolver and the digest see the same head.
    const blockNumber = pinnedBlock ?? (await this.readClient.getBlockNumber());
    const resolved = await this.config.evidenceResolver({
      primaryType: action.primaryType as PrimaryType,
      market: action.market,
      owner: action.owner,
      blockNumber: asBlockNumber(blockNumber),
      requiredSourceIds: requiredSet as ReadonlyArray<`0x${string}`>,
    });
    // PR-14 audit adversarial H-2 closure: validate the resolver-supplied
    // bundle by:
    //   1. Required-set coverage by sourceIdHash.
    //   2. Address-binding: each source's sourceAddress must match
    //      `registry.canonicalSource(market, sourceId)`. A malicious resolver
    //      that returns the right id but a hostile address would otherwise
    //      slip through; the on-chain validator would reject at execution
    //      time, but the SDK has already shown the user a wallet prompt for
    //      a doomed digest.
    //   3. No duplicates: the encoder asserts uniqueness post-sort, but we
    //      reject here for a clearer error message.
    const sources = resolved.sources as ReadonlyArray<{
      sourceId?: string;
      sourceIdHash?: Bytes32;
      sourceAddress?: Address;
    }>;
    const seen = new Set<string>();
    for (const s of sources) {
      const idHash = (s.sourceIdHash ?? "").toLowerCase();
      const addr = (s.sourceAddress ?? "").toLowerCase();
      if (!idHash || !addr) {
        throw new Error(
          `evidenceResolver source missing sourceIdHash or sourceAddress: ${JSON.stringify(s)}`,
        );
      }
      const key = `${idHash}|${addr}`;
      if (seen.has(key)) {
        throw new Error(
          `evidenceResolver returned duplicate (sourceIdHash=${idHash}, sourceAddress=${addr}). The I-70 canonical-set requires unique entries.`,
        );
      }
      seen.add(key);
    }
    if (requiredSet.length > 0) {
      const providedIds = new Set(
        sources.map((s) => s.sourceIdHash?.toLowerCase() ?? ""),
      );
      const missing = requiredSet.filter(
        (id) => !providedIds.has(id.toLowerCase()),
      );
      if (missing.length > 0) {
        throw new Error(
          `evidenceResolver returned a bundle missing required source ids: ${missing.join(
            ",",
          )}. Required by registry.requiredEvidenceSourceSet(${action.primaryType}).`,
        );
      }
    }
    // PR-15 audit H-2 closure: every resolver-supplied sourceAddress must
    // match registry.canonicalSource(market, sourceId) at the planning
    // block. A malicious resolver that returns the right sourceIdHash but a
    // hostile sourceAddress would otherwise pass earlier validation but
    // commit a forged evidence entry into the digest. Read pinned so the
    // cross-check operates on the same chain head as the rest of the action.
    await Promise.all(
      sources.map(async (s) => {
        const expected = await this.registry.canonicalSourceByHash(
          action.market,
          s.sourceIdHash as Bytes32,
          blockNumber,
        );
        // canonicalSource may return the zero address for sources the
        // registry treats as unregistered for this market (e.g., curve-quote
        // on a non-Curve market). When the required set demanded that id,
        // the earlier requiredSet check already rejected; here we only
        // reject when registry returns a non-zero address that differs.
        const expectedLc = expected.toLowerCase();
        const providedLc = (s.sourceAddress ?? "").toLowerCase();
        const ZERO = "0x0000000000000000000000000000000000000000";
        if (expectedLc !== ZERO && expectedLc !== providedLc) {
          throw new Error(
            `evidenceResolver sourceAddress=${providedLc} does not match ` +
              `registry.canonicalSource(market=${action.market}, sourceIdHash=${s.sourceIdHash})=${expectedLc}. ` +
              `Refusing to sign a digest committing a forged evidence source address.`,
          );
        }
      }),
    );
    return buildActionEvidence({
      actionId:
        (resolved.actionId as Bytes32) ??
        ("0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32),
      evidenceSetId:
        (resolved.evidenceSetId as Bytes32) ??
        ("0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32),
      owner: action.owner,
      market: action.market,
      blockNumber: asBlockNumber(blockNumber),
      stateBitmap: asStateBitmap(resolved.stateBitmap ?? 0),
      sources: [...resolved.sources] as EvidenceSource[],
    });
  }

  // ─── Position risk ──────────────────────────────────────────────────────
  //
  // PR-13 fills the §A5 PositionRisk surface: collateral + debt + healthFactor
  // (WAD) + LTV + liquidationDistance using Chainlink + Morpho LLTV. Reads are
  // pinned to a single block so the HF / LTV computation is internally
  // consistent.
  //
  // healthFactorWad = (collateralWstDiem * navPerShareWad / 1e18) *
  //                   (oraclePrice / 10^oracleDecimals) * lltv / debtDiem
  // (lltv is encoded in 1e18 WAD by Morpho.)

  async getPositionRisk(market: MarketId, owner: Address): Promise<PositionRisk> {
    const bundle = this.bundleFor(market);
    const morpho = new MorphoReader(this.readClient, bundle.morpho);
    const vault = new VaultReader(this.readClient, bundle.vault);
    const pinned = await this.readClient.getBlockNumber();
    const [position, marketState, navPerShare, marketParams] = await Promise.all([
      morpho.position(market, owner, pinned),
      morpho.market(market, pinned),
      vault.convertToAssets(10n ** 18n),
      this.registry.marketParams(market, pinned),
    ]);

    const debtDiem =
      marketState.totalBorrowShares > 0n
        ? (position.borrowShares * marketState.totalBorrowAssets) /
          marketState.totalBorrowShares
        : 0n;

    const errors: FailClosedErrorName[] = [];
    let oraclePrice: bigint | undefined;
    let oracleDecimals = 8; // Chainlink USD pairs default
    if (bundle.chainlinkFeed) {
      try {
        const chainlink = new ChainlinkReader(
          this.readClient,
          bundle.chainlinkFeed,
        );
        // PR-14 audit L-2 closure: enforce explicit staleness threshold using
        // block.timestamp as the "now" reference so client clock skew can't
        // hide stale data. Default 3600s; consumers can pin via config.
        const block = await this.readClient.getBlock({ blockNumber: pinned });
        const nowSeconds = Number(block.timestamp);
        // PR-14 audit adversarial L-10 + compliance M-10 closure: default
        // 3600s (1 hour) to match Chainlink ETH/USD heartbeat on Base. The
        // earlier draft used 86400s which made the threshold an order of
        // magnitude looser than the heartbeat — an attacker controlling the
        // RPC could replay an answer up to 24h old. Strict deployments can
        // tighten via `config.oracleStaleAfterSeconds`.
        const staleAfterSeconds = this.config.oracleStaleAfterSeconds ?? 3600;
        const reading = await chainlink.readWithStaleness({
          nowSeconds,
          staleAfterSeconds,
          blockNumber: pinned,
        });
        if (reading.answer > 0n) {
          oraclePrice = reading.answer;
          oracleDecimals = reading.decimals;
        } else {
          errors.push("OracleStale");
        }
      } catch (err) {
        const code = (err as { code?: string } | null | undefined)?.code;
        errors.push(code === "OracleStale" ? "OracleStale" : "OracleMissing");
      }
    }

    const result: PositionRisk = {
      owner,
      market,
      blockNumber: asBlockNumber(pinned),
      collateralWstDiem: position.collateral,
      debtDiem,
      errors,
    };

    if (oraclePrice !== undefined && debtDiem > 0n) {
      const oracleScale = 10n ** BigInt(oracleDecimals);
      const wad = 10n ** 18n;
      // collateralDiem = collateralWstDiem * navPerShare / 1e18  (in DIEM units)
      const collateralDiem = (position.collateral * navPerShare) / wad;
      // collateralUsdWad = collateralDiem * oraclePrice / oracleScale
      // (we treat DIEM/USD price the same — caller can post-scale)
      const collateralUsdWad = (collateralDiem * oraclePrice) / oracleScale;
      const liquidationThreshold =
        (collateralUsdWad * marketParams.lltv) / wad;
      if (debtDiem > 0n) {
        result.healthFactorWad =
          (liquidationThreshold * wad) / debtDiem;
        // leverage = collateralDiem / (collateralDiem - debtDiem)
        if (collateralDiem > debtDiem) {
          const equity = collateralDiem - debtDiem;
          const leverageScaled = (collateralDiem * 10_000n) / equity;
          (result as { leverageBps?: number }).leverageBps =
            Number(leverageScaled);
        }
        // liquidation distance = (HF - 1) * 10000 (clamped to non-negative)
        if (result.healthFactorWad !== undefined) {
          const hfMinusOne = result.healthFactorWad - wad;
          const distance =
            hfMinusOne > 0n
              ? Number((hfMinusOne * 10_000n) / wad)
              : 0;
          (result as { liquidationDistanceBps?: number }).liquidationDistanceBps =
            distance;
        }
      }
    }

    return result;
  }

  // ─── Automation policies ─────────────────────────────────────────────────

  async getAutomationPolicies(owner: Address, market?: MarketId): Promise<Policy[]> {
    // PR-10 indexer does NOT track market per policy. SDK callers passing
    // `market` will get back the unfiltered owner list — callers that need
    // per-market scoping must resolve via ActionStep history (PR-13).
    void market;
    const rows = await this.indexer.policies();
    return rows
      .filter((r) => r.owner.toLowerCase() === owner.toLowerCase())
      .map((r) => {
        const policyClass = POLICY_CLASS_FROM_U8[r.policyClass];
        if (!policyClass) {
          throw new Error(`Indexer returned unknown policyClass uint8 ${r.policyClass} for policy ${r.policyId}`);
        }
        const primaryType = PRIMARY_TYPE_FROM_U8[r.primaryType];
        if (!primaryType || primaryType === "AutomationExec" || primaryType === "Revoke") {
          throw new Error(`Indexer returned out-of-range primaryType ${r.primaryType} for policy ${r.policyId}`);
        }
        const policy: Policy = {
          policyId: r.policyId,
          owner: r.owner,
          primaryType,
          policyClass,
          policyHash: r.policyHash,
          // PR-10 indexer does not project nonce / mev / executionKind onto the
          // policy row. PR-13 will extend the /policies endpoint OR resolve from
          // LoopAuthorization.policyHash + a dedicated registry call. For now we
          // omit the optional fields.
          nonceSlot: 0n,
          nonceBit: 0,
          mevProtectionMode: "PRIVATE_BUILDER",
          mevWaiverBits: 0,
          executionKind: "OWNER_DIRECT",
          // PR-17 Gap 5 closure: surface acknowledgedRisks on FORCE_EXIT
          // policies (the only class that signs over a non-zero mask). The
          // indexer does not yet project the bits — default to 0 so the
          // app-side `decodeAcknowledgedRisks` returns an empty list rather
          // than throwing on undefined. PR-18 will lift the real bits from
          // LoopAuthorization.policyHash decoder.
          ...(policyClass === "FORCE_EXIT" ? { acknowledgedRisks: 0 } : {}),
          ...(r.expiryBlock !== undefined ? { expiryBlock: r.expiryBlock } : {}),
          ...(r.revokeInitiatedBlock !== undefined ? { revocationBlock: r.revokeInitiatedBlock } : {}),
        };
        return policy;
      });
  }

  async proposeAutomationAction(_policyId: PolicyId): Promise<TransactionPreview> {
    throw new Error("proposeAutomationAction is not implemented in PR-12; landing in PR-13.");
  }

  async executeAutomationProposal(_target: ProposalId | ActionDigest): Promise<Hex> {
    throw new Error("executeAutomationProposal is not implemented in PR-12; landing in PR-13.");
  }

  // ─── Anchor freshness ────────────────────────────────────────────────────

  async getAnchorFreshness(): Promise<AnchorFreshness> {
    const pinned = await this.readClient.getBlockNumber();
    const [snapshot, head] = await Promise.all([
      this.indexer.snapshotsLatest(),
      this.indexer.health(),
    ]);
    const freshness = this.classifyAnchor(snapshot, head);
    // A5-3 + PR-13 audit C-1/C-2/H-3: same fail-closed + block-pinned +
    // submitter-verified cross-check used in getReadiness. We pin to a fresh
    // chain-head snapshot here since getAnchorFreshness has no outer
    // readiness-block context.
    if (this.strictAnchor) {
      if (!snapshot || snapshot.anchorBlock === 0n) {
        throw new Error(
          "Anchor cross-check failed (no-indexer-anchor-claim): strictAnchorCrossCheck is on but the indexer returned no anchor claim.",
        );
      }
      const expectedSubmitter = await this.registry.anchorSubmitter(pinned);
      const result = await crossCheckAnchor(
        this.anchorRegistry,
        {
          anchorBlock: snapshot.anchorBlock,
          manifestHash: snapshot.manifestHash,
          blockNumber: snapshot.blockNumber,
          blockHash: snapshot.blockHash,
        },
        {
          planningBlock: asBlockNumber(pinned),
          expectedSubmitter,
          publicClient: this.readClient,
        },
      );
      if (!result.ok) {
        throw new Error(
          `Anchor cross-check failed (${result.reason}): ${result.details}`,
        );
      }
    }
    return freshness;
  }

  private classifyAnchor(
    snapshot: { anchorBlock: BlockNumber } | null,
    head: { head: { lastIndexedBlock: BlockNumber } | null },
  ): AnchorFreshness {
    const lastAnchoredBlock = snapshot?.anchorBlock ?? asBlockNumber(0n);
    const currentBlock = head.head ? head.head.lastIndexedBlock : lastAnchoredBlock;
    return classifyAnchorFreshness({
      lastAnchoredBlock,
      currentBlock,
      anchorMaxStaleBlocks: DEFAULT_ANCHOR_MAX_STALE_BLOCKS,
      anchorEmergencyMultiplier: DEFAULT_ANCHOR_EMERGENCY_MULTIPLIER,
    });
  }

  // ─── Static catalog ──────────────────────────────────────────────────────

  async getCanonicalErrors(): Promise<CanonicalError[]> {
    return [...CANONICAL_ERRORS];
  }

  // ─── External protocol fingerprints ─────────────────────────────────────

  async getExternalProtocolFingerprints(market: MarketId): Promise<ExternalProtocolFingerprint[]> {
    if (!this.config.integrationIds) {
      throw new Error(
        "getExternalProtocolFingerprints requires config.integrationIds — supply the registry " +
          "deployment manifest's bytes32 ids per integration to enable G-PM-3 fingerprint evaluation.",
      );
    }
    const bundle = this.bundleFor(market);
    const integrations = FINGERPRINT_INTEGRATIONS.map((integ) => {
      const sourceAddress = this.sourceAddressFor(bundle, integ.kind);
      return { ...integ, sourceAddress };
    }).filter((i): i is typeof i & { sourceAddress: Address } => i.sourceAddress !== undefined);

    const reads = await Promise.all(
      integrations.map((integ) =>
        this.registry.externalFingerprint(this.integrationIdHash(integ.id)).then(
          (raw) => ({ integ, raw }),
          (_err) => null,
        ),
      ),
    );
    const results: ExternalProtocolFingerprint[] = [];
    for (const entry of reads) {
      if (!entry) continue;
      const { integ, raw } = entry;
      results.push(
        classifyFingerprint({
          integrationId: raw.integrationId,
          integrationKind: integ.kind,
          sourceAddress: integ.sourceAddress,
          liveFingerprint: raw.fingerprintHash,
          expectedFingerprint: raw.hardEqualityHash,
        }),
      );
    }
    return results;
  }

  private integrationIdHash(label: string): Bytes32 {
    // SECURITY (A8-5): fail closed when integrationIds are not supplied. A
    // zero-byte lookup against registry.externalFingerprint either reverts
    // (caught) or returns a zero-initialized struct that the classifier reads
    // as "match" — both paths produced a false-clean fingerprint result. The
    // SDK now requires explicit integrationIds for the gate to evaluate.
    const id = this.config.integrationIds;
    if (!id) {
      throw new Error(
        `config.integrationIds is required to evaluate external protocol fingerprints. ` +
          `Set integrationIds = { 'curve-pool': '0x...', 'uniswap-pool': '0x...', ... } ` +
          `from the registry deployment manifest, or skip getExternalProtocolFingerprints().`,
      );
    }
    const entry = id[label as keyof typeof id];
    if (!entry) {
      throw new Error(
        `config.integrationIds['${label}'] missing — required for getExternalProtocolFingerprints.`,
      );
    }
    return entry as Bytes32;
  }

  private sourceAddressFor(
    bundle: MarketAddressBundle,
    kind: ExternalProtocolFingerprint["integrationKind"],
  ): Address | undefined {
    switch (kind) {
      case "CurvePool": return bundle.curvePool;
      case "UniswapV3Pool": return bundle.uniswapV3FlashPool;
      case "ChainlinkFeed": return bundle.chainlinkFeed;
      case "SequencerFeed": return bundle.sequencerUptimeFeed;
      case "WstDiemVault": return bundle.vault;
      case "MorphoMarket": return bundle.morpho;
    }
  }

  // ─── Event decoding (full §11 set) ───────────────────────────────────────

  async decodeLoopEvent(log: { address: Address; topics: Hex[]; data: Hex }): Promise<unknown> {
    // PR-13 audit C-3 fix: refuse to decode events emitted by addresses that
    // are NOT the registered Loop contracts. An attacker contract can emit a
    // forged LoopExitedV2 with arbitrary fields; a UI that displays "your
    // loop was exited with diemReturned=..." from the decoded result would
    // be trusting attacker-controlled state.
    const allowed = this.knownEventEmitters();
    const lcAddr = log.address.toLowerCase();
    let allowedFor: string | null = null;
    for (const [name, addrs] of allowed) {
      if (addrs.has(lcAddr)) {
        allowedFor = name;
        break;
      }
    }
    if (!allowedFor) {
      throw new Error(
        `decodeLoopEvent: refusing to decode event from untrusted address ${log.address}. Only events emitted by the registered Loop contracts are decodable.`,
      );
    }
    let decoded: unknown;
    try {
      decoded = decodeEventLog({
        abi: LOOP_EVENTS_FULL_ABI,
        topics: log.topics as never,
        data: log.data,
      });
    } catch {
      // PR-13 audit M-3 fix: sanitize the inner error so we don't echo raw
      // topic/data bytes back to caller logs.
      throw new Error(
        `decodeLoopEvent: unable to decode event from ${log.address} (EventDecodeFailure)`,
      );
    }
    return decoded;
  }

  private _knownEmittersCache: Map<string, Set<string>> | null = null;
  private knownEventEmitters(): Map<string, Set<string>> {
    if (this._knownEmittersCache) return this._knownEmittersCache;
    const c = this.config.contracts;
    const lc = (a: Address) => a.toLowerCase();
    // Each entry maps a category to the set of addresses that may legitimately
    // emit events the SDK will decode. The category names are descriptive
    // only; the lookup just verifies the address belongs to ANY trusted
    // contract.
    const map = new Map<string, Set<string>>([
      ["authorization", new Set([lc(c.loopAuthorization)])],
      ["forceExitAuthorizer", new Set([lc(c.loopForceExitAuthorizer)])],
      ["executor", new Set([lc(c.loopExecutorV2), lc(c.loopForceExitExecutor)])],
      ["registry", new Set([lc(c.loopRegistry)])],
      ["anchor", new Set([lc(c.loopAnchorRegistry)])],
    ]);
    this._knownEmittersCache = map;
    return map;
  }

  // ─── Calldata decoding (round-trip with buildTransaction) ───────────────

  async decodeCalldata(calldata: Hex): Promise<Action> {
    // Try executeOpen/executeRebalance/executeExit against LoopExecutorV2 ABI
    // first; fall back to LoopForceExitExecutor's executeForceExit.
    const allAbis = [
      { abi: LOOP_EXECUTOR_V2_ABI, fns: ["executeOpen", "executeRebalance", "executeExit"] as const },
      { abi: LOOP_FORCE_EXIT_EXECUTOR_ABI, fns: ["executeForceExit"] as const },
    ];
    for (const candidate of allAbis) {
      try {
        const decoded = decodeFunctionData({ abi: candidate.abi as never, data: calldata });
        return this.calldataToAction(
          decoded.functionName as string,
          decoded.args as readonly unknown[],
        );
      } catch {
        // Try next candidate.
      }
    }
    throw new Error(
      "decodeCalldata: input did not match any LoopExecutor entrypoint signature " +
        "(executeOpen / executeRebalance / executeExit / executeForceExit).",
    );
  }

  private calldataToAction(
    fnName: string,
    args: readonly unknown[],
  ): Action {
    const raw = args[0] as Record<string, unknown> & {
      identity: Record<string, unknown>;
      freshness: Record<string, unknown>;
      executionKind: number;
      mevProtectionMode: number;
      mevWaiverBits: number;
      bounds: Record<string, unknown>;
      hashes: Record<string, unknown>;
    };
    const identity = raw.identity as Record<string, bigint | string | number>;
    const freshness = raw.freshness as Record<string, bigint | number>;
    const hashes = raw.hashes as Record<string, string>;
    // PR-13 audit H-2 fix: range-validate enum values instead of silently
    // coercing unknowns to safe defaults. A consumer that decodes attacker-
    // controlled calldata to "verify it's safe" must see the rejection, not
    // be lied to about the policy class.
    const executionKindU8 = Number(raw.executionKind);
    const mevModeU8 = Number(raw.mevProtectionMode);
    const mevWaiverBits = Number(raw.mevWaiverBits);
    const executionKind = EXECUTION_KIND_FROM_U8[executionKindU8];
    const mevProtectionMode = MEV_PROTECTION_MODE_FROM_U8[mevModeU8];
    if (executionKind === undefined) {
      throw new Error(
        `decodeCalldata: ExecutionKind out of range (u8=${executionKindU8})`,
      );
    }
    if (mevProtectionMode === undefined) {
      throw new Error(
        `decodeCalldata: MevProtectionMode out of range (u8=${mevModeU8})`,
      );
    }
    if (mevWaiverBits < 0 || mevWaiverBits > 0xff) {
      throw new Error(
        `decodeCalldata: mevWaiverBits out of uint8 range (${mevWaiverBits})`,
      );
    }
    const common = {
      owner: identity.owner as Address,
      chainId: Number(identity.chainId) as never,
      verifyingContract: identity.verifyingContract as Address,
      market: identity.market as never,
      executor: identity.executor as Address,
      registryVersion: identity.registryVersion as never,
      registryMerkleRoot: identity.registryMerkleRoot as never,
      policyId: identity.policyId as never,
      nonceSlot: BigInt(identity.nonceSlot as bigint),
      nonceBit: Number(identity.nonceBit),
      executionKind,
      mevProtectionMode,
      mevWaiverBits,
      deadline: Number(freshness.deadline) as never,
      quoteBlockNumber: freshness.quoteBlockNumber as never,
      maxQuoteAgeBlocks: Number(freshness.maxQuoteAgeBlocks),
      maxQuoteDeviationBps: Number(freshness.maxQuoteDeviationBps) as never,
      evidenceBundleHash: hashes.evidenceBundleHash as never,
    };
    const bounds = raw.bounds as Record<string, bigint | number | boolean>;
    const feeCaps = bounds.feeCaps as Record<string, bigint> | undefined;
    switch (fnName) {
      case "executeOpen":
        return {
          ...common,
          primaryType: "Open",
          bounds: {
            minWstDiemReceived: BigInt(bounds.minWstDiemReceived as bigint),
            minBorrowedDiem: BigInt(bounds.minBorrowedDiem as bigint),
            maxBorrowedDiem: BigInt(bounds.maxBorrowedDiem as bigint),
            maxSlippageBps: Number(bounds.maxSlippageBps) as never,
            maxPriceImpactBps: Number(bounds.maxPriceImpactBps) as never,
            maxLeverageBps: Number(bounds.maxLeverageBps) as never,
            minHealthFactor: BigInt(bounds.minHealthFactor as bigint),
            minLiquidationDistanceBps: Number(bounds.minLiquidationDistanceBps) as never,
            maxMorphoUtilizationImpactBps: Number(bounds.maxMorphoUtilizationImpactBps) as never,
            flashFeeCap: BigInt(feeCaps?.flashFeeCap ?? 0n),
            protocolFeeCap: BigInt(feeCaps?.protocolFeeCap ?? 0n),
            automationFeeCap: BigInt(feeCaps?.automationFeeCap ?? 0n),
          },
        } as Action;
      case "executeRebalance":
        return {
          ...common,
          primaryType: "Rebalance",
          bounds: {
            targetLeverageBps: Number(bounds.targetLeverageBps) as never,
            targetLeverageToleranceBps: Number(bounds.targetLeverageToleranceBps) as never,
            minPostHealthFactor: BigInt(bounds.minPostHealthFactor as bigint),
            minLiquidationDistanceBps: Number(bounds.minLiquidationDistanceBps) as never,
            maxDebtIncrease: BigInt(bounds.maxDebtIncrease as bigint),
            maxCollateralSold: BigInt(bounds.maxCollateralSold as bigint),
            maxSlippageBps: Number(bounds.maxSlippageBps) as never,
            maxCurvePositionShareBps: Number(bounds.maxCurvePositionShareBps) as never,
            maxMorphoUtilizationImpactBps: Number(bounds.maxMorphoUtilizationImpactBps) as never,
            flashFeeCap: BigInt(feeCaps?.flashFeeCap ?? 0n),
            protocolFeeCap: BigInt(feeCaps?.protocolFeeCap ?? 0n),
            automationFeeCap: BigInt(feeCaps?.automationFeeCap ?? 0n),
          },
        } as Action;
      case "executeExit":
        return {
          ...common,
          primaryType: "Exit",
          routeKind: bounds.repayOnly ? "REPAY_ONLY" : "CURVE",
          bounds: {
            minRepayment: BigInt(bounds.minRepayment as bigint),
            maxCollateralSold: BigInt(bounds.maxCollateralSold as bigint),
            maxSlippageBps: Number(bounds.maxSlippageBps) as never,
            maxCurvePositionShareBps: Number(bounds.maxCurvePositionShareBps) as never,
            maxMorphoUtilizationImpactBps: Number(bounds.maxMorphoUtilizationImpactBps) as never,
            flashFeeCap: BigInt(feeCaps?.flashFeeCap ?? 0n),
            protocolFeeCap: BigInt(feeCaps?.protocolFeeCap ?? 0n),
            automationFeeCap: BigInt(feeCaps?.automationFeeCap ?? 0n),
            repayOnly: bounds.repayOnly as boolean,
            acceptsThirdPartyRepay: bounds.acceptsThirdPartyRepay as boolean,
          },
        } as Action;
      case "executeForceExit":
        return {
          ...common,
          primaryType: "ForceExit",
          bounds: {
            minRepayment: BigInt(bounds.minRepayment as bigint),
            maxCollateralSold: BigInt(bounds.maxCollateralSold as bigint),
            looseSlippageBps: Number(bounds.looseSlippageBps) as never,
            looseFlashFeeCap: BigInt(bounds.looseFlashFeeCap as bigint),
            maxCurvePositionShareBps: Number(bounds.maxCurvePositionShareBps) as never,
            acknowledgedRisks: Number(bounds.acknowledgedRisks),
          },
        } as Action;
    }
    throw new Error(`decodeCalldata: unsupported executor entrypoint ${fnName}`);
  }

  // ─── Authorization + transaction construction ────────────────────────────

  async buildAuthorization(action: Action): Promise<{
    typedData: unknown;
    digest: ActionDigest;
    evidence: ActionEvidence;
  }> {
    return this.assembleAuthorization(action).then(
      ({ digest, evidence, typedData }) => ({ digest, evidence, typedData }),
    );
  }

  /**
   * Full action assembly used by both buildAuthorization (returns typed data
   * + digest + evidence) and buildTransaction (also returns calldata + routes
   * + sub-hashes). Single method so the digest the wallet signs and the
   * digest the executor recomputes from calldata are bit-identical.
   */
  private async assembleAuthorization(
    action: Action,
    opts?: { pinnedBlockNumber?: BlockNumber },
  ): Promise<{
    typedData: unknown;
    digest: ActionDigest;
    evidence: ActionEvidence;
    subHashes: DigestSubHashes;
    marketParams: MorphoMarketParams;
    routes: readonly QuoteRoute[];
    domainSeparator: Bytes32;
    pinnedBlockNumber: BlockNumber;
  }> {
    // PR-15: pin to a caller-supplied block when provided so `attachSignature`
    // recomputes the same digest as the original `buildTransaction` call
    // (audit-deferred follow-up: catches the chain-advancement digest drift
    // that PR-14 left as a sharp edge). When not pinned, falls back to a
    // fresh chain head.
    const pinnedBn = opts?.pinnedBlockNumber
      ? BigInt(opts.pinnedBlockNumber)
      : await this.readClient.getBlockNumber();
    const pinned = asBlockNumber(pinnedBn);
    // SECURITY (A10-1): ForceExit uses the distinct LoopForceExitAuthorizer
    // domain per §A6.2.1; signing against LoopAuthorization's domain would
    // produce a digest the on-chain validateForceExitDigest call rejects.
    const isForceExit = action.primaryType === "ForceExit";
    const domainSeparator: Bytes32 = isForceExit
      ? await this.forceExitAuthorizer.domainSeparator()
      : await this.authorization.domainSeparator();
    const marketParams = await this.registry.marketParams(action.market, pinnedBn);
    const evidence = await this.resolveEvidence(action, pinnedBn);
    const routes = await this.deriveRoutes(action);
    // PR-14 audit M-2 fix: actions that have a quoter CONFIGURED but where
    // every quote attempt returned empty must NOT silently produce a zero
    // quoteHash. Catches RPC failures, pool reverts, slippage misconfig
    // before a user signs a digest committing no slippage bound. Bundles
    // that don't configure a quoter at all skip the check — the digest then
    // commits a deliberately empty quote (e.g. for repay-only flows or
    // staging integrations).
    if (
      requiresQuoteRoutes(action) &&
      routes.length === 0 &&
      hasQuoterConfigured(action, this.bundleFor(action.market), this.config)
    ) {
      throw new Error(
        `buildAuthorization: ${action.primaryType} requires at least one quote route, ` +
          "but the on-chain quoter(s) returned no usable quote. Check Curve/Uniswap " +
          "pool addresses + input bounds in your MarketAddressBundle.",
      );
    }
    const subHashes = this.assembleSubHashes(action, routes, evidence.evidenceBundleHash);
    const digest = this.dispatchDigest(action, domainSeparator, subHashes, marketParams);
    const typedData = this.buildTypedData(action, marketParams, subHashes);
    return {
      typedData,
      digest,
      evidence,
      subHashes,
      marketParams,
      routes,
      domainSeparator,
      pinnedBlockNumber: pinned,
    };
  }

  async buildTransaction(action: Action): Promise<{
    to: Address;
    data: Hex;
    value: bigint;
    digest: ActionDigest;
    pinnedBlockNumber: BlockNumber;
  }> {
    const assembled = await this.assembleAuthorization(action);
    const executor = await this.registry.executorFor(action.primaryType);
    const data = this.encodeExecutorCalldata(action, assembled, "0x" as Hex);
    return {
      to: executor,
      data,
      value: 0n,
      digest: assembled.digest,
      pinnedBlockNumber: assembled.pinnedBlockNumber,
    };
  }

  /**
   * PR-14: complete the calldata produced by buildTransaction by splicing the
   * wallet signature into the `bytes sig` slot. Recomputes calldata via
   * encodeFunctionData against the same executor ABI to guarantee correct
   * dynamic-offset adjustment.
   *
   * The caller pattern is:
   *   1. `const { data: unsigned, digest } = await sdk.buildTransaction(action)`
   *   2. `const sig = await wallet.signTypedData(typedData)`
   *   3. `const signed = await sdk.attachSignature(action, sig)`
   *
   * Internally re-runs `assembleAuthorization(action)` so the sub-hashes,
   * evidence, and quote routes match the digest the wallet signed. If the
   * action's quote inputs have drifted since `buildTransaction` (a stale
   * quote), this throws `QuoteDrift` rather than producing a calldata the
   * on-chain validator will reject silently.
   *
   * Returns the full calldata + executor address + digest.
   */
  async attachSignature(
    action: Action,
    signature: Hex,
    expectedDigest?: ActionDigest,
    opts?: { pinnedBlockNumber?: BlockNumber },
  ): Promise<{ to: Address; data: Hex; value: bigint; digest: ActionDigest }> {
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new Error(
        "attachSignature: signature must be a 0x-prefixed hex string",
      );
    }
    // PR-17 audit C-1 closure: bound caller-supplied pinnedBlockNumber against
    // staleness AND head. Stale-bundle replay vector — wallet signs at block X,
    // attacker holds signed bundle, calls attachSignature with pinnedBlockNumber
    // X hours later against fresh chain head. Throws QuoteStale on out-of-window
    // pins so the §6.3 quote-freshness envelope is enforced on the signing
    // path the same way the executor enforces it on-chain.
    const head = await this.readClient.getBlockNumber();
    if (opts?.pinnedBlockNumber !== undefined) {
      const pinnedBn = BigInt(opts.pinnedBlockNumber);
      if (pinnedBn > head) {
        throw new Error(
          `attachSignature: QuoteStale — pinnedBlockNumber=${pinnedBn} is ahead of ` +
            `chain head=${head}. Future-block pins are rejected to defeat stale-bundle replay.`,
        );
      }
      const maxAge = BigInt(action.maxQuoteAgeBlocks);
      if (head - pinnedBn > maxAge) {
        throw new Error(
          `attachSignature: QuoteStale — pinnedBlockNumber=${pinnedBn} is older than ` +
            `head-maxQuoteAgeBlocks (head=${head}, maxQuoteAgeBlocks=${action.maxQuoteAgeBlocks}). ` +
            "Refresh the quote and re-sign.",
        );
      }
    }
    // PR-15 closure: re-pin to the same block buildTransaction used so the
    // recomputed digest matches even when the chain has advanced. Without
    // pinning, fresh `getBlockNumber()` in `resolveEvidence` would change
    // the evidence bundle's blockNumber field and cause spurious QuoteDrift.
    // When unpinned, pass `head` explicitly so the pin is observable and the
    // freshness bound just enforced above flows downstream.
    const effectivePin: BlockNumber =
      opts?.pinnedBlockNumber !== undefined
        ? opts.pinnedBlockNumber
        : asBlockNumber(head);
    const assembled = await this.assembleAuthorization(action, {
      pinnedBlockNumber: effectivePin,
    });
    if (expectedDigest && assembled.digest.toLowerCase() !== expectedDigest.toLowerCase()) {
      throw new Error(
        `attachSignature: QuoteDrift — the action's recomputed digest=${assembled.digest} ` +
          `differs from the signed digest=${expectedDigest}. The quote/evidence inputs have ` +
          "changed between buildTransaction and signing. Refresh the quote and re-sign.",
      );
    }
    const executor = await this.registry.executorFor(action.primaryType);
    const data = this.encodeExecutorCalldata(action, assembled, signature);
    // PR-17 audit MAJ-1 closure: include `value: 0n` to match §A5
    // buildTransaction sibling shape. Phase 1 executor calldata is always
    // payable=false; value is fixed at 0.
    return { to: executor, data, value: 0n, digest: assembled.digest };
  }

  async revokeAuthorization(target: PolicyId | ActionDigest): Promise<{
    typedData: unknown;
    transaction: { to: Address; data: Hex };
  }> {
    const to = this.config.contracts.loopAuthorization;
    // D-5: policyId → owner-direct revoke(uint64). ActionDigest must not
    // return empty calldata — require an explicit cancelNonce envelope or
    // use buildRevokeTransaction for signed executeRevoke.
    if (typeof target === "bigint") {
      const data = encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "revoke",
            inputs: [{ type: "uint64" }],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ] as const,
        functionName: "revoke",
        args: [target],
      }) as Hex;
      return { typedData: { target }, transaction: { to, data } };
    }
    throw new Error(
      "revokeAuthorization(ActionDigest) is unsupported — use revokeAuthorization(policyId) " +
        "for owner-direct revoke, or buildRevokeExecuteTransaction() for signed executeRevoke.",
    );
  }

  /**
   * D-5: encode LoopAuthorization.executeRevoke(digest, sig, action) for a
   * pre-signed Revoke envelope. Does not re-sign; caller attaches `signature`.
   */
  async buildRevokeExecuteTransaction(args: {
    digest: Hex;
    signature: Hex;
    action: {
      identity: unknown;
      freshness: unknown;
      executionKind: number;
      bounds: { policyId: bigint; policyClass: number; effectiveBlock: bigint };
      hashes: unknown;
    };
  }): Promise<{ to: Address; data: Hex; value: 0n; digest: Hex }> {
    const data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "executeRevoke",
          inputs: [
            { name: "digest", type: "bytes32" },
            { name: "sig", type: "bytes" },
            {
              name: "action",
              type: "tuple",
              components: [
                {
                  name: "identity",
                  type: "tuple",
                  components: [
                    { name: "owner", type: "address" },
                    { name: "deadline", type: "uint256" },
                    { name: "executor", type: "address" },
                    { name: "market", type: "bytes32" },
                    { name: "verifyingContract", type: "address" },
                    { name: "registryVersion", type: "uint256" },
                    { name: "registryMerkleRoot", type: "bytes32" },
                    { name: "policyId", type: "uint64" },
                    { name: "nonceSlot", type: "uint248" },
                    { name: "nonceBit", type: "uint8" },
                  ],
                },
                {
                  name: "freshness",
                  type: "tuple",
                  components: [
                    { name: "quoteBlockNumber", type: "uint256" },
                    { name: "maxQuoteAgeBlocks", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                    { name: "maxRpcBlockLag", type: "uint16" },
                  ],
                },
                { name: "executionKind", type: "uint8" },
                {
                  name: "bounds",
                  type: "tuple",
                  components: [
                    { name: "policyId", type: "uint64" },
                    { name: "policyClass", type: "uint8" },
                    { name: "effectiveBlock", type: "uint256" },
                  ],
                },
                {
                  name: "hashes",
                  type: "tuple",
                  components: [
                    { name: "evidenceBundleHash", type: "bytes32" },
                    { name: "actionId", type: "bytes32" },
                    { name: "evidenceSetId", type: "bytes32" },
                    { name: "reserved0", type: "bytes32" },
                    { name: "reserved1", type: "bytes32" },
                  ],
                },
              ],
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ] as const,
      functionName: "executeRevoke",
      args: [args.digest, args.signature, args.action as never],
    }) as Hex;
    return {
      to: this.config.contracts.loopAuthorization,
      data,
      value: 0n,
      digest: args.digest,
    };
  }

  // ─── T2a: envelope derivation from friendly inputs ──────────────────────
  //
  // Each helper composes the existing readers (registry / authorization),
  // the read client (fresh block), and config (verifyingContract + executor)
  // into a fully-assembled action envelope. The critical digest fields —
  // registryVersion, registryMerkleRoot, nonceSlot/nonceBit, quoteBlockNumber,
  // verifyingContract, executor, policyId (0), executionKind (defaults to
  // KEEPER_PERMISSIONLESS; callers may override via `input.executionKind`) —
  // are derived here so callers never hand-build them. `evidenceBundleHash`
  // is populated via the same `resolveEvidence` path `assembleAuthorization`
  // uses, so the envelope's field matches what the digest will commit at the
  // pinned block. (Note: `assembleAuthorization` re-resolves evidence at quote
  // /sign time, so this field is belt-and-suspenders — the digest never trusts
  // the caller-supplied value.)

  async buildOpenParams(input: BuildOpenParamsInput): Promise<OpenAction> {
    const base = await this.deriveEnvelopeBase(input, "Open");
    const slippageBps = input.slippageBps ?? asBasisPoints(DEFAULT_SLIPPAGE_BPS);
    const draft: OpenAction = {
      ...this.commonEnvelopeFields(
        input,
        base,
        this.contracts.loopAuthorization,
        this.contracts.loopExecutorV2,
      ),
      primaryType: "Open",
      bounds: await this.deriveOpenBounds(input, slippageBps),
    };
    return this.withEvidenceHash(draft, base.pinned);
  }

  async buildRebalanceParams(
    input: BuildRebalanceParamsInput,
  ): Promise<RebalanceAction> {
    const base = await this.deriveEnvelopeBase(input, "Rebalance");
    const slippageBps = input.slippageBps ?? asBasisPoints(DEFAULT_SLIPPAGE_BPS);
    const draft: RebalanceAction = {
      ...this.commonEnvelopeFields(
        input,
        base,
        this.contracts.loopAuthorization,
        this.contracts.loopExecutorV2,
      ),
      primaryType: "Rebalance",
      bounds: this.deriveRebalanceBounds(input, slippageBps),
    };
    return this.withEvidenceHash(draft, base.pinned);
  }

  async buildExitParams(input: BuildExitParamsInput): Promise<ExitAction> {
    const base = await this.deriveEnvelopeBase(input, "Exit");
    const slippageBps = input.slippageBps ?? asBasisPoints(DEFAULT_SLIPPAGE_BPS);
    const routeKind: ExitRouteKind = input.routeKind ?? "CURVE";
    const draft: ExitAction = {
      ...this.commonEnvelopeFields(
        input,
        base,
        this.contracts.loopAuthorization,
        this.contracts.loopExecutorV2,
      ),
      primaryType: "Exit",
      routeKind,
      bounds: this.deriveExitBounds(input, slippageBps, routeKind),
    };
    return this.withEvidenceHash(draft, base.pinned);
  }

  async buildForceExitParams(
    input: BuildForceExitParamsInput,
  ): Promise<ForceExitAction> {
    // ForceExit binds to the distinct LoopForceExitAuthorizer domain +
    // LoopForceExitExecutor, per §A6.2.1.
    // Audit C: refuse to build a digest that would revert on-chain for
    // missing risk waivers or I-67 multi-critical overbreadth.
    const liveBitmap = await this.readLiveStateBitmap(
      input.market,
      input.owner,
    );
    const requiredRisks = requiredForceExitRiskBitsFromStateBitmap(liveBitmap);
    if (forceExitBlockedByMultiCritical(requiredRisks)) {
      throw new Error(
        `ForceExit blocked: live state bitmap 0x${liveBitmap.toString(16)} ` +
          `requires multiple critical risk overrides (0x${requiredRisks.toString(16)}). ` +
          `Phase-1 I-67 allows only one critical override per digest — wait for ` +
          `market recovery to a single-degraded or healthy state.`,
      );
    }
    assertForceExitRisksCoverRequired(input.acknowledgedRisks, requiredRisks);

    const base = await this.deriveEnvelopeBase(input, "ForceExit");
    const slippageBps = input.slippageBps ?? asBasisPoints(DEFAULT_SLIPPAGE_BPS);
    const draft: ForceExitAction = {
      ...this.commonEnvelopeFields(
        input,
        base,
        this.contracts.loopForceExitAuthorizer,
        this.contracts.loopForceExitExecutor,
      ),
      primaryType: "ForceExit",
      bounds: this.deriveForceExitBounds(input, slippageBps),
    };
    return this.withEvidenceHash(draft, base.pinned);
  }

  /**
   * Live §7.1 state bitmap from LoopRiskOracleAdapter.computeStateBitmap.
   * Returns 0 when the adapter is missing or the call fails (unit harnesses).
   */
  async readLiveStateBitmap(
    market: MarketId,
    owner?: Address,
  ): Promise<number> {
    const adapter = this.contracts.loopRiskOracleAdapter;
    if (
      !adapter ||
      adapter === "0x0000000000000000000000000000000000000000"
    ) {
      return 0;
    }
    try {
      const raw = (await this.readClient.readContract({
        address: adapter,
        abi: LOOP_RISK_ORACLE_READ_ABI,
        functionName: "computeStateBitmap",
        args: [
          market,
          (owner ??
            "0x0000000000000000000000000000000000000000") as Address,
        ],
      })) as number | bigint;
      return Number(raw) & 0xffff;
    } catch {
      return 0;
    }
  }

  /** Source registryVersion + merkleRoot (registry reader), a fresh quote
   * block (read client), an unused nonce slot/bit (authorization reader), and
   * a deadline `deadlineSeconds` from now. */
  private async deriveEnvelopeBase(
    input: BuildParamsCommon,
    primaryType: PrimaryType,
  ): Promise<EnvelopeBase> {
    const [registryVersion, registryMerkleRoot, quoteBlockNumber] =
      await Promise.all([
        this.registry.registryVersion(),
        this.registry.registryMerkleRoot(),
        this.readClient.getBlockNumber(),
      ]);
    // ForceExit does NOT spend the LoopAuthorization nonce bitmap: it executes
    // through LoopForceExitExecutor, whose replay protection is the per-attempt
    // throttle counter + the signed `deadline` + position state (a successful
    // force-exit empties the position, so a replay reverts). The bitmap is never
    // written for FORCE_EXIT, so scanning it would always return bit 0 and imply
    // a uniqueness guarantee that the chain does not provide. Use a deterministic
    // (slot 0, bit 0) nonce — it only feeds the digest, not an on-chain spend.
    const nonce =
      primaryType === "ForceExit"
        ? { nonceSlot: 0n, nonceBit: 0 }
        : await this.allocateNonce(input.owner, 0n, primaryType);
    const deadlineSeconds = input.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS;
    const deadline = asUnixSeconds(
      BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
    );
    return {
      registryVersion: asRegistryVersion(registryVersion),
      registryMerkleRoot,
      quoteBlockNumber: asBlockNumber(quoteBlockNumber),
      pinned: quoteBlockNumber,
      nonceSlot: nonce.nonceSlot,
      nonceBit: nonce.nonceBit,
      deadline,
    };
  }

  /** Scan the (owner, policyId, primaryType) nonce bitmap for the first
   * unused bit, walking successive slots when a slot is fully consumed. Used
   * for Open/Rebalance/Exit (spent by LoopAuthorization); NOT for ForceExit,
   * which does not consume this bitmap — see `deriveEnvelopeBase`. */
  private async allocateNonce(
    owner: Address,
    policyId: bigint,
    primaryType: PrimaryType,
  ): Promise<{ nonceSlot: bigint; nonceBit: number }> {
    for (let slot = 0n; slot < NONCE_SLOT_SCAN_LIMIT; slot++) {
      const bitmap = await this.authorization.nonceBitmap(
        owner,
        policyId,
        primaryType,
        slot,
      );
      for (let bit = 0; bit < 256; bit++) {
        if ((bitmap & (1n << BigInt(bit))) === 0n) {
          return { nonceSlot: slot, nonceBit: bit };
        }
      }
    }
    throw new Error(
      `allocateNonce: no free nonce bit in the first ${NONCE_SLOT_SCAN_LIMIT} ` +
        `slots for ${primaryType} (owner=${owner}). Revoke stale authorizations ` +
        "or widen the scan window.",
    );
  }

  /** Assemble the primaryType-agnostic envelope fields. `evidenceBundleHash`
   * starts as the zero placeholder and is filled by `withEvidenceHash`. */
  private commonEnvelopeFields(
    input: BuildParamsCommon,
    base: EnvelopeBase,
    verifyingContract: Address,
    executor: Address,
  ): Omit<CommonActionEnvelope, "primaryType"> {
    return {
      owner: input.owner,
      chainId: this.config.chainId,
      verifyingContract,
      executor,
      market: input.market,
      registryVersion: base.registryVersion,
      registryMerkleRoot: base.registryMerkleRoot,
      policyId: asPolicyId(0n),
      nonceSlot: base.nonceSlot,
      nonceBit: base.nonceBit,
      // Users act through the executor, so on-chain validate*() sees the
      // executor as the caller — OWNER_DIRECT (executionCaller == owner) can
      // never satisfy and reverts ExecutionKindMismatch. Default to the
      // permissionless keeper path (owner's signature still fully binds
      // bounds/nonce/deadline); callers may opt into OWNER_DIRECT explicitly.
      executionKind: input.executionKind ?? "KEEPER_PERMISSIONLESS",
      deadline: base.deadline,
      quoteBlockNumber: base.quoteBlockNumber,
      maxQuoteAgeBlocks: DEFAULT_MAX_QUOTE_AGE_BLOCKS,
      maxQuoteDeviationBps: asBasisPoints(DEFAULT_MAX_QUOTE_DEVIATION_BPS),
      mevProtectionMode: input.mevProtectionMode,
      mevWaiverBits: input.mevWaiverBits,
      evidenceBundleHash: ZERO_BYTES32,
    };
  }

  /** Fill `evidenceBundleHash` via the same resolveEvidence path the digest
   * assembly uses, pinned to the quote block. */
  private async withEvidenceHash<T extends Action>(
    draft: T,
    pinned: bigint,
  ): Promise<T> {
    const evidence = await this.resolveEvidence(draft, pinned);
    return { ...draft, evidenceBundleHash: evidence.evidenceBundleHash };
  }

  private async deriveOpenBounds(
    input: BuildOpenParamsInput,
    slippageBps: BasisPoints,
  ): Promise<OpenBounds> {
    const leverageBps = BigInt(input.leverageBps);
    const levMinusOne = leverageBps > BPS_DENOM ? leverageBps - BPS_DENOM : 0n;
    const notionalBorrow = (input.collateralAmount * levMinusOne) / BPS_DENOM;
    const slip = BigInt(slippageBps);
    const maxBorrowedDiem = (notionalBorrow * (BPS_DENOM + slip)) / BPS_DENOM;
    const minBorrowedDiem = (notionalBorrow * (BPS_DENOM - slip)) / BPS_DENOM;
    // The Open leg deposits the borrowed DIEM (loan token / vault asset) into
    // the wstDIEM ERC-4626 vault, receiving wstDIEM *shares* as collateral. The
    // floor on shares received is therefore the vault's live convertToShares of
    // the borrow, minus the slippage haircut — NOT the raw DIEM amount, which
    // only equals the share amount when the vault trades 1:1 (i.e. before any
    // yield accrual). Using convertToShares makes the signed bound correct for a
    // vault whose exchange rate has drifted from parity.
    const vault = new VaultReader(
      this.readClient,
      this.bundleFor(input.market).vault,
      this.config.vaultConvertToSharesUnsupported ?? false,
    );
    const expectedShares = await vault.convertToShares(notionalBorrow);
    const minWstDiemReceived = (expectedShares * (BPS_DENOM - slip)) / BPS_DENOM;
    return {
      minWstDiemReceived,
      minBorrowedDiem,
      maxBorrowedDiem,
      maxSlippageBps: slippageBps,
      maxPriceImpactBps: slippageBps,
      maxLeverageBps: input.leverageBps,
      minHealthFactor: DEFAULT_MIN_HEALTH_FACTOR_WAD,
      minLiquidationDistanceBps: asBasisPoints(DEFAULT_MIN_LIQ_DISTANCE_BPS),
      maxMorphoUtilizationImpactBps: asBasisPoints(DEFAULT_MAX_UTIL_IMPACT_BPS),
      flashFeeCap: (maxBorrowedDiem * DEFAULT_FLASH_FEE_BPS) / BPS_DENOM,
      protocolFeeCap:
        (input.collateralAmount * DEFAULT_PROTOCOL_FEE_BPS) / BPS_DENOM,
      automationFeeCap: 0n,
    };
  }

  private deriveRebalanceBounds(
    input: BuildRebalanceParamsInput,
    slippageBps: BasisPoints,
  ): RebalanceBounds {
    const leverageBps = BigInt(input.leverageBps);
    const levMinusOne = leverageBps > BPS_DENOM ? leverageBps - BPS_DENOM : 0n;
    const maxDebtIncrease = (input.collateralAmount * levMinusOne) / BPS_DENOM;
    return {
      targetLeverageBps: input.leverageBps,
      targetLeverageToleranceBps: asBasisPoints(DEFAULT_LEVERAGE_TOLERANCE_BPS),
      minPostHealthFactor: DEFAULT_MIN_HEALTH_FACTOR_WAD,
      minLiquidationDistanceBps: asBasisPoints(DEFAULT_MIN_LIQ_DISTANCE_BPS),
      maxDebtIncrease,
      maxCollateralSold: input.collateralAmount,
      maxSlippageBps: slippageBps,
      maxCurvePositionShareBps: asBasisPoints(DEFAULT_MAX_CURVE_SHARE_BPS),
      maxMorphoUtilizationImpactBps: asBasisPoints(DEFAULT_MAX_UTIL_IMPACT_BPS),
      flashFeeCap: (maxDebtIncrease * DEFAULT_FLASH_FEE_BPS) / BPS_DENOM,
      protocolFeeCap:
        (input.collateralAmount * DEFAULT_PROTOCOL_FEE_BPS) / BPS_DENOM,
      automationFeeCap: 0n,
    };
  }

  private deriveExitBounds(
    input: BuildExitParamsInput,
    slippageBps: BasisPoints,
    routeKind: ExitRouteKind,
  ): ExitBounds {
    const slip = BigInt(slippageBps);
    const minRepayment =
      (input.collateralAmount * (BPS_DENOM - slip)) / BPS_DENOM;
    return {
      minRepayment,
      maxCollateralSold: input.collateralAmount,
      maxSlippageBps: slippageBps,
      maxCurvePositionShareBps: asBasisPoints(DEFAULT_MAX_CURVE_SHARE_BPS),
      maxMorphoUtilizationImpactBps: asBasisPoints(DEFAULT_MAX_UTIL_IMPACT_BPS),
      flashFeeCap: (input.collateralAmount * DEFAULT_FLASH_FEE_BPS) / BPS_DENOM,
      protocolFeeCap:
        (input.collateralAmount * DEFAULT_PROTOCOL_FEE_BPS) / BPS_DENOM,
      automationFeeCap: 0n,
      repayOnly: routeKind === "REPAY_ONLY",
      acceptsThirdPartyRepay: false,
    };
  }

  private deriveForceExitBounds(
    input: BuildForceExitParamsInput,
    slippageBps: BasisPoints,
  ): ForceExitBounds {
    const slip = BigInt(slippageBps);
    const minRepayment =
      (input.collateralAmount * (BPS_DENOM - slip)) / BPS_DENOM;
    return {
      minRepayment,
      maxCollateralSold: input.collateralAmount,
      looseSlippageBps: slippageBps,
      looseFlashFeeCap:
        (input.collateralAmount * DEFAULT_FORCE_EXIT_FLASH_FEE_BPS) / BPS_DENOM,
      maxCurvePositionShareBps: asBasisPoints(DEFAULT_MAX_CURVE_SHARE_BPS),
      acknowledgedRisks: input.acknowledgedRisks,
    };
  }

  // ─── Quote methods (live on-chain quoting) ──────────────────────────────

  async quoteOpen(
    params: CommonActionEnvelope & { primaryType: "Open"; bounds: OpenBounds },
  ): Promise<TransactionPreview> {
    return this.assembleQuote({ ...params } as OpenAction);
  }

  async quoteRebalance(
    params: CommonActionEnvelope & { primaryType: "Rebalance"; bounds: RebalanceBounds },
  ): Promise<TransactionPreview> {
    return this.assembleQuote({ ...params } as RebalanceAction);
  }

  async quoteExit(
    params: CommonActionEnvelope & {
      primaryType: "Exit";
      bounds: ExitBounds;
      routeKind: ExitRouteKind;
    },
  ): Promise<TransactionPreview> {
    return this.assembleQuote({ ...params } as ExitAction);
  }

  async quoteForceExit(
    params: CommonActionEnvelope & { primaryType: "ForceExit"; bounds: ForceExitBounds },
  ): Promise<TransactionPreview> {
    return this.assembleQuote({ ...params } as ForceExitAction);
  }

  async simulate(action: Action): Promise<TransactionPreview> {
    return this.assembleQuote(action);
  }

  async previewTransaction(action: Action): Promise<TransactionPreview> {
    return this.assembleQuote(action);
  }

  private async assembleQuote(action: Action): Promise<TransactionPreview> {
    const assembled = await this.assembleAuthorization(action);
    const data = this.encodeExecutorCalldata(action, assembled, "0x" as Hex);
    // calldataHash binds the executor calldata for client-side audit logging;
    // the on-chain executor independently recomputes the digest from the
    // typed action so calldataHash is informational only.
    const calldataHash =
      data === ("0x" as Hex)
        ? (("0x" + "00".repeat(32)) as Bytes32)
        : (await this.calldataHash(data));
    // PR-17 Gap 2 closure: populate gateStatuses with the SDK-evaluable
    // G-PM-1..6 results. Failure to evaluate any single gate surfaces as
    // notApplicable so the gate evaluator itself never throws into the
    // quote pipeline. The frontend's `allGatesClear` treats anything other
    // than `pass` as not-clear.
    const gateStatuses = await this.evaluateGateStatusesForAction(action).catch(
      () => [] as GateStatus[],
    );
    return {
      action,
      digest: assembled.digest,
      quoteId: this.quoteIdFromRoutes(assembled.routes),
      evidence: assembled.evidence,
      subHashes: assembled.subHashes,
      gateStatuses,
      failureConditions: [],
      calldata: data,
      calldataHash,
    };
  }

  // ─── Route derivation + sub-hash assembly ───────────────────────────────

  private async deriveRoutes(action: Action): Promise<readonly QuoteRoute[]> {
    const bundle = this.bundleFor(action.market);
    switch (action.primaryType) {
      case "Open":
        return this.deriveOpenRoutes(action, bundle);
      case "Rebalance":
        return this.deriveRebalanceRoutes(action, bundle);
      case "Exit":
        return this.deriveExitRoutes(action, bundle);
      case "ForceExit":
        return this.deriveForceExitRoutes(action, bundle);
      case "Revoke":
      case "AutomationExec":
        return [];
    }
  }

  private async deriveOpenRoutes(
    action: OpenAction,
    bundle: MarketAddressBundle,
  ): Promise<readonly QuoteRoute[]> {
    const routes: QuoteRoute[] = [];
    if (bundle.curvePool) {
      const dx = action.bounds.maxBorrowedDiem;
      if (dx > 0n) {
        const quote = await this.curveQuoter
          .getDy({ pool: bundle.curvePool, i: 0, j: 1, dx })
          .catch(() => null);
        if (quote) {
          routes.push({
            kind: "CURVE",
            pool: quote.pool,
            i: quote.i,
            j: quote.j,
            dx: quote.dx,
            dyMin: this.applySlippage(quote.dyExpected, action.bounds.maxSlippageBps),
          });
        }
      }
    }
    if (this.config.uniswapV3Quoter && bundle.uniswapV3FlashPool) {
      const amountIn = action.bounds.maxBorrowedDiem;
      if (amountIn > 0n) {
        try {
          const quote = await this.uniswapQuoter.quoteExactInputSingle({
            quoter: this.config.uniswapV3Quoter,
            tokenIn: bundle.loanToken,
            tokenOut: bundle.collateralToken,
            amountIn,
            fee: 500, // default 0.05%; caller can extend via dedicated bound later
          });
          routes.push({
            kind: "UNISWAP_V3_FLASH",
            pool: bundle.uniswapV3FlashPool,
            zeroForOne: quote.zeroForOne,
            amountSpecified: amountIn,
            sqrtPriceLimitX96: 0n,
            fee: quote.fee,
          });
        } catch {
          // Quoter unreachable — fall back to the Curve-only quote bundle.
        }
      }
    }
    return routes;
  }

  private async deriveRebalanceRoutes(
    action: RebalanceAction,
    bundle: MarketAddressBundle,
  ): Promise<readonly QuoteRoute[]> {
    if (action.bounds.maxDebtIncrease === 0n) {
      return [{ kind: "REPAY_ONLY", assets: action.bounds.maxCollateralSold }];
    }
    return this.deriveOpenRoutes(
      {
        ...action,
        primaryType: "Open",
        bounds: {
          minWstDiemReceived: 0n,
          minBorrowedDiem: 0n,
          maxBorrowedDiem: action.bounds.maxDebtIncrease,
          maxSlippageBps: action.bounds.maxSlippageBps,
          maxPriceImpactBps: action.bounds.maxSlippageBps,
          maxLeverageBps: action.bounds.targetLeverageBps,
          minHealthFactor: action.bounds.minPostHealthFactor,
          minLiquidationDistanceBps: action.bounds.minLiquidationDistanceBps,
          maxMorphoUtilizationImpactBps: action.bounds.maxMorphoUtilizationImpactBps,
          flashFeeCap: action.bounds.flashFeeCap,
          protocolFeeCap: action.bounds.protocolFeeCap,
          automationFeeCap: action.bounds.automationFeeCap,
        },
      } as OpenAction,
      bundle,
    );
  }

  private async deriveExitRoutes(
    action: ExitAction,
    bundle: MarketAddressBundle,
  ): Promise<readonly QuoteRoute[]> {
    if (action.routeKind === "REPAY_ONLY") {
      return [{ kind: "REPAY_ONLY", assets: action.bounds.minRepayment }];
    }
    const routes: QuoteRoute[] = [];
    if (bundle.curvePool) {
      const dx = action.bounds.maxCollateralSold;
      if (dx > 0n) {
        const quote = await this.curveQuoter
          .getDy({ pool: bundle.curvePool, i: 1, j: 0, dx })
          .catch(() => null);
        if (quote) {
          routes.push({
            kind: "CURVE",
            pool: quote.pool,
            i: quote.i,
            j: quote.j,
            dx: quote.dx,
            dyMin: this.applySlippage(quote.dyExpected, action.bounds.maxSlippageBps),
          });
        }
      }
    }
    return routes;
  }

  private async deriveForceExitRoutes(
    action: ForceExitAction,
    bundle: MarketAddressBundle,
  ): Promise<readonly QuoteRoute[]> {
    // ForceExit uses the looser slippage budget and never permits the loose
    // route to expand to multi-leg complexity. Single-leg Curve get_dy is the
    // contract-enforced shape.
    if (!bundle.curvePool || action.bounds.maxCollateralSold === 0n) return [];
    const quote = await this.curveQuoter
      .getDy({
        pool: bundle.curvePool,
        i: 1,
        j: 0,
        dx: action.bounds.maxCollateralSold,
      })
      .catch(() => null);
    if (!quote) return [];
    return [
      {
        kind: "CURVE",
        pool: quote.pool,
        i: quote.i,
        j: quote.j,
        dx: quote.dx,
        dyMin: this.applySlippage(quote.dyExpected, action.bounds.looseSlippageBps),
      },
    ];
  }

  private applySlippage(amount: bigint, bps: number | bigint): bigint {
    const bpsBn = BigInt(bps);
    if (bpsBn <= 0n) return amount;
    const denom = 10_000n;
    if (bpsBn >= denom) return 0n;
    return (amount * (denom - bpsBn)) / denom;
  }

  private assembleSubHashes(
    action: Action,
    routes: readonly QuoteRoute[],
    evidenceBundleHash: Bytes32,
  ): DigestSubHashes {
    const feeCapHash = this.feeCapHashFor(action) as Bytes32;
    const quoteHash =
      routes.length === 0
        ? (("0x" + "00".repeat(32)) as Bytes32)
        : (hashQuoteRoutes(routes) as Bytes32);
    return {
      quoteHash,
      spenderListHash: emptySpenderListHash() as Bytes32,
      allowanceScheduleHash: emptyAllowanceScheduleHash() as Bytes32,
      feeCapHash,
      evidenceBundleHash,
    };
  }

  private feeCapHashFor(action: Action): Hex {
    switch (action.primaryType) {
      case "Open":
      case "Rebalance":
      case "Exit":
        return hashFeeCaps({
          flashFeeCap: action.bounds.flashFeeCap,
          protocolFeeCap: action.bounds.protocolFeeCap,
          automationFeeCap: action.bounds.automationFeeCap,
        });
      case "ForceExit":
        return hashFeeCaps({
          flashFeeCap: action.bounds.looseFlashFeeCap,
          protocolFeeCap: 0n,
          automationFeeCap: 0n,
        });
      case "Revoke":
      case "AutomationExec":
        return hashFeeCaps({ flashFeeCap: 0n, protocolFeeCap: 0n, automationFeeCap: 0n });
    }
  }

  private quoteIdFromRoutes(routes: readonly QuoteRoute[]): TransactionPreview["quoteId"] {
    if (routes.length === 0) {
      return ("0x" + "00".repeat(32)) as Bytes32 as TransactionPreview["quoteId"];
    }
    return hashQuoteRoutes(routes) as Bytes32 as TransactionPreview["quoteId"];
  }

  private async calldataHash(data: Hex): Promise<Bytes32> {
    const { keccak256 } = await import("viem");
    return keccak256(data) as Bytes32;
  }

  // ─── Executor calldata encoding ─────────────────────────────────────────

  private encodeExecutorCalldata(
    action: Action,
    assembled: {
      subHashes: DigestSubHashes;
      marketParams: MorphoMarketParams;
      evidence: ActionEvidence;
    },
    sig: Hex,
  ): Hex {
    const proof = action.eip1271PreimageDisplayProof ?? (("0x" + "00".repeat(32)) as Hex);
    const evidenceArg = this.evidenceToCalldata(assembled.evidence);
    switch (action.primaryType) {
      case "Open":
        return encodeFunctionData({
          abi: LOOP_EXECUTOR_V2_ABI,
          functionName: "executeOpen",
          args: [
            this.openCalldataAction(action, assembled.subHashes, assembled.marketParams),
            sig,
            evidenceArg,
            proof as `0x${string}`,
          ],
        }) as Hex;
      case "Rebalance":
        return encodeFunctionData({
          abi: LOOP_EXECUTOR_V2_ABI,
          functionName: "executeRebalance",
          args: [
            this.rebalanceCalldataAction(action, assembled.subHashes, assembled.marketParams),
            sig,
            evidenceArg,
            proof as `0x${string}`,
          ],
        }) as Hex;
      case "Exit":
        return encodeFunctionData({
          abi: LOOP_EXECUTOR_V2_ABI,
          functionName: "executeExit",
          args: [
            this.exitCalldataAction(action, assembled.subHashes, assembled.marketParams),
            sig,
            evidenceArg,
            proof as `0x${string}`,
          ],
        }) as Hex;
      case "ForceExit":
        return encodeFunctionData({
          abi: LOOP_FORCE_EXIT_EXECUTOR_ABI,
          functionName: "executeForceExit",
          args: [
            this.forceExitCalldataAction(action, assembled.subHashes, assembled.marketParams),
            sig,
            evidenceArg,
            proof as `0x${string}`,
          ],
        }) as Hex;
      case "Revoke":
      case "AutomationExec":
        // Both lifecycle paths land in PR-14; emit empty calldata so the
        // preview surface stays consistent (caller branches on primaryType).
        return "0x" as Hex;
    }
  }

  private identityCalldata(action: Action) {
    return {
      owner: action.owner,
      chainId: BigInt(action.chainId),
      verifyingContract: action.verifyingContract,
      market: action.market as `0x${string}`,
      executor: action.executor,
      registryVersion: BigInt(action.registryVersion),
      registryMerkleRoot: action.registryMerkleRoot as `0x${string}`,
      policyId: BigInt(action.policyId),
      nonceSlot: action.nonceSlot,
      nonceBit: action.nonceBit,
    };
  }

  private freshnessCalldata(action: Action) {
    return {
      deadline: BigInt(action.deadline),
      quoteBlockNumber: BigInt(action.quoteBlockNumber),
      maxQuoteAgeBlocks: BigInt(action.maxQuoteAgeBlocks),
      maxQuoteDeviationBps: Number(action.maxQuoteDeviationBps),
    };
  }

  private marketParamsCalldata(p: MorphoMarketParams) {
    return {
      loanToken: p.loanToken,
      collateralToken: p.collateralToken,
      oracle: p.oracle,
      irm: p.irm,
      lltv: p.lltv,
    };
  }

  private hashesCalldata(s: DigestSubHashes) {
    return {
      quoteHash: s.quoteHash as `0x${string}`,
      spenderListHash: s.spenderListHash as `0x${string}`,
      allowanceScheduleHash: s.allowanceScheduleHash as `0x${string}`,
      feeCapHash: s.feeCapHash as `0x${string}`,
      evidenceBundleHash: s.evidenceBundleHash as `0x${string}`,
    };
  }

  private openCalldataAction(
    action: OpenAction,
    sub: DigestSubHashes,
    params: MorphoMarketParams,
  ) {
    return {
      identity: this.identityCalldata(action),
      freshness: this.freshnessCalldata(action),
      executionKind: EXECUTION_KIND_U8[action.executionKind],
      mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      mevWaiverBits: action.mevWaiverBits,
      marketParams: this.marketParamsCalldata(params),
      bounds: {
        minWstDiemReceived: action.bounds.minWstDiemReceived,
        minBorrowedDiem: action.bounds.minBorrowedDiem,
        maxBorrowedDiem: action.bounds.maxBorrowedDiem,
        maxSlippageBps: Number(action.bounds.maxSlippageBps),
        maxPriceImpactBps: Number(action.bounds.maxPriceImpactBps),
        maxLeverageBps: Number(action.bounds.maxLeverageBps),
        minHealthFactor: action.bounds.minHealthFactor,
        minLiquidationDistanceBps: Number(action.bounds.minLiquidationDistanceBps),
        maxMorphoUtilizationImpactBps: Number(action.bounds.maxMorphoUtilizationImpactBps),
        feeCaps: {
          flashFeeCap: action.bounds.flashFeeCap,
          protocolFeeCap: action.bounds.protocolFeeCap,
          automationFeeCap: action.bounds.automationFeeCap,
        },
      },
      hashes: this.hashesCalldata(sub),
    };
  }

  private rebalanceCalldataAction(
    action: RebalanceAction,
    sub: DigestSubHashes,
    params: MorphoMarketParams,
  ) {
    return {
      identity: this.identityCalldata(action),
      freshness: this.freshnessCalldata(action),
      executionKind: EXECUTION_KIND_U8[action.executionKind],
      mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      mevWaiverBits: action.mevWaiverBits,
      marketParams: this.marketParamsCalldata(params),
      bounds: {
        targetLeverageBps: Number(action.bounds.targetLeverageBps),
        targetLeverageToleranceBps: Number(action.bounds.targetLeverageToleranceBps),
        minPostHealthFactor: action.bounds.minPostHealthFactor,
        minLiquidationDistanceBps: Number(action.bounds.minLiquidationDistanceBps),
        maxDebtIncrease: action.bounds.maxDebtIncrease,
        maxCollateralSold: action.bounds.maxCollateralSold,
        maxSlippageBps: Number(action.bounds.maxSlippageBps),
        maxCurvePositionShareBps: Number(action.bounds.maxCurvePositionShareBps),
        maxMorphoUtilizationImpactBps: Number(action.bounds.maxMorphoUtilizationImpactBps),
        feeCaps: {
          flashFeeCap: action.bounds.flashFeeCap,
          protocolFeeCap: action.bounds.protocolFeeCap,
          automationFeeCap: action.bounds.automationFeeCap,
        },
      },
      hashes: this.hashesCalldata(sub),
    };
  }

  private exitCalldataAction(
    action: ExitAction,
    sub: DigestSubHashes,
    params: MorphoMarketParams,
  ) {
    return {
      identity: this.identityCalldata(action),
      freshness: this.freshnessCalldata(action),
      executionKind: EXECUTION_KIND_U8[action.executionKind],
      mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      mevWaiverBits: action.mevWaiverBits,
      marketParams: this.marketParamsCalldata(params),
      bounds: {
        minRepayment: action.bounds.minRepayment,
        maxCollateralSold: action.bounds.maxCollateralSold,
        maxSlippageBps: Number(action.bounds.maxSlippageBps),
        maxCurvePositionShareBps: Number(action.bounds.maxCurvePositionShareBps),
        maxMorphoUtilizationImpactBps: Number(action.bounds.maxMorphoUtilizationImpactBps),
        feeCaps: {
          flashFeeCap: action.bounds.flashFeeCap,
          protocolFeeCap: action.bounds.protocolFeeCap,
          automationFeeCap: action.bounds.automationFeeCap,
        },
        repayOnly: action.bounds.repayOnly,
        acceptsThirdPartyRepay: action.bounds.acceptsThirdPartyRepay,
      },
      hashes: this.hashesCalldata(sub),
    };
  }

  private forceExitCalldataAction(
    action: ForceExitAction,
    sub: DigestSubHashes,
    params: MorphoMarketParams,
  ) {
    return {
      identity: this.identityCalldata(action),
      freshness: this.freshnessCalldata(action),
      executionKind: EXECUTION_KIND_U8[action.executionKind],
      mevProtectionMode: MEV_PROTECTION_MODE_U8[action.mevProtectionMode],
      mevWaiverBits: action.mevWaiverBits,
      marketParams: this.marketParamsCalldata(params),
      bounds: {
        minRepayment: action.bounds.minRepayment,
        maxCollateralSold: action.bounds.maxCollateralSold,
        looseSlippageBps: Number(action.bounds.looseSlippageBps),
        looseFlashFeeCap: action.bounds.looseFlashFeeCap,
        maxCurvePositionShareBps: Number(action.bounds.maxCurvePositionShareBps),
        acknowledgedRisks: action.bounds.acknowledgedRisks,
      },
      hashes: this.hashesCalldata(sub),
    };
  }

  private evidenceToCalldata(evidence: ActionEvidence) {
    return {
      actionId: evidence.actionId as `0x${string}`,
      evidenceSetId: evidence.evidenceSetId as `0x${string}`,
      owner: evidence.owner,
      market: evidence.market as `0x${string}`,
      blockNumber: BigInt(evidence.blockNumber),
      stateBitmap: Number(evidence.stateBitmap),
      sources: evidence.sources.map((s) => ({
        sourceId: s.sourceId as `0x${string}`,
        sourceAddress: s.sourceAddress,
        status: this.sourceStatusU8(s.status),
        lastUpdateBlock: BigInt(s.lastUpdateBlock),
        valueHash: s.valueHash as `0x${string}`,
      })),
    };
  }

  private sourceStatusU8(status: string): number {
    // PR-13 audit M-3 fix: route through SOURCE_STATUS_U8 so unknown / new
    // enum values throw instead of being silently coerced to fresh. The local
    // switch missed "notConfigured" and "outsideDeviation" — both would have
    // appeared on the calldata as fresh (0) and corrupted the evidence bundle.
    const mapped = SOURCE_STATUS_U8[status as SourceStatus];
    if (mapped === undefined) {
      throw new Error(`Unknown SourceStatus enum value: ${status}`);
    }
    return mapped;
  }

  // ─── Subscription (polling-based) ────────────────────────────────────────
  //
  // PR-13 ships polling-based subscriptions: callers may pin the interval via
  // config.positionPollIntervalMs (default 12000ms ≈ Base block time). On each
  // tick we call getPositionRisk and emit only when collateral or debt changed
  // — UI flicker prevention. The returned function cancels the interval and
  // is idempotent.

  subscribePosition(
    owner: Address,
    market: MarketId,
    cb: (risk: PositionRisk) => void,
  ): () => void {
    const intervalMs = this.config.positionPollIntervalMs ?? 12_000;
    let cancelled = false;
    let last: PositionRisk | null = null;
    const tick = async () => {
      if (cancelled) return;
      try {
        const risk = await this.getPositionRisk(market, owner);
        // PR-13 audit H-4 fix: re-check `cancelled` after the await before
        // firing the callback. Without this re-check, a `cancel()` racing
        // against an in-flight getPositionRisk would still emit a stale
        // callback — leaking owner/market state to canceled subscribers.
        if (cancelled) return;
        if (
          !last ||
          last.collateralWstDiem !== risk.collateralWstDiem ||
          last.debtDiem !== risk.debtDiem
        ) {
          last = risk;
          cb(risk);
        }
      } catch {
        // Polling never throws to the caller. Indexer/RPC blips recover on
        // the next tick. UI consumers can layer their own error reporting via
        // getReadiness if they need to surface degraded state.
      }
    };
    void tick();
    const handle = setInterval(tick, intervalMs) as unknown as { unref?: () => void };
    if (typeof handle.unref === "function") handle.unref();
    return () => {
      if (cancelled) return;
      cancelled = true;
      // Drop the cached position so the closure can't leak the canceled
      // subscriber's state into a re-subscription that shares the closure.
      last = null;
      clearInterval(handle as never);
    };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private bundleFor(market: MarketId): MarketAddressBundle {
    const bundles = this.config.initialMarkets ?? [];
    const found = bundles.find((b) => (b.marketId as string).toLowerCase() === market.toLowerCase());
    if (!found) {
      throw new Error(
        `Market ${market} not found in config.initialMarkets — pre-resolve and supply via config.`,
      );
    }
    return found;
  }

  private async readSequencer(
    market: MarketId,
    pinnedBlock?: bigint,
  ): Promise<{ status: "up" | "down" | "gracePeriod" }> {
    const bundle = this.bundleFor(market);
    const reader = new SequencerFeedReader(this.readClient, bundle.sequencerUptimeFeed);
    try {
      // SECURITY (A8-11): use the chain's block.timestamp as the "now" reference
      // so client clock skew does not flip the grace decision (could otherwise
      // let a user unlock force-exit via the sequencer-down waiver).
      const block = await this.readClient.getBlock(
        pinnedBlock !== undefined
          ? { blockNumber: pinnedBlock }
          : { blockTag: "latest" },
      );
      const nowSeconds = Number(block.timestamp);
      const status = await reader.status({ gracePeriodSeconds: 3600, nowSeconds });
      return { status: status.status };
    } catch {
      return { status: "down" };
    }
  }

  private dispatchDigest(
    action: Action,
    domainSeparator: Bytes32,
    subHashes: DigestSubHashes,
    marketParams: MorphoMarketParams,
  ): ActionDigest {
    switch (action.primaryType) {
      case "Open":
        return computeOpenDigest({ action, domainSeparator, marketParams, subHashes });
      case "Rebalance":
        return computeRebalanceDigest({ action, domainSeparator, marketParams, subHashes });
      case "Exit":
        return computeExitDigest({ action, domainSeparator, marketParams, subHashes });
      case "ForceExit":
        return computeForceExitDigest({ action, domainSeparator, marketParams, subHashes });
      case "Revoke":
        return computeRevokeDigest({
          action: action as RevokeAction,
          domainSeparator,
          subHashes,
          effectiveBlock: 0n,
          policyClass: "OPEN",
        });
      case "AutomationExec": {
        const a = action as AutomationExecAction;
        const placeholder: AutomationBoundsInputs = {
          triggerConditionHash: a.triggerConditionHash,
          underlyingPrimaryType: 0,
          underlyingActionHash: a.underlyingBoundsHash,
          policyHash: ("0x" + "00".repeat(32)) as Bytes32,
          boundSubsetHash: ("0x" + "00".repeat(32)) as Bytes32,
          notBeforeBlock: 0n,
          notAfterBlock: 0n,
        };
        return computeAutomationExecDigest({ action: a, domainSeparator, subHashes, bounds: placeholder });
      }
    }
  }

  private buildTypedData(
    action: Action,
    marketParams: MorphoMarketParams,
    subHashes: DigestSubHashes,
  ): unknown {
    // SECURITY (A10-1 + PR-13 audit C1): The wallet's display domain (and
    // verifyingContract shown to the user via EIP-712) must match the on-chain
    // validator that recomputes the digest. ForceExit routes to
    // LoopForceExitAuthorizer.
    // PR-13 audit C1 fix: the contract's EIP712_NAME constant is "WSTDIEM Loop"
    // (LoopAuthorization.sol:27), NOT "WstdiemLoopAuthorization". The wrong
    // string would have produced a domain separator the on-chain validator's
    // recompute rejects on every Open/Rebalance/Exit/Revoke/AutomationExec.
    const isForce = action.primaryType === "ForceExit";
    const domain = {
      name: isForce ? "WSTDIEM ForceExit" : "WSTDIEM Loop",
      version: "1",
      chainId: this.config.chainId,
      verifyingContract: isForce
        ? this.config.contracts.loopForceExitAuthorizer
        : this.config.contracts.loopAuthorization,
      salt: ZERO_SALT,
    };
    // PR (Phase A): return canonical viem-signable typed data so a wallet's
    // eth_signTypedData_v4 reproduces the on-chain digest. The `types` map and
    // restructured `message` are built in eip712/typed-data.ts and proven
    // equivalent to computeDigest in test/eip712-wallet-parity.test.ts.
    return buildActionTypedData(action, marketParams, subHashes, domain);
  }

  // ─── PR-17 Gap 3: authorizerNameFor ──────────────────────────────────────

  /**
   * PR-17 Gap 3 closure: synchronous authorizer-name resolution. Returns the
   * canonical NAME for a verifyingContract address; "UNRECOGNIZED" when the
   * address matches neither the registered LoopAuthorization nor the
   * registered LoopForceExitAuthorizer. Used by the C-1 phishing-defeat
   * banner so an attacker substitution surfaces as a hard sign-block.
   */
  authorizerNameFor(verifyingContract: Address): AuthorizerName {
    if (!verifyingContract) return "UNRECOGNIZED";
    const ZERO = "0x0000000000000000000000000000000000000000";
    const vc = verifyingContract.toLowerCase();
    if (vc === ZERO) return "UNRECOGNIZED";
    if (vc === this.contracts.loopAuthorization.toLowerCase()) {
      return "LoopAuthorization";
    }
    if (vc === this.contracts.loopForceExitAuthorizer.toLowerCase()) {
      return "LoopForceExitAuthorizer";
    }
    return "UNRECOGNIZED";
  }

  // ─── PR-17 Gap 4: getIncidentHistory ─────────────────────────────────────

  /**
   * PR-17 Gap 4 closure: read EmergencyGuardian state transitions decoded
   * from `IncidentStateChanged` logs. All reads are block-pinned to a single
   * chain head (consistent with PR-13's block-pinning posture); transitions
   * within `finalityThreshold` blocks of the head are flagged provisional.
   *
   * Throws `IncidentReaderUnavailable` when `config.contracts.emergencyGuardian`
   * is zero (`validateContractsConfig` already enforces this at construction
   * time, but the runtime check defends against post-construction mutation
   * via type-cast hacks).
   *
   * Default range: from `currentBlock - 100_000` to `currentBlock`. Limit
   * defaults to 100, newest-first ordering. Both decoded fields
   * (`previousState`, `nextState`) come from indexed topics; the SDK fetches
   * `blockTimestamp` from `getBlock` for each unique block.
   */
  async getIncidentHistory(opts?: {
    fromBlock?: BlockNumber;
    toBlock?: BlockNumber;
    limit?: number;
    finalityThreshold?: number;
  }): Promise<IncidentTransition[]> {
    const guardian = this.contracts.emergencyGuardian;
    const ZERO = "0x0000000000000000000000000000000000000000";
    if (!guardian || guardian.toLowerCase() === ZERO) {
      throw new Error(
        "IncidentReaderUnavailable: getIncidentHistory requires a non-zero EmergencyGuardian address in config.contracts. Set config.contracts.emergencyGuardian to the registered Phase 1 deployment address.",
      );
    }
    const head = await this.readClient.getBlockNumber();
    const toBlock = opts?.toBlock !== undefined ? BigInt(opts.toBlock) : head;
    // PR-17 audit M-3 closure: default fromBlock to 0n (full chain history)
    // rather than head - 100_000 (~2.3 days on Base). Day-60 user must see
    // day-1 incident; newest-first sort + 100-entry limit means truncation
    // drops oldest, never newest — the most-relevant incidents are always
    // preserved. RPC range-limits, when hit, surface as a chain RPC error.
    const fromBlock =
      opts?.fromBlock !== undefined ? BigInt(opts.fromBlock) : 0n;
    const limit = opts?.limit ?? 100;
    // PR-17 audit m-do-2 closure: default to 10 blocks (PROTOCOL.md §7.2:811 Base
    // finality). Was 12 — conservative but a documented spec divergence.
    const finalityThreshold = opts?.finalityThreshold ?? 10;

    // PR-17: fetch the IncidentStateChanged events. The event ABI is in
    // EMERGENCY_GUARDIAN_EVENTS_ABI; we resolve the entry by name so a future
    // event addition to the ABI cannot accidentally cross-pollute the decode.
    const eventAbi = EMERGENCY_GUARDIAN_EVENTS_ABI;
    type LogEntry = {
      blockNumber?: bigint;
      transactionHash?: Hex;
      topics?: readonly Hex[];
      data?: Hex;
      args?: { previousState?: number | bigint; nextState?: number | bigint };
    };
    const logs = (await this.readClient.getLogs({
      address: guardian,
      event: eventAbi[0],
      fromBlock,
      toBlock,
    } as never)) as ReadonlyArray<LogEntry>;

    // Decode each log. When the underlying transport returns pre-decoded
    // `args`, prefer that; otherwise fall back to ABI decode on the raw
    // topics+data. Sort newest → oldest.
    type Decoded = {
      previousState: IncidentState;
      nextState: IncidentState;
      blockNumber: bigint;
      txHash: Bytes32;
    };
    const decoded: Decoded[] = [];
    for (const log of logs) {
      let prev: number | bigint | undefined = log.args?.previousState;
      let next: number | bigint | undefined = log.args?.nextState;
      if ((prev === undefined || next === undefined) && log.topics && log.data) {
        try {
          const out = decodeEventLog({
            abi: eventAbi,
            topics: log.topics as never,
            data: log.data,
          }) as { args?: { previousState?: number | bigint; nextState?: number | bigint } };
          prev = out.args?.previousState;
          next = out.args?.nextState;
        } catch {
          continue;
        }
      }
      if (prev === undefined || next === undefined) continue;
      const blockNumber = log.blockNumber ?? 0n;
      const txHash =
        (log.transactionHash ?? ("0x" + "00".repeat(32))) as Bytes32;
      // PR-17 audit m-do-3 closure: silent-skip malformed logs whose
      // previousState/nextState fall outside the IncidentState enum range.
      // Matches the existing decodeEventLog silent-skip pattern above — one
      // bad log no longer poisons the whole history reader.
      let previousState: IncidentState;
      let nextState: IncidentState;
      try {
        previousState = decodeIncidentStateU8(Number(prev));
        nextState = decodeIncidentStateU8(Number(next));
      } catch {
        continue;
      }
      decoded.push({
        previousState,
        nextState,
        blockNumber,
        txHash,
      });
    }
    decoded.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));
    const trimmed = decoded.slice(0, limit);

    // For each unique block, fetch the block to get the timestamp. We batch
    // by deduplicating block numbers — the timestamps are immutable so we can
    // cache within this call.
    const uniqueBlocks = Array.from(new Set(trimmed.map((d) => d.blockNumber)));
    const blockMap = new Map<bigint, bigint>();
    await Promise.all(
      uniqueBlocks.map(async (bn) => {
        try {
          const blk = await this.readClient.getBlock({ blockNumber: bn });
          blockMap.set(bn, blk.timestamp);
        } catch {
          blockMap.set(bn, 0n);
        }
      }),
    );

    return trimmed.map((d): IncidentTransition => ({
      state: d.nextState,
      previousState: d.previousState,
      blockNumber: asBlockNumber(d.blockNumber),
      blockTimestamp: asUnixSeconds(blockMap.get(d.blockNumber) ?? 0n),
      txHash: d.txHash,
      finality:
        head > BigInt(finalityThreshold) &&
        d.blockNumber + BigInt(finalityThreshold) <= head
          ? "finalized"
          : "provisional",
    }));
  }

  // ─── PR-17 Gap 2: gateStatuses wiring ────────────────────────────────────

  /**
   * PR-17 Gap 2 closure: evaluate every G-PM-1..6 gate the SDK can fill from
   * its current inputs. Inputs the SDK cannot fetch in this call default to
   * a `notApplicable` status (the gate evaluator surfaces those as either
   * `notApplicable` or `unknown` depending on the gate). The frontend's
   * `allGatesClear` treats anything other than `pass` as not-clear, so the
   * fail-closed posture is preserved.
   *
   * Inputs sourced from:
   *   - G-PM-1: registry.lastHarvestBlock + registry.harvestCoolingBlocks
   *   - G-PM-2: getAnchorFreshness (re-uses block-pinned read)
   *   - G-PM-3: evaluateRpcQuorum (the SDK's quorum status)
   *   - G-PM-4: action.eip1271PreimageDisplayProof
   *   - G-PM-5: action.mevProtectionMode + action.mevWaiverBits + observed
   *             submission channel (caller-supplied; absent here so the gate
   *             evaluator surfaces it as a notApplicable hint)
   *   - G-PM-6: action.executionKind + registry.permissionlessCallerAllowed
   */
  private async evaluateGateStatusesForAction(
    action: Action,
  ): Promise<GateStatus[]> {
    const inputs: PostMatrixGateInputs = {};
    // G-PM-2 indexer anchor freshness — best-effort; on failure surface as
    // notApplicable so the gate evaluator does not raise.
    try {
      const anchor = await this.getAnchorFreshness();
      inputs.g2 = { anchor };
    } catch {
      // Anchor-freshness fetch failures bubble up as "notApplicable" — the
      // SDK already raises a hard error via getReadiness; the gate surface is
      // diagnostic-only.
    }

    // G-PM-3 RPC quorum status.
    try {
      const quorum = await this.evaluateRpcQuorum();
      inputs.g3 = { quorum };
    } catch {
      // ignored — quorum failure surfaces as notApplicable here; getReadiness
      // is the authoritative gate for quorum.
    }

    // G-PM-1 harvest convergence. Risk-increasing classes: Open, Rebalance
    // with debt increase, AND ForceExit (per PROTOCOL.md §6.3 — ForceExit is
    // risk-increasing by class and subject to the harvest cooling window).
    // Standard Exit is debt-reducing and exempt. PR-17 audit M-2: ForceExit
    // path now wired so the gate fires for the most safety-critical class.
    if (
      action.primaryType === "Open" ||
      action.primaryType === "Rebalance" ||
      action.primaryType === "ForceExit"
    ) {
      const isRiskIncreasing =
        action.primaryType === "Open" ||
        (action.primaryType === "Rebalance" &&
          (action as RebalanceAction).bounds.maxDebtIncrease > 0n) ||
        action.primaryType === "ForceExit";
      try {
        const [lastHarvest, cooling, head] = await Promise.all([
          this.registry.lastHarvestBlock(action.market),
          this.registry.harvestCoolingBlocks(),
          this.readClient.getBlockNumber(),
        ]);
        inputs.g1 = {
          primaryType: action.primaryType,
          isRiskIncreasing,
          currentBlock: asBlockNumber(head),
          lastHarvestBlock: asBlockNumber(lastHarvest),
          harvestCoolingBlocks: Number(cooling),
        };
      } catch {
        // ignored — surfaced as notApplicable
      }
    }

    // G-PM-4 EIP-1271 preimage proof.
    //
    // PR-17 audit M-1: read `signerOnAllowList` from the registry's
    // preimageDisplayGuaranteedWallet allow-list rather than hardcoding
    // `false`. Block-pinned to the current head for TOCTOU consistency with
    // PR-13's block-pinning posture. Registry read failures fail-closed to
    // `false` (deny) so the gate degrades safely.
    const g4Pin = await this.readClient
      .getBlockNumber()
      .catch(() => undefined);
    const signerOnAllowList = await this.registry
      .preimageDisplayGuaranteedWallet(action.owner, g4Pin)
      .catch(() => false);
    inputs.g4 = {
      primaryType: action.primaryType as PrimaryType,
      ...(action.primaryType === "Open" || action.primaryType === "Rebalance"
        ? {
            maxDebtIncrease:
              action.primaryType === "Open"
                ? (action as OpenAction).bounds.maxBorrowedDiem
                : (action as RebalanceAction).bounds.maxDebtIncrease,
          }
        : {}),
      signerOnAllowList,
      ...(action.eip1271PreimageDisplayProof !== undefined
        ? { preimageProof: action.eip1271PreimageDisplayProof as Bytes32 }
        : {}),
    };

    // G-PM-5: caller has not specified an observed submission channel here;
    // the gate evaluator surfaces "notApplicable" when g5 is omitted.
    // Frontend wires the observed channel via `evaluatePostMatrixGates`
    // directly when it has more knowledge.

    // G-PM-6 automation throttle + permissionless caller allow-list. This is
    // enforced on-chain ONLY in executeAutomationExec (LoopExecutorV2.sol:206);
    // executeOpen/executeExit have NO caller allow-list. Gate on the action
    // being a real automation action (primaryType === "AutomationExec"), NOT on
    // executionKind — since the default executionKind is now
    // KEEPER_PERMISSIONLESS, gating on executionKind would fire for MANUAL
    // Open/Rebalance/Exit and check the owner against the allow-list, yielding a
    // spurious callerAllowed:false. Omitting g6 for manual actions makes
    // evaluatePostMatrixGates surface G-PM-6 as notApplicable.
    if (action.primaryType === "AutomationExec") {
      try {
        const allowed = await this.registry
          .permissionlessCallerAllowed(action.owner)
          .catch(() => false);
        inputs.g6 = {
          executionKind: action.executionKind,
          failedAttemptsInWindow: 0,
          maxFailedAttemptsPerWindow: 0,
          callerAllowed: allowed,
        };
      } catch {
        // ignored — surfaced as notApplicable
      }
    }

    return evaluatePostMatrixGates(inputs);
  }
}

export function createSdk(config: WstdiemSdkConfig): LiveWstdiemSdk {
  return new LiveWstdiemSdk(config);
}

/**
 * True when the bundle (or global config) defines at least one quoter the
 * SDK could call to derive a route. When false, an empty `routes[]` is
 * expected; the digest deliberately commits no quote — typical for
 * test fixtures and repay-only flows.
 */
function hasQuoterConfigured(
  action: Action,
  bundle: MarketAddressBundle,
  config: WstdiemSdkConfig,
): boolean {
  if (action.primaryType === "Revoke" || action.primaryType === "AutomationExec") {
    return false;
  }
  return bundle.curvePool !== undefined || config.uniswapV3Quoter !== undefined;
}

/**
 * Action classes that require at least one quote route legging out from the
 * collateral side (Open) or back (Exit non-repay-only / Rebalance with debt
 * increase). REPAY_ONLY Exits and zero-debt-increase Rebalances are exempt
 * because no swap occurs.
 */
function requiresQuoteRoutes(action: Action): boolean {
  switch (action.primaryType) {
    case "Open":
      return true;
    case "Rebalance":
      return (action as RebalanceAction).bounds.maxDebtIncrease > 0n;
    case "Exit": {
      const exit = action as ExitAction;
      return exit.routeKind !== "REPAY_ONLY" && !exit.bounds.repayOnly;
    }
    case "ForceExit":
      return true;
    case "Revoke":
    case "AutomationExec":
      return false;
  }
}

/**
 * PR-17 Gap 3: every contract address must be non-zero at construction time.
 * The SDK refuses to construct with a placeholder/zero address so downstream
 * reads cannot silently succeed against an attacker-controlled or empty slot.
 */
function validateContractsConfig(
  contracts: SdkContractAddresses | undefined,
): void {
  if (!contracts) {
    throw new Error(
      "ContractsConfigInvalid: WstdiemSdkConfig.contracts is required. See SdkContractAddresses for the required fields.",
    );
  }
  const ZERO = "0x0000000000000000000000000000000000000000";
  const required: ReadonlyArray<keyof SdkContractAddresses> = [
    "loopRegistry",
    "loopAuthorization",
    "loopForceExitAuthorizer",
    "loopExecutorV2",
    "loopForceExitExecutor",
    "loopAnchorRegistry",
    "loopRiskOracleAdapter",
    "loopFeeRouter",
    "emergencyGuardian",
  ];
  const missing: string[] = [];
  for (const k of required) {
    const v = (contracts as unknown as Record<string, string | undefined>)[k];
    if (!v || v.toLowerCase() === ZERO) missing.push(k);
  }
  if (missing.length > 0) {
    throw new Error(
      `ContractsConfigInvalid: config.contracts is missing or zero for: ${missing.join(", ")}. ` +
        "Populate every WstdiemContractAddresses field at SDK construction time so the SDK can " +
        "read against the canonical Phase 1 deployment rather than silently against the zero address.",
    );
  }
}

/**
 * PR-17 Gap 3: return a frozen, immutable copy of the contracts bundle so the
 * surface exposed via `sdk.contracts` cannot be mutated after construction.
 */
function freezeContracts(c: SdkContractAddresses): SdkContractAddresses {
  return Object.freeze({
    loopRegistry: c.loopRegistry,
    loopAuthorization: c.loopAuthorization,
    loopForceExitAuthorizer: c.loopForceExitAuthorizer,
    loopExecutorV2: c.loopExecutorV2,
    loopForceExitExecutor: c.loopForceExitExecutor,
    loopAnchorRegistry: c.loopAnchorRegistry,
    loopRiskOracleAdapter: c.loopRiskOracleAdapter,
    loopFeeRouter: c.loopFeeRouter,
    emergencyGuardian: c.emergencyGuardian,
  });
}

/** PR-17 Gap 4: decode a Solidity enum uint8 to the typed IncidentState. */
const INCIDENT_STATE_FROM_U8: readonly IncidentState[] = [
  "NONE",
  "INVESTIGATING",
  "MITIGATING",
  "RESOLVED",
];

function decodeIncidentStateU8(v: number): IncidentState {
  const out = INCIDENT_STATE_FROM_U8[v];
  if (out === undefined) {
    throw new Error(`IncidentState out of range (u8=${v})`);
  }
  return out;
}
