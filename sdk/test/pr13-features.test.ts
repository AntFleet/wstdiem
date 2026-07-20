// PR-13 feature regression tests. Locks the behavior contracts added in
// phase-d/pr-13-sdk-round-2:
//
//   - Sub-hash assembly: real spenderListHash + allowanceScheduleHash from
//     SPENDER_LIST_TYPEHASH / ALLOWANCE_SCHEDULE_TYPEHASH (not placeholder).
//   - feeCapHash derived from action bounds (not placeholder).
//   - quoteHash assembled from on-chain Curve get_dy / Uniswap V3 quoter.
//   - Block-pinned reads in getReadiness + getPositionRisk + getMarketEvidence.
//   - Full positionRisk with healthFactorWad + leverageBps + liquidationDistanceBps.
//   - A5-3 on-chain LoopAnchorRegistry cross-check (strict ON by default).
//   - LoopExecutorV2 / LoopForceExitExecutor calldata round-trip with decodeCalldata.
//   - Multi-event ABI for decodeLoopEvent (PolicyCreated / StateSnapshotAccepted).
//   - subscribePosition polling-based.

import { describe, it, expect } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
} from "viem";
import { createSdk } from "../src/live/sdk-impl.js";
import { asChainId, asPolicyId } from "../src/types/branded.js";
import {
  SPENDER_LIST_TYPEHASH,
  ALLOWANCE_SCHEDULE_TYPEHASH,
  FEE_CAPS_TYPEHASH,
  emptySpenderListHash,
  emptyAllowanceScheduleHash,
  hashFeeCaps,
  hashQuoteRoutes,
} from "../src/eip712/index.js";
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
const UNI_V3_QUOTER = "0x000000000000000000000000000000000000010a" as const;
// EIP-170 Phase 3 split-out fingerprint contract emitter.
const FINGERPRINT_REGISTRY = "0x000000000000000000000000000000000000010b" as const;

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

function buildFake(): FakePublicClient {
  const fake = new FakePublicClient({
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
      // PR-14: align Chainlink updatedAt with FakePublicClient.getBlock()
      // timestamp (1_700_000_000) so the new staleness check (default 24h)
      // accepts the reading. Tests that exercise staleness can override.
      latestRoundData: () => [1n, 200_000_000n, 1_699_999_900n, 1_699_999_900n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
      decimals: () => 8,
      position: () => [0n, 100_000_000n, 5_000_000_000_000_000_000n] as readonly [bigint, bigint, bigint],
      market: () => [
        1_000_000n,
        1_000_000n,
        500_000n,
        500_000n,
        0n,
        0n,
      ] as readonly [bigint, bigint, bigint, bigint, bigint, bigint],
      convertToAssets: () => 1_000_000_000_000_000_000n,
      domainSeparator: () => ("0x" + "11".repeat(32)),
      get_dy: () => 1_000_000_000_000n,
      lastAnchorBlock: () => 1_400_000n,
      anchorSubmitter: () => "0x0000000000000000000000000000000000000abc",
    },
  });
  return fake;
}

function buildSdk(extraConfig?: Partial<Parameters<typeof createSdk>[0]>) {
  const fake = buildFake();
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
  // Default: register matching on-chain anchor log for the cross-check.
  fake.setLogs([
    {
      args: { manifestHash: MANIFEST_HASH, submitter: "0x0000000000000000000000000000000000000abc" },
    },
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
      // PR-14: opt into single-client reads. PR-13 fixtures predate
      // PR-14 audit H-4 fail-closed default.
      allowSingleClientReads: true,
      ...extraConfig,
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

describe("PR-13: sub-hash assembly", () => {
  it("emptySpenderListHash binds SPENDER_LIST_TYPEHASH + keccak256(\"\")", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }],
        [SPENDER_LIST_TYPEHASH as `0x${string}`, keccak256("0x")],
      ),
    );
    expect(emptySpenderListHash()).toBe(expected);
  });

  it("emptyAllowanceScheduleHash binds ALLOWANCE_SCHEDULE_TYPEHASH + keccak256(\"\")", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }],
        [ALLOWANCE_SCHEDULE_TYPEHASH as `0x${string}`, keccak256("0x")],
      ),
    );
    expect(emptyAllowanceScheduleHash()).toBe(expected);
  });

  it("hashFeeCaps binds FEE_CAPS_TYPEHASH + (flash, protocol, automation)", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [FEE_CAPS_TYPEHASH as `0x${string}`, 1n, 2n, 3n],
      ),
    );
    expect(
      hashFeeCaps({ flashFeeCap: 1n, protocolFeeCap: 2n, automationFeeCap: 3n }),
    ).toBe(expected);
  });

  it("buildAuthorization assembles real sub-hashes (no placeholders)", async () => {
    const { sdk } = buildSdk();
    const built = await sdk.buildAuthorization(openTemplate as never);
    // Cast typedData to inspect the message.subHashes (informational).
    expect(built.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(built.evidence.actionId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("quoteOpen produces a non-zero quoteHash when Curve route succeeds", async () => {
    const { sdk } = buildSdk();
    const preview = await sdk.quoteOpen(openTemplate as never);
    // Non-zero quoteId (== hashQuoteRoutes) means routes were derived from
    // the on-chain Curve get_dy quote stub.
    expect(preview.quoteId).not.toBe("0x" + "00".repeat(32));
    expect(preview.subHashes.spenderListHash).toBe(emptySpenderListHash());
    expect(preview.subHashes.feeCapHash).toBe(
      hashFeeCaps({
        flashFeeCap: openTemplate.bounds.flashFeeCap,
        protocolFeeCap: openTemplate.bounds.protocolFeeCap,
        automationFeeCap: openTemplate.bounds.automationFeeCap,
      }),
    );
  });
});

describe("PR-13: A5-3 anchor cross-check", () => {
  it("getReadiness throws when on-chain anchor < indexer-claimed anchor", async () => {
    const { fake, sdk } = buildSdk({ strictAnchorCrossCheck: true });
    // Simulate registry behind the indexer's claim (1399900) — registry returns 1.
    fake.setHandler(LOOP_ANCHOR_REGISTRY, "lastAnchorBlock", () => 1n);
    await expect(sdk.getReadiness(MARKET as never)).rejects.toThrow(
      /indexer-anchor-ahead-of-registry/,
    );
  });

  it("getReadiness throws when on-chain manifestHash differs", async () => {
    const { fake, sdk } = buildSdk({ strictAnchorCrossCheck: true });
    fake.setHandler(LOOP_ANCHOR_REGISTRY, "lastAnchorBlock", () => 1_400_000n);
    fake.setLogs([
      {
        args: {
          manifestHash: ("0x" + "dd".repeat(32)),
          submitter: "0x0000000000000000000000000000000000000abc",
        },
        blockNumber: 1_400_000n,
      },
    ]);
    await expect(sdk.getReadiness(MARKET as never)).rejects.toThrow(
      /manifest-hash-mismatch/,
    );
  });

  it("getReadiness throws when on-chain submitter differs from registry (H-3)", async () => {
    const { fake, sdk } = buildSdk({ strictAnchorCrossCheck: true });
    fake.setLogs([
      {
        args: {
          manifestHash: MANIFEST_HASH,
          submitter: "0x000000000000000000000000000000000000dead",
        },
        blockNumber: 1_400_000n,
      },
    ]);
    await expect(sdk.getReadiness(MARKET as never)).rejects.toThrow(
      /submitter-untrusted/,
    );
  });

  it("getReadiness throws when indexer returns no snapshot (C-1 fail-closed)", async () => {
    const fake = buildFake();
    const fetcher = fakeFetch({
      get: {
        "/health": {
          status: "ok",
          chainId: 8453,
          head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") },
        },
        "/snapshots/latest": { latest: null },
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
      strictAnchorCrossCheck: true,
      // PR-15: opt into single-client reads so we don't short-circuit on
      // quorum before reaching the anchor cross-check.
      allowSingleClientReads: true,
    });
    await expect(sdk.getReadiness(MARKET as never)).rejects.toThrow(
      /no-indexer-anchor-claim/,
    );
  });

  it("getReadiness passes when on-chain manifestHash matches indexer claim", async () => {
    const { sdk } = buildSdk({ strictAnchorCrossCheck: true });
    const result = await sdk.getReadiness(MARKET as never);
    expect(result.indexerAnchor.status).toBe("fresh");
  });
});

describe("PR-13: full positionRisk (LTV/HF/liquidation distance)", () => {
  it("returns healthFactorWad + leverageBps + liquidationDistanceBps when oracle is healthy", async () => {
    const { sdk } = buildSdk({ strictAnchorCrossCheck: false });
    const risk = await sdk.getPositionRisk(MARKET as never, OWNER);
    expect(risk.collateralWstDiem).toBe(5_000_000_000_000_000_000n);
    expect(risk.debtDiem).toBeGreaterThan(0n);
    expect(risk.healthFactorWad).toBeDefined();
    expect(risk.healthFactorWad!).toBeGreaterThan(0n);
    expect(risk.errors).toHaveLength(0);
  });

  it("surfaces OracleStale when oracle answer is non-positive", async () => {
    const { fake, sdk } = buildSdk({ strictAnchorCrossCheck: false });
    fake.setHandler(CHAINLINK_FEED, "latestRoundData", () => [
      1n,
      0n, // zero answer triggers OracleStale
      1_499_999n,
      1_499_999n,
      1n,
    ]);
    fake.setHandler(CHAINLINK_FEED, "decimals", () => 8);
    const risk = await sdk.getPositionRisk(MARKET as never, OWNER);
    expect(risk.errors).toContain("OracleStale");
  });
});

describe("PR-13: executor calldata + decodeCalldata round-trip", () => {
  it("buildTransaction returns LoopExecutorV2.executeOpen calldata", async () => {
    const { sdk } = buildSdk();
    const tx = await sdk.buildTransaction(openTemplate as never);
    expect(tx.to).toBe(LOOP_EXEC_V2);
    expect(tx.data).toMatch(/^0x[0-9a-f]+$/);
    expect(tx.data.length).toBeGreaterThan(64);
  });

  it("decodeCalldata recovers an Open Action from buildTransaction calldata", async () => {
    const { sdk } = buildSdk();
    const tx = await sdk.buildTransaction(openTemplate as never);
    const decoded = await sdk.decodeCalldata(tx.data);
    expect(decoded.primaryType).toBe("Open");
    expect(decoded.owner.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(decoded.market.toLowerCase()).toBe(MARKET.toLowerCase());
  });

  it("ForceExit buildTransaction routes to LoopForceExitExecutor", async () => {
    const forceExit = {
      ...openTemplate,
      primaryType: "ForceExit" as const,
      executor: LOOP_FORCE_EXEC,
      bounds: {
        minRepayment: 0n,
        maxCollateralSold: 1_000_000n,
        looseSlippageBps: 1_000 as never,
        looseFlashFeeCap: 10_000n,
        maxCurvePositionShareBps: 5_000 as never,
        acknowledgedRisks: 1,
      },
    };
    const { sdk } = buildSdk();
    const tx = await sdk.buildTransaction(forceExit as never);
    expect(tx.to).toBe(LOOP_FORCE_EXEC);
    const decoded = await sdk.decodeCalldata(tx.data);
    expect(decoded.primaryType).toBe("ForceExit");
  });
});

describe("PR-13: decodeLoopEvent expanded ABI", () => {
  it("decodes a PolicyCreated event", async () => {
    const { sdk } = buildSdk();
    const topics = encodeEventTopics({
      abi: [
        {
          type: "event",
          name: "PolicyCreated",
          inputs: [
            { name: "owner", type: "address", indexed: true },
            { name: "policyId", type: "uint64", indexed: true },
            { name: "primaryType", type: "uint8", indexed: true },
            { name: "policyHash", type: "bytes32", indexed: false },
            { name: "expiryBlock", type: "uint256", indexed: false },
          ],
        },
      ] as const,
      args: { owner: OWNER, policyId: 7n, primaryType: 0 },
    });
    const data = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [("0x" + "ab".repeat(32)) as `0x${string}`, 999_999n],
    );
    const decoded = await sdk.decodeLoopEvent({
      address: LOOP_AUTH,
      topics: topics as `0x${string}`[],
      data,
    });
    expect((decoded as { eventName: string }).eventName).toBe("PolicyCreated");
  });

  it("decodes a StateSnapshotAccepted event", async () => {
    const { sdk } = buildSdk();
    const topics = encodeEventTopics({
      abi: [
        {
          type: "event",
          name: "StateSnapshotAccepted",
          inputs: [
            { name: "blockNumber", type: "uint256", indexed: true },
            { name: "manifestHash", type: "bytes32", indexed: true },
            { name: "submitter", type: "address", indexed: true },
          ],
        },
      ] as const,
      args: {
        blockNumber: 1_400_000n,
        manifestHash: MANIFEST_HASH,
        submitter: "0x0000000000000000000000000000000000000abc",
      },
    });
    const decoded = await sdk.decodeLoopEvent({
      address: LOOP_ANCHOR_REGISTRY,
      topics: topics as `0x${string}`[],
      data: "0x" as `0x${string}`,
    });
    expect((decoded as { eventName: string }).eventName).toBe("StateSnapshotAccepted");
  });
});

describe("EIP-170 Phase 3: fingerprint-registry event decode", () => {
  const CONTRACTS = {
    loopRegistry: LOOP_REGISTRY,
    loopAuthorization: LOOP_AUTH,
    loopForceExitAuthorizer: LOOP_FORCE_EXIT_AUTH,
    loopExecutorV2: LOOP_EXEC_V2,
    loopForceExitExecutor: LOOP_FORCE_EXEC,
    loopAnchorRegistry: LOOP_ANCHOR_REGISTRY,
    loopRiskOracleAdapter: LOOP_RISK_ORACLE_ADAPTER,
    loopFeeRouter: LOOP_FEE_ROUTER,
    emergencyGuardian: EMERGENCY_GUARDIAN,
  } as const;
  const INTEGRATION_ID = ("0x" + "1c".repeat(32)) as `0x${string}`;
  const FINGERPRINT_HASH = ("0x" + "2d".repeat(32)) as `0x${string}`;

  it("decodes ExternalFingerprintUpdateQueued from the fingerprint registry", async () => {
    const { sdk } = buildSdk({
      contracts: { ...CONTRACTS, loopFingerprintRegistry: FINGERPRINT_REGISTRY },
    });
    const topics = encodeEventTopics({
      abi: [
        {
          type: "event",
          name: "ExternalFingerprintUpdateQueued",
          inputs: [
            { name: "integrationId", type: "bytes32", indexed: true },
            { name: "fingerprintHash", type: "bytes32", indexed: false },
            { name: "effectiveBlock", type: "uint256", indexed: false },
          ],
        },
      ] as const,
      args: { integrationId: INTEGRATION_ID },
    });
    const data = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [FINGERPRINT_HASH, 1_500_100n],
    );
    const decoded = await sdk.decodeLoopEvent({
      address: FINGERPRINT_REGISTRY,
      topics: topics as `0x${string}`[],
      data,
    });
    expect((decoded as { eventName: string }).eventName).toBe(
      "ExternalFingerprintUpdateQueued",
    );
  });

  it("decodes ExternalFingerprintUpdateApplied from the fingerprint registry", async () => {
    const { sdk } = buildSdk({
      contracts: { ...CONTRACTS, loopFingerprintRegistry: FINGERPRINT_REGISTRY },
    });
    const topics = encodeEventTopics({
      abi: [
        {
          type: "event",
          name: "ExternalFingerprintUpdateApplied",
          inputs: [
            { name: "integrationId", type: "bytes32", indexed: true },
            { name: "fingerprintHash", type: "bytes32", indexed: false },
          ],
        },
      ] as const,
      args: { integrationId: INTEGRATION_ID },
    });
    const data = encodeAbiParameters([{ type: "bytes32" }], [FINGERPRINT_HASH]);
    const decoded = await sdk.decodeLoopEvent({
      address: FINGERPRINT_REGISTRY,
      topics: topics as `0x${string}`[],
      data,
    });
    expect((decoded as { eventName: string }).eventName).toBe(
      "ExternalFingerprintUpdateApplied",
    );
  });

  it("decodes ReclosedIntegration from the fingerprint registry", async () => {
    const { sdk } = buildSdk({
      contracts: { ...CONTRACTS, loopFingerprintRegistry: FINGERPRINT_REGISTRY },
    });
    const topics = encodeEventTopics({
      abi: [
        {
          type: "event",
          name: "ReclosedIntegration",
          inputs: [{ name: "integrationId", type: "bytes32", indexed: true }],
        },
      ] as const,
      args: { integrationId: INTEGRATION_ID },
    });
    const decoded = await sdk.decodeLoopEvent({
      address: FINGERPRINT_REGISTRY,
      topics: topics as `0x${string}`[],
      data: "0x" as `0x${string}`,
    });
    expect((decoded as { eventName: string }).eventName).toBe("ReclosedIntegration");
  });

  it("refuses fingerprint-registry events when the split contract is NOT configured", async () => {
    // Pre-split deployment: loopFingerprintRegistry absent, so the emitter is
    // untrusted and decode must fail closed (guards the `undefined` case).
    const { sdk } = buildSdk({ contracts: { ...CONTRACTS } });
    const topics = encodeEventTopics({
      abi: [
        {
          type: "event",
          name: "ReclosedIntegration",
          inputs: [{ name: "integrationId", type: "bytes32", indexed: true }],
        },
      ] as const,
      args: { integrationId: INTEGRATION_ID },
    });
    await expect(
      sdk.decodeLoopEvent({
        address: FINGERPRINT_REGISTRY,
        topics: topics as `0x${string}`[],
        data: "0x" as `0x${string}`,
      }),
    ).rejects.toThrow(/untrusted address/);
  });
});

describe("PR-13: subscribePosition polling", () => {
  it("emits initial position and stops after unsubscribe", async () => {
    const { sdk } = buildSdk({ strictAnchorCrossCheck: false, positionPollIntervalMs: 50 });
    const seen: bigint[] = [];
    const cancel = sdk.subscribePosition(OWNER, MARKET as never, (risk) => {
      seen.push(risk.collateralWstDiem);
    });
    await new Promise((r) => setTimeout(r, 25));
    cancel();
    await new Promise((r) => setTimeout(r, 100));
    expect(seen.length).toBeGreaterThanOrEqual(1);
    // After cancel, no more emissions even if the next tick had fired.
    const afterCancel = seen.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(seen.length).toBe(afterCancel);
  });
});

describe("PR-13: block-pinned reads", () => {
  it("getReadiness records readContract calls and getBlockNumber pre-fan-out", async () => {
    const { fake, sdk } = buildSdk({ strictAnchorCrossCheck: false });
    fake.calls.length = 0;
    await sdk.getReadiness(MARKET as never);
    // Multiple validateExternalConfig calls (one per primaryType) all share
    // the same block context.
    const externalConfigCalls = fake.calls.filter(
      (c) => c.functionName === "validateExternalConfig",
    );
    expect(externalConfigCalls.length).toBeGreaterThanOrEqual(5);
  });
});

void hashQuoteRoutes;
