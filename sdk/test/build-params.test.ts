// T2a: unit tests for the friendly envelope-derivation helpers
// (buildOpenParams / buildRebalanceParams / buildExitParams /
// buildForceExitParams). Mocks the read client + readers via
// FakePublicClient — no live chain required.

import { describe, it, expect } from "vitest";
import { createSdk } from "../src/live/sdk-impl.js";
import { asBasisPoints, asChainId, asMarketId } from "../src/types/branded.js";
import type { Bytes32 } from "../src/types/branded.js";
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

const MARKET = asMarketId(("0x" + "ab".repeat(32)) as Bytes32);
const MERKLE_ROOT = ("0x" + "cd".repeat(32)) as const;
const OWNER = "0x0000000000000000000000000000000000000abc" as const;

const BUNDLE: MarketAddressBundle = {
  marketId: MARKET,
  morpho: "0x0000000000000000000000000000000000000201",
  vault: "0x0000000000000000000000000000000000000202",
  loanToken: "0x0000000000000000000000000000000000000301",
  collateralToken: "0x0000000000000000000000000000000000000302",
  uniswapV3FlashPool: "0x0000000000000000000000000000000000000203",
  sequencerUptimeFeed: "0x0000000000000000000000000000000000000204",
  chainlinkFeed: "0x0000000000000000000000000000000000000205",
};

function buildSdk(opts?: { nonceBitmap?: bigint; blockNumber?: bigint }) {
  const fake = new FakePublicClient({
    blockNumber: opts?.blockNumber ?? 1_500_000n,
    handlers: {
      registryVersion: () => 7n,
      registryMerkleRoot: () => MERKLE_ROOT,
      // nonce bitmap: default bit0 used so the allocator picks bit1.
      nonceBitmap: () => opts?.nonceBitmap ?? 0b1n,
      marketParams: () => ({
        loanToken: BUNDLE.loanToken,
        collateralToken: BUNDLE.collateralToken,
        oracle: "0x0000000000000000000000000000000000000303",
        irm: "0x0000000000000000000000000000000000000304",
        lltv: 800_000_000_000_000_000n,
      }),
      domainSeparator: () => "0x" + "ef".repeat(32),
      executorFor: (args) =>
        Number(args[0]) === 3 ? LOOP_FORCE_EXEC : LOOP_EXEC_V2,
    },
  });
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
    initialMarkets: [BUNDLE],
    strictAnchorCrossCheck: false,
    allowSingleClientReads: true,
  });
  return { fake, sdk };
}

describe("buildOpenParams", () => {
  it("derives a well-formed Open envelope from friendly inputs", async () => {
    const { sdk } = buildSdk();
    const action = await sdk.buildOpenParams({
      market: MARKET,
      owner: OWNER,
      collateralAmount: 1_000_000n,
      leverageBps: asBasisPoints(20_000), // 2.0x
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
    });

    expect(action.primaryType).toBe("Open");
    // registryVersion + merkleRoot sourced from the registry reader.
    expect(action.registryVersion).toBe(7n);
    expect(action.registryMerkleRoot).toBe(MERKLE_ROOT);
    // user-signed manual: policyId 0, OWNER_DIRECT.
    expect(action.policyId).toBe(0n);
    expect(action.executionKind).toBe("OWNER_DIRECT");
    // verifyingContract + executor from config (LoopAuthorization path).
    expect(action.verifyingContract).toBe(LOOP_AUTH);
    expect(action.executor).toBe(LOOP_EXEC_V2);
    // fresh quote block from the read client.
    expect(action.quoteBlockNumber).toBe(1_500_000n);
    // nonce allocation picks the first free bit (bit0 used → bit1).
    expect(action.nonceSlot).toBe(0n);
    expect(action.nonceBit).toBe(1);
    // MEV passthrough.
    expect(action.mevProtectionMode).toBe("PRIVATE_BUILDER");
    // deadline is a future unix-seconds value.
    expect(action.deadline).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
    // evidenceBundleHash populated (non-zero-length) via resolveEvidence.
    expect(action.evidenceBundleHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("computes bounds from amount + leverage + slippage", async () => {
    const { sdk } = buildSdk();
    const action = await sdk.buildOpenParams({
      market: MARKET,
      owner: OWNER,
      collateralAmount: 1_000_000n,
      leverageBps: asBasisPoints(30_000), // 3.0x → borrow 2x the equity
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
      slippageBps: asBasisPoints(100), // 1%
    });
    // notionalBorrow = 1_000_000 * (30000-10000)/10000 = 2_000_000
    // maxBorrowedDiem = 2_000_000 * 10100/10000 = 2_020_000
    // minBorrowedDiem = 2_000_000 * 9900/10000 = 1_980_000
    expect(action.bounds.maxBorrowedDiem).toBe(2_020_000n);
    expect(action.bounds.minBorrowedDiem).toBe(1_980_000n);
    expect(action.bounds.minWstDiemReceived).toBe(1_980_000n);
    expect(action.bounds.maxLeverageBps).toBe(30_000);
    expect(action.bounds.maxSlippageBps).toBe(100);
    expect(action.bounds.minHealthFactor).toBe(1_050_000_000_000_000_000n);
  });

  it("produces a digest-ready envelope that quoteOpen accepts", async () => {
    const { sdk } = buildSdk();
    const action = await sdk.buildOpenParams({
      market: MARKET,
      owner: OWNER,
      collateralAmount: 500_000n,
      leverageBps: asBasisPoints(15_000),
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
    });
    const preview = await sdk.quoteOpen(action);
    expect(preview.action.primaryType).toBe("Open");
    expect(preview.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("nonce allocation", () => {
  it("walks to the next slot when the first is fully consumed", async () => {
    // slot 0 all-ones (every bit used) → allocator advances to slot 1 bit0.
    const allOnes = (1n << 256n) - 1n;
    let call = 0;
    const { sdk, fake } = buildSdk();
    // Re-register nonceBitmap to return all-ones for slot 0, free for slot 1.
    (
      fake as unknown as {
        handlers: Map<string, (a: readonly unknown[]) => unknown>;
      }
    ).handlers.set("nonceBitmap", (args) => {
      call++;
      const slot = args[3] as bigint;
      return slot === 0n ? allOnes : 0n;
    });
    const action = await sdk.buildOpenParams({
      market: MARKET,
      owner: OWNER,
      collateralAmount: 1_000_000n,
      leverageBps: asBasisPoints(20_000),
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
    });
    expect(action.nonceSlot).toBe(1n);
    expect(action.nonceBit).toBe(0);
    expect(call).toBeGreaterThanOrEqual(2);
  });
});

describe("buildRebalanceParams / buildExitParams / buildForceExitParams", () => {
  it("builds a Rebalance envelope with target leverage bounds", async () => {
    const { sdk } = buildSdk();
    const action = await sdk.buildRebalanceParams({
      market: MARKET,
      owner: OWNER,
      collateralAmount: 1_000_000n,
      leverageBps: asBasisPoints(25_000),
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
    });
    expect(action.primaryType).toBe("Rebalance");
    expect(action.bounds.targetLeverageBps).toBe(25_000);
    expect(action.bounds.maxCollateralSold).toBe(1_000_000n);
    expect(action.verifyingContract).toBe(LOOP_AUTH);
    expect(action.executor).toBe(LOOP_EXEC_V2);
    const preview = await sdk.quoteRebalance(action);
    expect(preview.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("builds an Exit envelope respecting the route kind", async () => {
    const { sdk } = buildSdk();
    const action = await sdk.buildExitParams({
      market: MARKET,
      owner: OWNER,
      collateralAmount: 800_000n,
      routeKind: "REPAY_ONLY",
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
    });
    expect(action.primaryType).toBe("Exit");
    expect(action.routeKind).toBe("REPAY_ONLY");
    expect(action.bounds.repayOnly).toBe(true);
    expect(action.bounds.maxCollateralSold).toBe(800_000n);
  });

  it("builds a ForceExit envelope bound to the force-exit authorizer + executor", async () => {
    const { sdk } = buildSdk();
    const action = await sdk.buildForceExitParams({
      market: MARKET,
      owner: OWNER,
      collateralAmount: 800_000n,
      acknowledgedRisks: 0b11,
      mevProtectionMode: "PRIVATE_BUILDER",
      mevWaiverBits: 0,
    });
    expect(action.primaryType).toBe("ForceExit");
    // ForceExit binds to the DISTINCT authorizer + executor.
    expect(action.verifyingContract).toBe(LOOP_FORCE_EXIT_AUTH);
    expect(action.executor).toBe(LOOP_FORCE_EXEC);
    expect(action.bounds.acknowledgedRisks).toBe(0b11);
    const preview = await sdk.quoteForceExit(action);
    expect(preview.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
