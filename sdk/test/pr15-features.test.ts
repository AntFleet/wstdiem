// PR-15 feature regression tests. Locks behavior added in
// phase-d/pr-15-sdk-round-4:
//   - Quorum-wrapped PublicClient (audit C-1 full closure).
//   - sourceAddress cross-check against registry.canonicalSource (H-2).
//   - attachSignature pinnedBlockNumber.
//   - getReadiness short-circuits to blocked when quorum is degraded
//     (no contract reads attempted).

import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { createSdk } from "../src/live/sdk-impl.js";
import { LOOP_EXECUTOR_V2_ABI } from "../src/live/abis.js";
import { asChainId, asPolicyId } from "../src/types/branded.js";
import { SOURCE_ID_HASHES } from "../src/types/evidence.js";
import { FakePublicClient, fakeFetch } from "./live-helpers.js";
import type { MarketAddressBundle } from "../src/live/config.js";
import type { EvidenceResolver } from "../src/live/evidence-resolver.js";

const LOOP_REGISTRY = "0x0000000000000000000000000000000000000101" as const;
const LOOP_AUTH = "0x0000000000000000000000000000000000000102" as const;
const LOOP_FORCE_EXIT_AUTH = "0x0000000000000000000000000000000000000103" as const;
const LOOP_EXEC_V2 = "0x0000000000000000000000000000000000000104" as const;
const LOOP_FORCE_EXEC = "0x0000000000000000000000000000000000000105" as const;
const LOOP_ANCHOR_REGISTRY = "0x0000000000000000000000000000000000000106" as const;
const LOOP_RISK_ORACLE_ADAPTER = "0x0000000000000000000000000000000000000107" as const;
const LOOP_FEE_ROUTER = "0x0000000000000000000000000000000000000108" as const;
const EMERGENCY_GUARDIAN = "0x0000000000000000000000000000000000000109" as const;

const MARKET = ("0x" + "ab".repeat(32)) as `0x${string}`;
const MORPHO = "0x0000000000000000000000000000000000000201" as const;
const VAULT = "0x0000000000000000000000000000000000000202" as const;
const FLASH_POOL = "0x0000000000000000000000000000000000000203" as const;
const SEQUENCER_FEED = "0x0000000000000000000000000000000000000204" as const;
const CURVE_POOL = "0x0000000000000000000000000000000000000205" as const;
const CHAINLINK_FEED = "0x0000000000000000000000000000000000000206" as const;
const LOAN_TOKEN = "0x0000000000000000000000000000000000000301" as const;
const COLLATERAL_TOKEN = "0x0000000000000000000000000000000000000302" as const;
const OWNER = "0x0000000000000000000000000000000000000abc" as const;
const MANIFEST_HASH = ("0x" + "fe".repeat(32)) as `0x${string}`;

const BUNDLE: MarketAddressBundle = {
  marketId: MARKET,
  morpho: MORPHO,
  vault: VAULT,
  loanToken: LOAN_TOKEN,
  collateralToken: COLLATERAL_TOKEN,
  uniswapV3FlashPool: FLASH_POOL,
  sequencerUptimeFeed: SEQUENCER_FEED,
  curvePool: CURVE_POOL,
  chainlinkFeed: CHAINLINK_FEED,
};

function baseHandlers() {
  return {
    registryVersion: () => 1n,
    registryMerkleRoot: () => ("0x" + "cd".repeat(32)),
    marketParams: () => ({
      loanToken: LOAN_TOKEN,
      collateralToken: COLLATERAL_TOKEN,
      oracle: "0x0000000000000000000000000000000000000303",
      irm: "0x0000000000000000000000000000000000000304",
      lltv: 800000000000000000n,
    }),
    validateExternalConfig: () => true,
    executorFor: (args: readonly unknown[]) =>
      (Number(args[0]) === 3 ? LOOP_FORCE_EXEC : LOOP_EXEC_V2),
    latestRoundData: () =>
      [1n, 200_000_000n, 1_699_999_900n, 1_699_999_900n, 1n] as readonly [
        bigint, bigint, bigint, bigint, bigint,
      ],
    decimals: () => 8,
    position: () =>
      [0n, 100_000_000n, 5_000_000_000_000_000_000n] as readonly [
        bigint, bigint, bigint,
      ],
    market: () =>
      [1_000_000n, 1_000_000n, 500_000n, 500_000n, 0n, 0n] as readonly [
        bigint, bigint, bigint, bigint, bigint, bigint,
      ],
    convertToAssets: () => 1_000_000_000_000_000_000n,
    domainSeparator: () => ("0x" + "11".repeat(32)),
    get_dy: () => 1_000_000_000_000n,
    lastAnchorBlock: () => 1_400_000n,
    anchorSubmitter: () => "0x0000000000000000000000000000000000000abc",
    requiredEvidenceSourceSet: () => [],
    canonicalSource: () => MORPHO,
  };
}

describe("PR-15: getReadiness short-circuit on degraded quorum", () => {
  it("returns blocked decisions without throwing when single-PublicClient and no opt-in", async () => {
    const fake = new FakePublicClient({ blockNumber: 1_500_000n, handlers: baseHandlers() });
    fake.setLogs([
      { args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" } },
    ]);
    const fetcher = fakeFetch({
      get: {
        "/health": { status: "ok", chainId: 8453, head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") } },
        "/snapshots/latest": {
          latest: {
            anchorBlock: "1399900",
            manifestHash: MANIFEST_HASH,
            submitter: "0x0000000000000000000000000000000000000abc",
            blockNumber: "1400000",
            blockHash: "0xaa".padEnd(66, "0"),
            transactionHash: "0xbb".padEnd(66, "0"),
            logIndex: 0,
          },
        },
        "/policies": { policies: [] },
      },
    });
    const sdk = createSdk({
      chainId: asChainId(8453),
      publicClient: fake.asPublicClient(),
      indexerBaseUrl: "http://indexer.test",
      fetch: fetcher,
      contracts: {
        loopRegistry: LOOP_REGISTRY,
        loopAuthorization: LOOP_AUTH,
        loopForceExitAuthorizer: LOOP_FORCE_EXIT_AUTH,
        loopExecutorV2: LOOP_EXEC_V2,
        loopForceExitExecutor: LOOP_FORCE_EXEC,
        loopAnchorRegistry: LOOP_ANCHOR_REGISTRY,
        loopRiskOracleAdapter: LOOP_RISK_ORACLE_ADAPTER,
        loopFeeRouter: LOOP_FEE_ROUTER,
        emergencyGuardian: EMERGENCY_GUARDIAN,
      },
      initialMarkets: [BUNDLE],
      strictAnchorCrossCheck: false,
      // Intentionally NO allowSingleClientReads — exercises the
      // short-circuit. Without short-circuit, the absence of contract
      // handlers would throw earlier.
    });
    const r = await sdk.getReadiness(MARKET as never);
    expect(r.perAction.Open?.decision).toBe("blocked");
    expect(r.perAction.Open?.errors).toContain("RpcQuorumDegraded");
    expect(r.rpcQuorum.status).toBe("degraded");
  });
});

describe("PR-15: sourceAddress canonical-source cross-check (audit H-2)", () => {
  const openTemplate = {
    primaryType: "Open" as const,
    owner: OWNER,
    chainId: asChainId(8453),
    verifyingContract: LOOP_AUTH,
    executor: LOOP_EXEC_V2,
    market: MARKET as never,
    registryVersion: 1n as never,
    registryMerkleRoot: ("0x" + "cd".repeat(32)) as never,
    policyId: asPolicyId(0n),
    nonceSlot: 0n,
    nonceBit: 0,
    executionKind: "OWNER_DIRECT" as const,
    deadline: 1_700_000_000 as never,
    quoteBlockNumber: 1_500_000n as never,
    maxQuoteAgeBlocks: 10,
    maxQuoteDeviationBps: 50 as never,
    mevProtectionMode: "PRIVATE_BUILDER" as const,
    mevWaiverBits: 0,
    evidenceBundleHash: ("0x" + "ef".repeat(32)) as never,
    bounds: {
      minWstDiemReceived: 1_000n,
      minBorrowedDiem: 500n,
      maxBorrowedDiem: 1_000_000n,
      maxSlippageBps: 100 as never,
      maxPriceImpactBps: 200 as never,
      maxLeverageBps: 30_000 as never,
      minHealthFactor: 1_100_000_000_000_000_000n,
      minLiquidationDistanceBps: 500 as never,
      maxMorphoUtilizationImpactBps: 1_000 as never,
      flashFeeCap: 1_000n,
      protocolFeeCap: 500n,
      automationFeeCap: 250n,
    },
  };

  const MORPHO_HASH =
    "0x4572e563d333c7c905811411af5189452e337a48560e391102fd73e6145d19e4" as `0x${string}`;
  const HOSTILE = "0x000000000000000000000000000000000000dead" as const;

  function buildSdkWithResolver(resolver: EvidenceResolver, opts?: {
    canonicalSourceReturn?: `0x${string}`;
    requiredSet?: ReadonlyArray<`0x${string}`>;
  }) {
    const fake = new FakePublicClient({
      blockNumber: 1_500_000n,
      handlers: {
        ...baseHandlers(),
        canonicalSource: () => opts?.canonicalSourceReturn ?? MORPHO,
        requiredEvidenceSourceSet: () => opts?.requiredSet ?? [MORPHO_HASH],
      },
    });
    fake.setLogs([
      { args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" } },
    ]);
    return createSdk({
      chainId: asChainId(8453),
      publicClient: fake.asPublicClient(),
      indexerBaseUrl: "http://indexer.test",
      fetch: fakeFetch({
        get: {
          "/health": { status: "ok", chainId: 8453, head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") } },
          "/snapshots/latest": { latest: { anchorBlock: "1399900", manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc", blockNumber: "1400000", blockHash: "0xaa".padEnd(66, "0"), transactionHash: "0xbb".padEnd(66, "0"), logIndex: 0 } },
          "/policies": { policies: [] },
        },
      }),
      contracts: {
        loopRegistry: LOOP_REGISTRY,
        loopAuthorization: LOOP_AUTH,
        loopForceExitAuthorizer: LOOP_FORCE_EXIT_AUTH,
        loopExecutorV2: LOOP_EXEC_V2,
        loopForceExitExecutor: LOOP_FORCE_EXEC,
        loopAnchorRegistry: LOOP_ANCHOR_REGISTRY,
        loopRiskOracleAdapter: LOOP_RISK_ORACLE_ADAPTER,
        loopFeeRouter: LOOP_FEE_ROUTER,
        emergencyGuardian: EMERGENCY_GUARDIAN,
      },
      initialMarkets: [BUNDLE],
      strictAnchorCrossCheck: false,
      allowSingleClientReads: true,
      evidenceResolver: resolver,
    });
  }

  it("accepts a resolver bundle when sourceAddress matches canonicalSource", async () => {
    const resolver: EvidenceResolver = async () => ({
      sources: [
        {
          sourceId: "morpho-position",
          sourceIdHash: MORPHO_HASH,
          sourceAddress: MORPHO,
          status: "fresh" as const,
          lastUpdateBlock: 1_500_000n as never,
          valueHash: ("0x" + "aa".repeat(32)) as `0x${string}`,
        } as never,
      ],
    });
    const sdk = buildSdkWithResolver(resolver);
    const auth = await sdk.buildAuthorization(openTemplate as never);
    expect(auth.evidence.sources).toHaveLength(1);
  });

  it("throws when resolver supplies a hostile sourceAddress that differs from canonicalSource", async () => {
    const resolver: EvidenceResolver = async () => ({
      sources: [
        {
          sourceId: "morpho-position",
          sourceIdHash: MORPHO_HASH,
          sourceAddress: HOSTILE,
          status: "fresh" as const,
          lastUpdateBlock: 1_500_000n as never,
          valueHash: ("0x" + "aa".repeat(32)) as `0x${string}`,
        } as never,
      ],
    });
    const sdk = buildSdkWithResolver(resolver);
    await expect(sdk.buildAuthorization(openTemplate as never)).rejects.toThrow(
      /does not match registry\.canonicalSource/,
    );
  });

  // Regression: the executor calldata's `sources[].sourceId` slot is bytes32 and
  // takes the keccak256 sourceIdHash, NEVER the raw UTF-8 label. Previously
  // evidenceToCalldata forwarded s.sourceId ("morpho-position", 15 bytes),
  // which viem's encodeFunctionData rejected with
  // AbiEncodingBytesSizeMismatchError (bytes15 != bytes32). buildAuthorization
  // alone never surfaced it — only buildTransaction/attachSignature encode the
  // executor calldata. This locks the sourceIdHash convention on that path.
  it("encodes sourceIdHash (not the raw label) into the executor calldata bytes32 sourceId slot", async () => {
    const resolver: EvidenceResolver = async () => ({
      sources: [
        {
          sourceId: "morpho-position",
          sourceIdHash: SOURCE_ID_HASHES["morpho-position"],
          sourceAddress: MORPHO,
          status: "fresh" as const,
          lastUpdateBlock: 1_500_000n as never,
          valueHash: ("0x" + "aa".repeat(32)) as `0x${string}`,
        } as never,
      ],
    });
    const sdk = buildSdkWithResolver(resolver);

    // buildTransaction goes through evidenceToCalldata + encodeFunctionData —
    // the exact path that threw AbiEncodingBytesSizeMismatchError before the fix.
    const tx = await sdk.buildTransaction(openTemplate as never);
    expect(tx.data.length).toBeGreaterThan(2);

    // Decode the executor calldata and assert the on-chain sourceId equals the
    // canonical keccak256 sourceIdHash, matching hashSources() in the encoder.
    const decoded = decodeFunctionData({
      abi: LOOP_EXECUTOR_V2_ABI,
      data: tx.data as `0x${string}`,
    });
    expect(decoded.functionName).toBe("executeOpen");
    // args = [action, sig, evidence, proof]; evidence.sources is the encoded set.
    const evidenceArg = (decoded.args as readonly unknown[])[2] as {
      sources: readonly { sourceId: `0x${string}` }[];
    };
    expect(evidenceArg.sources).toHaveLength(1);
    expect(evidenceArg.sources[0]!.sourceId.toLowerCase()).toBe(
      SOURCE_ID_HASHES["morpho-position"].toLowerCase(),
    );
  });
});

describe("PR-15: attachSignature pinnedBlockNumber", () => {
  it("returns the same digest after attachSignature when caller pins blockNumber from buildTransaction", async () => {
    const fake = new FakePublicClient({ blockNumber: 1_500_000n, handlers: baseHandlers() });
    fake.setLogs([
      { args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" } },
    ]);
    const sdk = createSdk({
      chainId: asChainId(8453),
      publicClient: fake.asPublicClient(),
      indexerBaseUrl: "http://indexer.test",
      fetch: fakeFetch({
        get: {
          "/health": { status: "ok", chainId: 8453, head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") } },
          "/snapshots/latest": { latest: { anchorBlock: "1399900", manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc", blockNumber: "1400000", blockHash: "0xaa".padEnd(66, "0"), transactionHash: "0xbb".padEnd(66, "0"), logIndex: 0 } },
          "/policies": { policies: [] },
        },
      }),
      contracts: {
        loopRegistry: LOOP_REGISTRY,
        loopAuthorization: LOOP_AUTH,
        loopForceExitAuthorizer: LOOP_FORCE_EXIT_AUTH,
        loopExecutorV2: LOOP_EXEC_V2,
        loopForceExitExecutor: LOOP_FORCE_EXEC,
        loopAnchorRegistry: LOOP_ANCHOR_REGISTRY,
        loopRiskOracleAdapter: LOOP_RISK_ORACLE_ADAPTER,
        loopFeeRouter: LOOP_FEE_ROUTER,
        emergencyGuardian: EMERGENCY_GUARDIAN,
      },
      initialMarkets: [BUNDLE],
      strictAnchorCrossCheck: false,
      allowSingleClientReads: true,
    });
    const openTemplate = {
      primaryType: "Open" as const,
      owner: OWNER,
      chainId: asChainId(8453),
      verifyingContract: LOOP_AUTH,
      executor: LOOP_EXEC_V2,
      market: MARKET as never,
      registryVersion: 1n as never,
      registryMerkleRoot: ("0x" + "cd".repeat(32)) as never,
      policyId: asPolicyId(0n),
      nonceSlot: 0n,
      nonceBit: 0,
      executionKind: "OWNER_DIRECT" as const,
      deadline: 1_700_000_000 as never,
      quoteBlockNumber: 1_500_000n as never,
      // PR-17 audit C-1: maxQuoteAgeBlocks must accommodate the 50-block
      // chain advancement below or the new freshness bound rejects the pin
      // as QuoteStale.
      maxQuoteAgeBlocks: 100,
      maxQuoteDeviationBps: 50 as never,
      mevProtectionMode: "PRIVATE_BUILDER" as const,
      mevWaiverBits: 0,
      evidenceBundleHash: ("0x" + "ef".repeat(32)) as never,
      bounds: {
        minWstDiemReceived: 1_000n,
        minBorrowedDiem: 500n,
        maxBorrowedDiem: 1_000_000n,
        maxSlippageBps: 100 as never,
        maxPriceImpactBps: 200 as never,
        maxLeverageBps: 30_000 as never,
        minHealthFactor: 1_100_000_000_000_000_000n,
        minLiquidationDistanceBps: 500 as never,
        maxMorphoUtilizationImpactBps: 1_000 as never,
        flashFeeCap: 1_000n,
        protocolFeeCap: 500n,
        automationFeeCap: 250n,
      },
    };
    const tx = await sdk.buildTransaction(openTemplate as never);
    // Simulate the chain advancing between buildTransaction and signing.
    fake.setBlockNumber(1_500_050n);
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    const signed = await sdk.attachSignature(openTemplate as never, sig, tx.digest, {
      pinnedBlockNumber: tx.pinnedBlockNumber,
    });
    expect(signed.digest).toBe(tx.digest);
  });
});
