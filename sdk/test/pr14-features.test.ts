// PR-14 feature regression tests. Locks the behavior contracts added in
// phase-d/pr-14-sdk-round-3.

import { describe, it, expect } from "vitest";
import { createSdk } from "../src/live/sdk-impl.js";
import { asChainId, asPolicyId, asBlockNumber } from "../src/types/branded.js";
import { RpcQuorum } from "../src/live/quorum.js";
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

function baseFake(): FakePublicClient {
  return new FakePublicClient({
    blockNumber: 1_500_000n,
    handlers: {
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
      executorFor: (args) => (Number(args[0]) === 3 ? LOOP_FORCE_EXEC : LOOP_EXEC_V2),
      latestRoundData: () => [1n, 200_000_000n, 1_699_999_900n, 1_699_999_900n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
      decimals: () => 8,
      position: () => [0n, 100_000_000n, 5_000_000_000_000_000_000n] as readonly [bigint, bigint, bigint],
      market: () => [1_000_000n, 1_000_000n, 500_000n, 500_000n, 0n, 0n] as readonly [bigint, bigint, bigint, bigint, bigint, bigint],
      convertToAssets: () => 1_000_000_000_000_000_000n,
      domainSeparator: () => ("0x" + "11".repeat(32)),
      get_dy: () => 1_000_000_000_000n,
      lastAnchorBlock: () => 1_400_000n,
      anchorSubmitter: () => "0x0000000000000000000000000000000000000abc",
      requiredEvidenceSourceSet: () => [],
      // PR-15 audit H-2: canonicalSource must return the registered
      // canonical address per sourceIdHash. Default to MORPHO; tests that
      // exercise mismatch override per-test.
      canonicalSource: () => MORPHO,
    },
  });
}

function buildSdk(extra?: Partial<Parameters<typeof createSdk>[0]>) {
  const fake = baseFake();
  const snapshotPayload = {
    latest: {
      anchorBlock: "1399900",
      manifestHash: MANIFEST_HASH,
      submitter: "0x0000000000000000000000000000000000000abc",
      blockNumber: "1400000",
      blockHash: "0xaa".padEnd(66, "0"),
      transactionHash: "0xbb".padEnd(66, "0"),
      logIndex: 0,
    },
  };
  const fetcher = fakeFetch({
    get: {
      "/health": {
        status: "ok",
        chainId: 8453,
        head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") },
      },
      "/snapshots/latest": snapshotPayload,
      "/policies": { policies: [] },
    },
  });
  fake.setLogs([
    { args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" } },
  ]);
  return {
    fake,
    sdk: createSdk({
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
      // Shared fixture: opt into single-client reads. PR-14 audit-fix tests
      // that exercise the fail-closed behavior override this in `extra`.
      allowSingleClientReads: true,
      ...extra,
    }),
  };
}

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

describe("PR-14: attachSignature", () => {
  it("returns calldata longer than the unsigned buildTransaction output", async () => {
    const { sdk } = buildSdk();
    const tx = await sdk.buildTransaction(openTemplate as never);
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    const signed = await sdk.attachSignature(openTemplate as never, sig);
    expect(signed.to).toBe(LOOP_EXEC_V2);
    expect(signed.data.length).toBeGreaterThan(tx.data.length);
    expect(signed.digest).toBe(tx.digest);
  });

  it("throws on QuoteDrift when expectedDigest differs from recomputed", async () => {
    const { sdk } = buildSdk();
    const sig = ("0x" + "22".repeat(65)) as `0x${string}`;
    const wrongDigest = ("0x" + "ee".repeat(32)) as `0x${string}` as never;
    await expect(
      sdk.attachSignature(openTemplate as never, sig, wrongDigest),
    ).rejects.toThrow(/QuoteDrift/);
  });

  it("throws when signature is not a 0x-prefixed hex string", async () => {
    const { sdk } = buildSdk();
    await expect(
      sdk.attachSignature(openTemplate as never, "not-a-hex" as `0x${string}`),
    ).rejects.toThrow(/0x-prefixed/);
  });
});

describe("PR-14: empty-route fail-closed (audit M-2)", () => {
  it("throws when curvePool configured but get_dy returns null and uniswap quoter absent", async () => {
    const fake = baseFake();
    fake.setHandler(CURVE_POOL, "get_dy", () => {
      throw new Error("simulated revert");
    });
    const fetcher = fakeFetch({
      get: {
        "/health": { status: "ok", chainId: 8453, head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") } },
        "/snapshots/latest": { latest: { anchorBlock: "1399900", manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc", blockNumber: "1400000", blockHash: "0xaa".padEnd(66, "0"), transactionHash: "0xbb".padEnd(66, "0"), logIndex: 0 } },
        "/policies": { policies: [] },
      },
    });
    fake.setLogs([
      { args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" } },
    ]);
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
    });
    await expect(sdk.buildAuthorization(openTemplate as never)).rejects.toThrow(
      /requires at least one quote route/,
    );
  });
});

describe("PR-14: Chainlink staleness (audit L-2)", () => {
  it("surfaces OracleStale when updatedAt is older than staleAfterSeconds threshold", async () => {
    const { fake, sdk } = buildSdk({ oracleStaleAfterSeconds: 60 });
    // Force a very old answer.
    fake.setHandler(CHAINLINK_FEED, "latestRoundData", () => [1n, 200_000_000n, 1n, 1n, 1n]);
    fake.setHandler(CHAINLINK_FEED, "decimals", () => 8);
    const risk = await sdk.getPositionRisk(MARKET as never, OWNER);
    expect(risk.errors).toContain("OracleStale");
  });

  it("surfaces OracleStale when answeredInRound < roundId (stuck round)", async () => {
    const { fake, sdk } = buildSdk();
    fake.setHandler(CHAINLINK_FEED, "latestRoundData", () => [
      10n, // roundId
      200_000_000n,
      1_699_999_900n,
      1_699_999_900n,
      9n, // answeredInRound < roundId
    ]);
    fake.setHandler(CHAINLINK_FEED, "decimals", () => 8);
    const risk = await sdk.getPositionRisk(MARKET as never, OWNER);
    expect(risk.errors).toContain("OracleStale");
  });
});

describe("PR-14: RPC quorum tracker (I-68 / A3-9)", () => {
  it("returns 'ok' when distinct families return the same block within lag tolerance", async () => {
    const f1 = baseFake();
    const f2 = baseFake();
    const f3 = baseFake();
    const quorum = new RpcQuorum(
      [
        { client: f1.asPublicClient(), providerFamily: "alchemy" },
        { client: f2.asPublicClient(), providerFamily: "infura" },
        { client: f3.asPublicClient(), providerFamily: "ankr" },
      ],
      { threshold: 2 },
    );
    const result = await quorum.getBlockNumber();
    expect(result.status.status).toBe("ok");
    expect(result.status.matchedFamilies.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 'notIndependent' when all providers come from the same family", async () => {
    const f1 = baseFake();
    const f2 = baseFake();
    const quorum = new RpcQuorum(
      [
        { client: f1.asPublicClient(), providerFamily: "publicrpc" },
        { client: f2.asPublicClient(), providerFamily: "publicrpc" },
      ],
      { threshold: 2 },
    );
    const result = await quorum.getBlockNumber();
    expect(result.status.status).toBe("notIndependent");
  });

  it("returns 'blockInconsistent' when one provider drifts beyond maxBlockLagBlocks", async () => {
    const f1 = baseFake();
    const f2 = baseFake();
    f1.setBlockNumber(1_500_000n);
    f2.setBlockNumber(1_500_010n);
    const quorum = new RpcQuorum(
      [
        { client: f1.asPublicClient(), providerFamily: "alchemy" },
        { client: f2.asPublicClient(), providerFamily: "infura" },
      ],
      { threshold: 2, maxBlockLagBlocks: 5 },
    );
    const result = await quorum.getBlockNumber();
    expect(result.status.status).toBe("blockInconsistent");
  });

  it("gates perAction decisions to blocked when configured quorum is degraded", async () => {
    const f1 = baseFake();
    const { sdk } = buildSdk({
      publicClients: [
        { client: f1.asPublicClient(), providerFamily: "publicrpc" },
      ],
      quorum: { threshold: 2 },
    });
    const r = await sdk.getReadiness(MARKET as never);
    expect(r.perAction.Open?.decision).toBe("blocked");
    expect(r.perAction.Open?.errors).toContain("RpcQuorumDegraded");
  });
});

describe("PR-14: indexer signature verification", () => {
  it("throws IndexerHttpError when signingKey is set but X-Indexer-Signature header is missing", async () => {
    const fake = baseFake();
    fake.setLogs([
      { args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" } },
    ]);
    const fetcher = (async () =>
      new Response(JSON.stringify({ status: "ok", chainId: 8453, head: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
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
      allowSingleClientReads: true,
      indexerSigningKey: "0x000000000000000000000000000000000000abcd",
      indexerVerifier: async () => "0x000000000000000000000000000000000000abcd",
    });
    await expect(sdk.indexer.health()).rejects.toThrow(/X-Indexer-Signature/);
  });

  it("throws on signature mismatch even when header is present", async () => {
    const fake = baseFake();
    const fetcher = (async () =>
      new Response(JSON.stringify({ status: "ok", chainId: 8453, head: null }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-indexer-signature": "0x" + "11".repeat(65),
        },
      })) as typeof fetch;
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
      allowSingleClientReads: true,
      indexerSigningKey: "0x000000000000000000000000000000000000abcd",
      // Verifier "recovers" a different address.
      indexerVerifier: async () => "0x0000000000000000000000000000000000001234",
    });
    await expect(sdk.indexer.health()).rejects.toThrow(/does not match expected signer/);
  });
});

describe("PR-14: evidence resolver (audit M-4)", () => {
  it("throws when required set is non-empty and no resolver is supplied", async () => {
    const fake = baseFake();
    fake.setHandler(LOOP_REGISTRY, "requiredEvidenceSourceSet", () => [
      "0x4572e563d333c7c905811411af5189452e337a48560e391102fd73e6145d19e4" as `0x${string}`,
    ]);
    const fetcher = fakeFetch({
      get: {
        "/health": { status: "ok", chainId: 8453, head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") } },
        "/snapshots/latest": { latest: { anchorBlock: "1399900", manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc", blockNumber: "1400000", blockHash: "0xaa".padEnd(66, "0"), transactionHash: "0xbb".padEnd(66, "0"), logIndex: 0 } },
        "/policies": { policies: [] },
      },
    });
    fake.setLogs([
      { args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" } },
    ]);
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
    });
    await expect(sdk.buildAuthorization(openTemplate as never)).rejects.toThrow(
      /requiredEvidenceSourceSet/,
    );
  });

  it("accepts a resolver-supplied bundle that covers the required set", async () => {
    const { fake, sdk: _ } = buildSdk();
    void _;
    fake.setHandler(LOOP_REGISTRY, "requiredEvidenceSourceSet", () => [
      "0x4572e563d333c7c905811411af5189452e337a48560e391102fd73e6145d19e4" as `0x${string}`,
    ]);
    const resolver: EvidenceResolver = async () => ({
      sources: [
        {
          sourceId: "morpho-position",
          sourceIdHash:
            "0x4572e563d333c7c905811411af5189452e337a48560e391102fd73e6145d19e4" as `0x${string}`,
          sourceAddress: MORPHO,
          status: "fresh" as const,
          lastUpdateBlock: asBlockNumber(1_500_000n),
          valueHash: ("0x" + "aa".repeat(32)) as `0x${string}`,
        } as never,
      ],
    });
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
      evidenceResolver: resolver,
    });
    const auth = await sdk.buildAuthorization(openTemplate as never);
    expect(auth.evidence.sources.length).toBe(1);
  });
});
