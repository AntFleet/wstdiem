// PR-17 Gap 1 regression tests. Locks the WstdiemSdk-interface lift of
// attachSignature: the method is callable through the typed interface
// without the runtime feature-detect cast PR-16's useBuild.ts was forced
// to do.

import { describe, expect, it } from "vitest";
import { createSdk } from "../src/live/sdk-impl.js";
import { asChainId, asPolicyId } from "../src/types/branded.js";
import { FakePublicClient, fakeFetch } from "./live-helpers.js";
import type { MarketAddressBundle } from "../src/live/config.js";
import type { WstdiemSdk } from "../src/sdk.js";

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
      Number(args[0]) === 3 ? LOOP_FORCE_EXEC : LOOP_EXEC_V2,
    latestRoundData: () =>
      [1n, 200_000_000n, 1_699_999_900n, 1_699_999_900n, 1n] as readonly [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ],
    decimals: () => 8,
    position: () =>
      [0n, 100_000_000n, 5_000_000_000_000_000_000n] as readonly [
        bigint,
        bigint,
        bigint,
      ],
    market: () =>
      [1_000_000n, 1_000_000n, 500_000n, 500_000n, 0n, 0n] as readonly [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ],
    convertToAssets: () => 1_000_000_000_000_000_000n,
    domainSeparator: () => ("0x" + "11".repeat(32)),
    get_dy: () => 1_000_000_000_000n,
    lastAnchorBlock: () => 1_400_000n,
    anchorSubmitter: () => "0x0000000000000000000000000000000000000abc",
    requiredEvidenceSourceSet: () => [],
    canonicalSource: () => MORPHO,
    lastHarvestBlock: () => 0n,
    harvestCoolingBlocks: () => 0n,
    permissionlessCallerAllowed: () => false,
  };
}

function buildSdk() {
  const fake = new FakePublicClient({
    blockNumber: 1_500_000n,
    handlers: baseHandlers(),
  });
  fake.setLogs([
    {
      args: {
        manifestHash: MANIFEST_HASH,
        submitter: "0x0000000000000000000000000000000000000abc",
      },
    },
  ]);
  return {
    fake,
    sdk: createSdk({
      chainId: asChainId(8453),
      publicClient: fake.asPublicClient(),
      indexerBaseUrl: "http://indexer.test",
      fetch: fakeFetch({
        get: {
          "/health": {
            status: "ok",
            chainId: 8453,
            head: {
              lastIndexedBlock: "1400000",
              lastIndexedBlockHash: "0xaa".padEnd(66, "0"),
            },
          },
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

describe("PR-17 Gap 1: attachSignature on WstdiemSdk interface", () => {
  it("is callable via the typed WstdiemSdk interface without a runtime cast", async () => {
    const { sdk } = buildSdk();
    // Narrow to the interface — the call must compile against WstdiemSdk
    // directly (rather than LiveWstdiemSdk), which is the Gap 1 acceptance.
    const typed: WstdiemSdk = sdk;
    const tx = await typed.buildTransaction(openTemplate as never);
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    const signed = await typed.attachSignature(
      openTemplate as never,
      sig,
      tx.digest,
    );
    expect(signed.to).toBe(LOOP_EXEC_V2);
    expect(signed.digest).toBe(tx.digest);
    expect(signed.data.length).toBeGreaterThan(tx.data.length);
  });

  it("throws QuoteDrift when expectedDigest disagrees with the recomputed digest", async () => {
    const { sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    const wrongDigest = ("0x" + "ee".repeat(32)) as `0x${string}` as never;
    await expect(
      typed.attachSignature(openTemplate as never, sig, wrongDigest),
    ).rejects.toThrow(/QuoteDrift/);
  });

  it("threads pinnedBlockNumber so chain advancement between build and sign does not raise QuoteDrift", async () => {
    const { fake, sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    // PR-17 audit C-1: maxQuoteAgeBlocks must accommodate the 50-block
    // chain advancement below; bump from 10 → 100 on this fixture only so
    // the new freshness bound does not reject the pin as QuoteStale.
    const action = { ...openTemplate, maxQuoteAgeBlocks: 100 };
    const tx = await typed.buildTransaction(action as never);
    // Simulate the chain advancing between buildTransaction and signing.
    fake.setBlockNumber(1_500_050n);
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    // Without pinning, the SDK would re-pin to head and produce a different
    // evidence-bundle blockNumber. With pinning, the digest matches.
    // tx.pinnedBlockNumber is the field PR-15 added to buildTransaction's
    // return; typed against the interface this lives on LiveWstdiemSdk only,
    // but the interface contract documents the threading via the opts.
    const signed = await typed.attachSignature(
      action as never,
      sig,
      tx.digest,
      { pinnedBlockNumber: (tx as { pinnedBlockNumber: bigint }).pinnedBlockNumber },
    );
    expect(signed.digest).toBe(tx.digest);
  });

  it("rejects malformed signature strings", async () => {
    const { sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    await expect(
      typed.attachSignature(
        openTemplate as never,
        "not-a-hex" as `0x${string}`,
      ),
    ).rejects.toThrow(/0x-prefixed/);
  });

  // PR-17 audit MAJ-1: attachSignature return shape now matches buildTransaction
  // sibling — { to, data, value: bigint, digest }.
  it("returns value: 0n alongside to/data/digest (MAJ-1)", async () => {
    const { sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    const tx = await typed.buildTransaction(openTemplate as never);
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    const signed = await typed.attachSignature(
      openTemplate as never,
      sig,
      tx.digest,
    );
    expect(signed.value).toBe(0n);
    expect(signed.to).toBe(LOOP_EXEC_V2);
    expect(signed.digest).toBe(tx.digest);
  });
});

// PR-17 audit C-1: attachSignature.pinnedBlockNumber bounded against
// staleness AND head. Stale-bundle replay vector closed.
describe("PR-17 audit C-1: attachSignature pinnedBlockNumber freshness bound", () => {
  it("throws QuoteStale when pinnedBlockNumber is ahead of chain head", async () => {
    const { fake, sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    // Chain head defaults to 1_500_000n in buildSdk. Pin 1000 blocks in the
    // future; the bound must reject before any digest assembly happens.
    void fake;
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    await expect(
      typed.attachSignature(
        openTemplate as never,
        sig,
        undefined,
        { pinnedBlockNumber: 1_501_000n as never },
      ),
    ).rejects.toThrow(/QuoteStale/);
  });

  it("throws QuoteStale when pinnedBlockNumber is older than head - maxQuoteAgeBlocks", async () => {
    const { sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    // openTemplate.maxQuoteAgeBlocks = 10. Head = 1_500_000n. Pin head - 11 so
    // it is strictly beyond the stale window.
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    await expect(
      typed.attachSignature(
        openTemplate as never,
        sig,
        undefined,
        { pinnedBlockNumber: (1_500_000n - 11n) as never },
      ),
    ).rejects.toThrow(/QuoteStale/);
  });

  it("accepts pinnedBlockNumber exactly head - maxQuoteAgeBlocks (edge of window)", async () => {
    const { sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    // openTemplate.maxQuoteAgeBlocks = 10, but the template's quoteBlockNumber
    // = 1_500_000n which is read at the same height as the live chain head in
    // the fake. Use a quoteBlockNumber-matching pin so the digest re-assembly
    // doesn't drift on subordinate signals.
    const action = {
      ...openTemplate,
      quoteBlockNumber: (1_500_000n - 10n) as never,
    };
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    // No expectedDigest — we just want to confirm the pin passes the C-1
    // bound check (and doesn't blow up on stale digest semantics, which is
    // C-1's contract: the freshness gate runs BEFORE digest assembly).
    await expect(
      typed.attachSignature(
        action as never,
        sig,
        undefined,
        { pinnedBlockNumber: (1_500_000n - 10n) as never },
      ),
    ).resolves.toBeDefined();
  });

  it("accepts pinnedBlockNumber equal to head", async () => {
    const { sdk } = buildSdk();
    const typed: WstdiemSdk = sdk;
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    await expect(
      typed.attachSignature(
        openTemplate as never,
        sig,
        undefined,
        { pinnedBlockNumber: 1_500_000n as never },
      ),
    ).resolves.toBeDefined();
  });
});
