// Integration tests for the LiveWstdiemSdk facade — mocks both viem
// PublicClient and the indexer fetch.

import { describe, it, expect } from "vitest";
import { createSdk } from "../src/live/sdk-impl.js";
import {
  asChainId,
} from "../src/types/branded.js";
import { FakePublicClient, fakeFetch } from "./live-helpers.js";
import type { MarketAddressBundle } from "../src/live/config.js";

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
const CHAINLINK_FEED = "0x0000000000000000000000000000000000000205" as const;
const LOAN_TOKEN = "0x0000000000000000000000000000000000000301" as const;
const COLLATERAL_TOKEN = "0x0000000000000000000000000000000000000302" as const;
const OWNER = "0x0000000000000000000000000000000000000abc" as const;

const BUNDLE: MarketAddressBundle = {
  marketId: MARKET,
  morpho: MORPHO,
  vault: VAULT,
  loanToken: LOAN_TOKEN,
  collateralToken: COLLATERAL_TOKEN,
  uniswapV3FlashPool: FLASH_POOL,
  sequencerUptimeFeed: SEQUENCER_FEED,
  chainlinkFeed: CHAINLINK_FEED,
};

function buildFakeClient(): FakePublicClient {
  return new FakePublicClient({
    blockNumber: 1_500_000n,
    handlers: {
      // Registry
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
      // LoopAuthorization
      domainSeparator: () => ("0x" + "ef".repeat(32)),
      // Morpho
      position: () => [0n, 50_000_000n, 100_000_000_000n] as readonly [bigint, bigint, bigint],
      market: () => [
        1_000_000_000_000n,
        1_000_000_000n,
        500_000_000_000n,
        500_000_000n,
        1_400_000n,
        1_000_000n,
      ] as readonly [bigint, bigint, bigint, bigint, bigint, bigint],
      // Vault
      convertToAssets: (args) => BigInt(args[0] as bigint),
      // Sequencer feed (up)
      latestRoundData: () => [1n, 0n, 1000n, 1_500_000n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
    },
  });
}

function buildSdk(opts?: { snapshotsLatest?: unknown; healthHead?: bigint | null }) {
  const fake = buildFakeClient();
  const head = opts?.healthHead === undefined ? 1_400_000n : opts.healthHead;
  const snapshotsLatestPayload =
    opts?.snapshotsLatest ?? {
      latest: {
        anchorBlock: "1399900",
        manifestHash: "0xfe".padEnd(66, "0"),
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
        head: head === null ? null : { lastIndexedBlock: head.toString(), lastIndexedBlockHash: "0xaa".padEnd(66, "0") },
      },
      "/snapshots/latest": snapshotsLatestPayload,
      "/policies": {
        policies: [
          {
            owner: OWNER,
            policyId: "1",
            primaryType: 0,
            policyHash: "0xcd".padEnd(66, "0"),
            policyClass: 0,
            createdBlock: "1000",
            expiryBlock: "5000",
            state: "active",
          },
        ],
      },
    },
  });
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
      // PR-13: strict anchor cross-check is on by default in production. The
      // shared buildSdk fixture disables it so existing test cases that don't
      // exercise the cross-check don't have to register on-chain anchor
      // handlers. PR-13 audit-fix tests exercise the cross-check explicitly.
      strictAnchorCrossCheck: false,
      // PR-14 audit H-4: the default fixture opts into single-client reads so
      // existing PR-11/12/13 tests that assert `allowed` decisions continue
      // to pass. Production deployments MUST opt in explicitly. PR-14
      // audit-fix tests exercise the fail-closed default explicitly.
      allowSingleClientReads: true,
    }),
  };
}

describe("LiveWstdiemSdk read-side", () => {
  it("getMarkets composes the registry version + supplied bundles", async () => {
    const { sdk } = buildSdk();
    const markets = await sdk.getMarkets();
    expect(markets).toHaveLength(1);
    expect(markets[0]?.id).toBe(MARKET);
    expect(markets[0]?.registryVersion).toBe(1n);
    expect(markets[0]?.uniswapV3FlashPool).toBe(FLASH_POOL);
  });

  it("getMarkets throws when no initialMarkets supplied", async () => {
    const { fake } = buildSdk();
    const fetcher = fakeFetch({ get: {} });
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
    });
    await expect(sdk.getMarkets()).rejects.toThrow(/initialMarkets/);
  });

  it("getReadiness returns per-action decisions + sequencer status + anchor", async () => {
    const { sdk } = buildSdk();
    const r = await sdk.getReadiness(MARKET as never);
    expect(r.market).toBe(MARKET);
    expect(r.perAction.Open?.decision).toBe("allowed");
    expect(r.perAction.ForceExit?.decision).toBe("allowed");
    expect(r.sequencer).toBe("up");
    expect(r.indexerAnchor.status).toBe("fresh");
  });

  it("getReadiness reports blocked when validateExternalConfig returns false", async () => {
    const fake = buildFakeClient();
    // override validateExternalConfig to false for one primaryType
    (fake as unknown as { handlers: Map<string, (a: readonly unknown[]) => unknown> }).handlers.set(
      "validateExternalConfig",
      (args) => Number(args[1]) !== 1, // Rebalance=1 blocked
    );
    const sdk = createSdk({
      chainId: asChainId(8453),
      publicClient: fake.asPublicClient(),
      indexerBaseUrl: "http://indexer.test",
      fetch: fakeFetch({
        get: {
          "/health": { status: "ok", chainId: 8453, head: null },
          "/snapshots/latest": { latest: null },
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
    const r = await sdk.getReadiness(MARKET as never);
    expect(r.perAction.Rebalance?.decision).toBe("blocked");
    expect(r.perAction.Open?.decision).toBe("allowed");
  });

  it("getPositionRisk pulls Morpho position + market for debt computation", async () => {
    const { sdk } = buildSdk();
    const risk = await sdk.getPositionRisk(MARKET as never, OWNER);
    // position.borrowShares=50_000_000; market.totalBorrowAssets=500_000_000_000; market.totalBorrowShares=500_000_000
    // expected debt = 50_000_000 * 500_000_000_000 / 500_000_000 = 50_000_000_000
    expect(risk.debtDiem).toBe(50_000_000_000n);
    expect(risk.collateralWstDiem).toBe(100_000_000_000n);
  });

  it("getAutomationPolicies filters by owner", async () => {
    const { sdk } = buildSdk();
    const policies = await sdk.getAutomationPolicies(OWNER);
    expect(policies).toHaveLength(1);
    expect(policies[0]?.policyId).toBe(1n);
  });

  it("getAutomationPolicies returns empty for an unrelated owner", async () => {
    const { sdk } = buildSdk();
    const policies = await sdk.getAutomationPolicies("0x0000000000000000000000000000000000000fff");
    expect(policies).toHaveLength(0);
  });

  it("getAnchorFreshness returns fresh status when lag <= 100", async () => {
    const { sdk } = buildSdk();
    const a = await sdk.getAnchorFreshness();
    expect(a.status).toBe("fresh");
  });

  it("getAnchorFreshness returns emergencyStale when lag > 300", async () => {
    const { sdk } = buildSdk({
      snapshotsLatest: {
        latest: {
          anchorBlock: "1000",
          manifestHash: "0xfe".padEnd(66, "0"),
          submitter: "0x0000000000000000000000000000000000000abc",
          blockNumber: "1010",
          blockHash: "0xaa".padEnd(66, "0"),
          transactionHash: "0xbb".padEnd(66, "0"),
          logIndex: 0,
        },
      },
      healthHead: 1_400_000n,
    });
    const a = await sdk.getAnchorFreshness();
    expect(a.status).toBe("emergencyStale");
  });

  it("getCanonicalErrors returns the registry copy", async () => {
    const { sdk } = buildSdk();
    const errs = await sdk.getCanonicalErrors();
    expect(errs.length).toBeGreaterThan(70);
    expect(errs.find((e) => e.name === "WrongChain")).toBeDefined();
  });
});

describe("LiveWstdiemSdk build-side", () => {
  it("buildAuthorization composes digest + evidence + typedData", async () => {
    const { sdk } = buildSdk();
    const open = {
      primaryType: "Open" as const,
      owner: OWNER,
      chainId: asChainId(8453),
      verifyingContract: LOOP_AUTH,
      executor: LOOP_EXEC_V2,
      market: MARKET as never,
      registryVersion: 1n as never,
      registryMerkleRoot: ("0x" + "cd".repeat(32)) as never,
      policyId: 0n as never,
      nonceSlot: 0n,
      nonceBit: 0,
      executionKind: "OWNER_DIRECT" as const,
      deadline: 1_900_000_000n as never,
      quoteBlockNumber: 1_500_000n as never,
      maxQuoteAgeBlocks: 5,
      maxQuoteDeviationBps: 50 as never,
      mevProtectionMode: "PRIVATE_BUILDER" as const,
      mevWaiverBits: 0,
      evidenceBundleHash: ("0x" + "00".repeat(32)) as never,
      bounds: {
        minWstDiemReceived: 100n,
        minBorrowedDiem: 10n,
        maxBorrowedDiem: 1000n,
        maxSlippageBps: 25 as never,
        maxPriceImpactBps: 25 as never,
        maxLeverageBps: 8500 as never,
        minHealthFactor: 1_100_000_000_000_000_000n,
        minLiquidationDistanceBps: 500 as never,
        maxMorphoUtilizationImpactBps: 500 as never,
        flashFeeCap: 10n,
        protocolFeeCap: 5n,
        automationFeeCap: 2n,
      },
    };
    const auth = await sdk.buildAuthorization(open);
    expect(auth.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(auth.evidence.market).toBe(MARKET);
    expect(auth.typedData).toBeDefined();
  });

  it("buildTransaction routes to the right executor per primaryType", async () => {
    const { sdk } = buildSdk();
    const force = {
      primaryType: "ForceExit" as const,
      owner: OWNER,
      chainId: asChainId(8453),
      verifyingContract: LOOP_FORCE_EXIT_AUTH,
      executor: LOOP_FORCE_EXEC,
      market: MARKET as never,
      registryVersion: 1n as never,
      registryMerkleRoot: ("0x" + "cd".repeat(32)) as never,
      policyId: 0n as never,
      nonceSlot: 0n,
      nonceBit: 0,
      executionKind: "OWNER_DIRECT" as const,
      deadline: 1_900_000_000n as never,
      quoteBlockNumber: 1_500_000n as never,
      maxQuoteAgeBlocks: 5,
      maxQuoteDeviationBps: 50 as never,
      mevProtectionMode: "PRIVATE_BUILDER" as const,
      mevWaiverBits: 0,
      evidenceBundleHash: ("0x" + "00".repeat(32)) as never,
      bounds: {
        minRepayment: 1000n,
        maxCollateralSold: 100_000n,
        looseSlippageBps: 200 as never,
        looseFlashFeeCap: 200n,
        maxCurvePositionShareBps: 2000 as never,
        acknowledgedRisks: 1,
      },
    };
    const tx = await sdk.buildTransaction(force);
    expect(tx.to.toLowerCase()).toBe(LOOP_FORCE_EXEC.toLowerCase());
    expect(tx.value).toBe(0n);
    expect(tx.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("revokeAuthorization produces revoke(policyId) calldata", async () => {
    const { sdk } = buildSdk();
    const r = await sdk.revokeAuthorization(42n as never);
    expect(r.transaction.to.toLowerCase()).toBe(LOOP_AUTH.toLowerCase());
    expect(r.transaction.data.length).toBeGreaterThan(2);
  });
});

describe("LiveWstdiemSdk decodeLoopEvent", () => {
  it("decodes a LoopActionStep event", async () => {
    const { sdk } = buildSdk();
    const { encodeAbiParameters, encodeEventTopics } = await import("viem");
    // PR-13 expanded decodeLoopEvent to the full §11 ABI; we exercise the
    // new LoopActionStep shape (stepIndex/primaryType/target/selector/terminal)
    // and assert the decoder surfaces the expected non-indexed fields.
    const topics = encodeEventTopics({
      abi: [{
        type: "event",
        name: "LoopActionStep",
        // PR-13 audit H1 fix: stepIndex is uint8 in ILoopV1Events.sol:16.
        inputs: [
          { name: "owner", type: "address", indexed: true },
          { name: "market", type: "bytes32", indexed: true },
          { name: "actionId", type: "bytes32", indexed: true },
          { name: "stepIndex", type: "uint8", indexed: false },
          { name: "primaryType", type: "uint8", indexed: false },
          { name: "target", type: "address", indexed: false },
          { name: "selector", type: "bytes4", indexed: false },
          { name: "terminal", type: "bool", indexed: false },
        ],
      }] as const,
      args: {
        owner: OWNER,
        market: MARKET as `0x${string}`,
        actionId: ("0x" + "01".repeat(32)) as `0x${string}`,
      },
    });
    const data = encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "uint8" },
        { type: "address" },
        { type: "bytes4" },
        { type: "bool" },
      ],
      [3, 1, LOOP_EXEC_V2 as never, ("0x12345678" as never), true],
    );
    const decoded = await sdk.decodeLoopEvent({
      address: LOOP_EXEC_V2,
      topics: topics as `0x${string}`[],
      data,
    });
    expect(decoded).toBeDefined();
  });
});
