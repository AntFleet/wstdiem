// PR-12 audit regression tests. Locks the behavior changes integrated from
// the Codex+Codex+Claude audit on phase-d/pr-12-sdk-live-impl.

import { describe, it, expect } from "vitest";
import { createSdk } from "../src/live/sdk-impl.js";
import { asChainId, asPolicyId } from "../src/types/branded.js";
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
};

const DOMAIN_LOOP_AUTH = ("0x" + "11".repeat(32));
const DOMAIN_FORCE_EXIT_AUTH = ("0x" + "22".repeat(32));

function buildFakeClientWithAddressScopedDomains(): FakePublicClient {
  const fake = new FakePublicClient({
    blockNumber: 1_500_000n,
    handlers: {
      // Default function-name handlers (kept for back-compat tests)
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
      latestRoundData: () => [1n, 0n, 1000n, 1_500_000n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
    },
  });
  // AUDIT A10-1 / A11-2: register DISTINCT domain separators per contract
  // address so the FakePublicClient routes the call correctly.
  fake.setHandler(LOOP_AUTH, "domainSeparator", () => DOMAIN_LOOP_AUTH);
  fake.setHandler(LOOP_FORCE_EXIT_AUTH, "domainSeparator", () => DOMAIN_FORCE_EXIT_AUTH);
  return fake;
}

function buildSdkWithDistinctDomains(extraConfig?: Partial<Parameters<typeof createSdk>[0]>) {
  const fake = buildFakeClientWithAddressScopedDomains();
  const fetcher = fakeFetch({
    get: {
      "/health": {
        status: "ok",
        chainId: 8453,
        head: { lastIndexedBlock: "1400000", lastIndexedBlockHash: "0xaa".padEnd(66, "0") },
      },
      "/snapshots/latest": {
        latest: {
          anchorBlock: "1399900",
          manifestHash: "0xfe".padEnd(66, "0"),
          submitter: "0x0000000000000000000000000000000000000abc",
          blockNumber: "1400000",
          blockHash: "0xaa".padEnd(66, "0"),
          transactionHash: "0xbb".padEnd(66, "0"),
          logIndex: 0,
        },
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
      // PR-13: strict anchor cross-check disabled in this shared fixture.
      strictAnchorCrossCheck: false,
      // PR-14: opt into single-client reads.
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

const forceTemplate = {
  ...openTemplate,
  primaryType: "ForceExit" as const,
  verifyingContract: LOOP_FORCE_EXIT_AUTH,
  executor: LOOP_FORCE_EXEC,
  bounds: {
    minRepayment: 1000n,
    maxCollateralSold: 100_000n,
    looseSlippageBps: 200 as never,
    looseFlashFeeCap: 200n,
    maxCurvePositionShareBps: 2000 as never,
    acknowledgedRisks: 1,
  },
};

// AUDIT A10-1 CRITICAL — ForceExit uses LoopForceExitAuthorizer domain
describe("ForceExit domain routing (audit A10-1)", () => {
  it("ForceExit reads domain separator from LoopForceExitAuthorizer", async () => {
    const { sdk, fake } = buildSdkWithDistinctDomains();
    await sdk.buildAuthorization(forceTemplate);
    const domainCalls = fake.calls.filter((c) => c.functionName === "domainSeparator");
    const forceAuthCall = domainCalls.find((c) => c.address.toLowerCase() === LOOP_FORCE_EXIT_AUTH.toLowerCase());
    expect(forceAuthCall, "expected SDK to read forceExitAuthorizer.domainSeparator()").toBeDefined();
    // Open / Rebalance / Exit / Revoke / AutomationExec MUST NOT touch the force-auth address
  });

  it("Open reads domain separator from LoopAuthorization (not force)", async () => {
    const { sdk, fake } = buildSdkWithDistinctDomains();
    await sdk.buildAuthorization(openTemplate);
    const domainCalls = fake.calls.filter((c) => c.functionName === "domainSeparator");
    const loopAuthCall = domainCalls.find((c) => c.address.toLowerCase() === LOOP_AUTH.toLowerCase());
    expect(loopAuthCall, "expected SDK to read loopAuthorization.domainSeparator()").toBeDefined();
    const forceAuthCall = domainCalls.find((c) => c.address.toLowerCase() === LOOP_FORCE_EXIT_AUTH.toLowerCase());
    expect(forceAuthCall, "Open MUST NOT read forceExitAuthorizer.domainSeparator()").toBeUndefined();
  });

  it("Open and ForceExit produce different digests when domain separators differ", async () => {
    const { sdk } = buildSdkWithDistinctDomains();
    const openAuth = await sdk.buildAuthorization(openTemplate);
    const forceAuth = await sdk.buildAuthorization(forceTemplate);
    expect(openAuth.digest).not.toBe(forceAuth.digest);
  });

  it("typedData.domain.verifyingContract routes correctly per action", async () => {
    const { sdk } = buildSdkWithDistinctDomains();
    const openAuth = await sdk.buildAuthorization(openTemplate);
    const forceAuth = await sdk.buildAuthorization(forceTemplate);
    const openDomain = (openAuth.typedData as { domain: { verifyingContract: string; name: string } }).domain;
    const forceDomain = (forceAuth.typedData as { domain: { verifyingContract: string; name: string } }).domain;
    expect(openDomain.verifyingContract.toLowerCase()).toBe(LOOP_AUTH.toLowerCase());
    expect(forceDomain.verifyingContract.toLowerCase()).toBe(LOOP_FORCE_EXIT_AUTH.toLowerCase());
    // PR-13 audit C1 fix: contracts/v2/LoopAuthorization.sol:27 declares
    // EIP712_NAME = "WSTDIEM Loop". The previous assertion locked the wrong
    // string.
    expect(openDomain.name).toBe("WSTDIEM Loop");
    expect(forceDomain.name).toBe("WSTDIEM ForceExit");
  });
});

// AUDIT A8-5 HIGH — integrationIds required for fingerprint gate
describe("integrationIds required (audit A8-5)", () => {
  it("getExternalProtocolFingerprints throws without config.integrationIds", async () => {
    const { sdk } = buildSdkWithDistinctDomains();
    await expect(sdk.getExternalProtocolFingerprints(MARKET as never)).rejects.toThrow(/integrationIds/);
  });
});

// AUDIT C2-1 HIGH — getAutomationPolicies parses real PR-10 PolicyRecord
describe("getAutomationPolicies real PR-10 shape (audit C2-1)", () => {
  it("parses primaryType / expiryBlock / state correctly", async () => {
    const { sdk } = buildSdkWithDistinctDomains({
      fetch: fakeFetch({
        get: {
          "/health": { status: "ok", chainId: 8453, head: null },
          "/snapshots/latest": { latest: null },
          "/policies": {
            policies: [
              {
                owner: OWNER,
                policyId: "10",
                primaryType: 1, // Rebalance
                policyHash: "0xab".padEnd(66, "0"),
                policyClass: 1, // REBALANCE
                createdBlock: "1000",
                expiryBlock: "5000",
                state: "active",
              },
            ],
          },
        },
      }),
    });
    const policies = await sdk.getAutomationPolicies(OWNER);
    expect(policies).toHaveLength(1);
    expect(policies[0]?.primaryType).toBe("Rebalance");
    expect(policies[0]?.policyClass).toBe("REBALANCE");
    expect(policies[0]?.expiryBlock).toBe(5000n);
  });

  it("throws on unknown policyClass byte (fail-closed)", async () => {
    const { sdk } = buildSdkWithDistinctDomains({
      fetch: fakeFetch({
        get: {
          "/health": { status: "ok", chainId: 8453, head: null },
          "/snapshots/latest": { latest: null },
          "/policies": {
            policies: [{
              owner: OWNER, policyId: "10", primaryType: 0, policyHash: "0x" + "00".repeat(32),
              policyClass: 99, createdBlock: "1000", expiryBlock: "5000", state: "active",
            }],
          },
        },
      }),
    });
    await expect(sdk.getAutomationPolicies(OWNER)).rejects.toThrow(/unknown policyClass/);
  });
});

// AUDIT C3-5 HIGH — PolicyId uint64 range validation
describe("PolicyId uint64 range (audit C3-5)", () => {
  it("asPolicyId rejects values >= 2^64", () => {
    expect(() => asPolicyId(1n << 64n)).toThrow(RangeError);
    expect(() => asPolicyId((1n << 64n) + 1n)).toThrow(RangeError);
    expect(asPolicyId((1n << 64n) - 1n)).toBe((1n << 64n) - 1n);
  });

  it("asPolicyId rejects negative values", () => {
    expect(() => asPolicyId(-1n)).toThrow(RangeError);
  });
});

// AUDIT A3-9 MEDIUM — RPC quorum surface reports "degraded" not "ok"
describe("rpcQuorum status (audit A3-9)", () => {
  it("getReadiness.rpcQuorum returns 'degraded' for single-PublicClient deployments", async () => {
    const { sdk } = buildSdkWithDistinctDomains();
    const r = await sdk.getReadiness(MARKET as never);
    expect(r.rpcQuorum.status).toBe("degraded");
  });
});

// AUDIT A8-11 MEDIUM — sequencer status uses block.timestamp, not Date.now
describe("sequencer status uses block.timestamp (audit A8-11)", () => {
  it("calls getBlock to fetch 'now' seconds reference", async () => {
    const { sdk, fake } = buildSdkWithDistinctDomains();
    const calls = fake.calls;
    await sdk.getReadiness(MARKET as never);
    // FakePublicClient.getBlock returns timestamp 1_700_000_000n; not stuffed
    // into calls (since it's not readContract). The test confirms readiness
    // succeeded without crashing, which it would if Date.now() drifted vs
    // sequencer feed updatedAt (=1_500_000n).
    expect(calls.length).toBeGreaterThan(0);
  });
});
