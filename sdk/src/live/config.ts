// Live SDK configuration. Callers pass this to `createSdk(config)`.

import type { PublicClient } from "viem";
import type { Address, ChainId } from "../types/branded.js";

export interface WstdiemSdkConfig {
  /** Chain id (e.g. Base mainnet 8453). */
  chainId: ChainId;
  /** Viem PublicClient pre-configured with the user's preferred transport(s).
   * Tests inject a mock transport here. */
  publicClient: PublicClient;
  /** Base URL of the indexer HTTP API from PR-10 (no trailing slash).
   * Example: "https://indexer.wstdiem.test". */
  indexerBaseUrl: string;
  /** Optional fetch override (for tests / alternative HTTP transports).
   * Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Phase 1 contract addresses pinned at deploy time. */
  contracts: WstdiemContractAddresses;
  /** Optional pre-resolved markets list to skip the registry round-trip on
   * cold start. Live SDK will refresh on demand. */
  initialMarkets?: ReadonlyArray<MarketAddressBundle>;
  /** Registry-pinned integration ids for getExternalProtocolFingerprints
   * (keccak-derived bytes32 ids per the deployment manifest). When omitted,
   * `getExternalProtocolFingerprints` fails closed rather than silently
   * returning a clean classification on zero-byte lookups (audit A8-5). */
  integrationIds?: Partial<Record<
    "curve-pool" | "uniswap-pool" | "chainlink-feed" | "sequencer-feed" | "wstdiem-vault" | "morpho-market",
    `0x${string}`
  >>;
  /** Optional Uniswap V3 QuoterV2 address. PR-13 quoteOpen/quoteRebalance/quoteExit
   * call quoteExactInputSingle for swap pricing when provided. Without it, the
   * SDK falls back to a price-only Chainlink estimate (no slippage data). */
  uniswapV3Quoter?: Address;
  /** Polling interval for subscribePosition in milliseconds. Default 12000ms
   * (≈ Base block time). Tests can pin this to a small value. */
  positionPollIntervalMs?: number;
  /** Strict mode: when true, getReadiness / getPositionRisk / getAnchorFreshness
   * cross-check the indexer's claimed anchor block hash against the on-chain
   * LoopAnchorRegistry and throw on mismatch. Default true (PR-13 audit A5-3
   * closure). Set false only for diagnostic / staging environments. */
  strictAnchorCrossCheck?: boolean;
  /** Maximum acceptable age (in seconds) for Chainlink answers before they
   * are surfaced as `OracleStale`. Default 3600s (1 hour). PR-14 audit L-2
   * closure. */
  oracleStaleAfterSeconds?: number;
  /** Optional list of additional viem PublicClients to participate in the
   * RPC quorum. When supplied alongside `publicClient`, reads are fanned
   * out and a configurable threshold of matching results is required.
   * Closes THREAT-MODEL I-68 / audit A3-9. */
  publicClients?: ReadonlyArray<{
    client: PublicClient;
    /** Provider family label used for I-68 diversity enforcement
     * (e.g. "alchemy", "infura", "ankr", "publicrpc"). The SDK requires
     * matching results from at least `quorum.threshold` DISTINCT families. */
    providerFamily: string;
  }>;
  /** RPC quorum configuration. Required only when `publicClients` is set. */
  quorum?: {
    /** Minimum number of distinct providerFamilies that must return matching
     * results for a read to be accepted. Default 2. */
    threshold?: number;
    /** Maximum allowable block-lag between providers before the quorum
     * surfaces `blockInconsistent`. Default 5 blocks. */
    maxBlockLagBlocks?: number;
    /** Per-read timeout in milliseconds. Default 5000ms. */
    timeoutMs?: number;
  };
  /** PR-14 audit H-4 closure: explicit opt-in for single-PublicClient
   * deployments. Without this flag, `getReadiness` force-blocks every
   * per-action decision when no RPC quorum is configured — defending against
   * a compromised single RPC silently serving forged contract reads. Set
   * `true` only when you understand and accept the I-68 trust boundary. */
  allowSingleClientReads?: boolean;
  /** Optional registered indexer signing key. When set, the SDK verifies
   * that indexer responses are signed by this key (PR-14 closure of the
   * indexer-trust audit residual). The key is typically read from
   * `registry.indexerSigningKey()` at app start. */
  indexerSigningKey?: Address;
  /** Caller-supplied signature verifier so the SDK doesn't pin a specific
   * crypto scheme. Used together with `indexerSigningKey`. The default
   * recommendation is viem's `recoverMessageAddress`:
   *   `async ({ message, signature }) => recoverMessageAddress({ message, signature })`
   */
  indexerVerifier?: (opts: {
    message: string;
    signature: `0x${string}`;
  }) => Promise<Address>;
  /** Caller-supplied evidence resolver. When set, the SDK calls this hook to
   * fetch real EvidenceSource entries for buildAuthorization /
   * buildTransaction calldata. The SDK then validates the result against
   * `registry.requiredEvidenceSourceSet(primaryType)` and the I-70 canonical
   * ordering. When the resolver is absent AND the registry reports a non-
   * empty required set, the SDK fails closed rather than signing a digest
   * the on-chain validator will reject for missing evidence. PR-14 audit
   * M-4 closure. */
  evidenceResolver?: import("./evidence-resolver.js").EvidenceResolver;
}

export interface WstdiemContractAddresses {
  loopRegistry: Address;
  loopAuthorization: Address;
  loopForceExitAuthorizer: Address;
  loopExecutorV2: Address;
  loopForceExitExecutor: Address;
  loopAnchorRegistry: Address;
  loopRiskOracleAdapter: Address;
  loopFeeRouter: Address;
  emergencyGuardian: Address;
}

/** Per-market address bundle (resolved from the registry on read). */
export interface MarketAddressBundle {
  marketId: `0x${string}`;
  morpho: Address;
  vault: Address;
  loanToken: Address;
  collateralToken: Address;
  uniswapV3FlashPool: Address;
  sequencerUptimeFeed: Address;
  chainlinkFeed?: Address;
  curvePool?: Address;
}
