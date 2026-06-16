// PR-17 Gap 2 regression tests. Locks the gateStatuses surface populated on
// every TransactionPreview produced by the quote pipeline (and on
// ReadinessResult). Covers:
//   - assembleQuote populates gateStatuses with the 6 G-PM gate evaluations.
//   - Stale anchor → G-PM-2 fail.
//   - Single-PublicClient (no quorum) → G-PM-3 fail (degraded).
//   - High-risk Open + missing eip1271PreimageDisplayProof → G-PM-4 fail.
//   - getReadiness output includes gateStatuses (orthogonal to the §7.1
//     state bitmap matrix).

import { describe, expect, it } from "vitest";
import { createSdk } from "../src/live/sdk-impl.js";
import { asChainId, asPolicyId } from "../src/types/branded.js";
import { FakePublicClient, fakeFetch } from "./live-helpers.js";
import type { MarketAddressBundle } from "../src/live/config.js";
import { DEFAULT_ANCHOR_MAX_STALE_BLOCKS } from "../src/anchor/freshness.js";
import { evaluatePostMatrixGates } from "../src/gates/post-matrix.js";
import { MevWaiverBit } from "../src/types/enums.js";
import { asBlockNumber } from "../src/types/branded.js";

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

function baseHandlers(overrides?: Record<string, unknown>) {
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
    ...overrides,
  };
}

function buildSdk(opts?: {
  staleAnchor?: boolean;
  noQuorum?: boolean;
  handlerOverrides?: Record<string, unknown>;
}) {
  const fake = new FakePublicClient({
    blockNumber: 1_500_000n,
    handlers: baseHandlers(opts?.handlerOverrides),
  });
  fake.setLogs([
    {
      args: {
        manifestHash: MANIFEST_HASH,
        submitter: "0x0000000000000000000000000000000000000abc",
      },
    },
  ]);
  const anchorBlock = opts?.staleAnchor
    ? // Make the anchor stale: head - maxStale*2 so it's emergencyStale.
      String(1_500_000n - BigInt(DEFAULT_ANCHOR_MAX_STALE_BLOCKS) * 10n)
    : "1499900";
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
              lastIndexedBlock: "1500000",
              lastIndexedBlockHash: "0xaa".padEnd(66, "0"),
            },
          },
          "/snapshots/latest": {
            latest: {
              anchorBlock,
              manifestHash: MANIFEST_HASH,
              submitter: "0x0000000000000000000000000000000000000abc",
              blockNumber: "1500000",
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
      // No quorum (single client). Opt into single-client reads so the
      // SDK doesn't short-circuit getReadiness — we want the gate
      // evaluation to surface G-PM-3 as fail (degraded).
      allowSingleClientReads: !opts?.noQuorum,
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
    // PR-17 G-PM-4 fixture: maxBorrowedDiem > HIGH_RISK_THRESHOLD so the
    // gate evaluates to fail when no preimage proof is supplied.
    maxBorrowedDiem: 100_000_000_000_000_000_000n,
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

describe("PR-17 Gap 2: TransactionPreview.gateStatuses is populated", () => {
  it("includes every G-PM-1..6 gate after assembleQuote", async () => {
    const { sdk } = buildSdk();
    const preview = await sdk.quoteOpen(openTemplate as never);
    expect(preview.gateStatuses.length).toBe(6);
    const gates = new Set(preview.gateStatuses.map((g) => g.gate));
    expect(gates.has("G_PM_1_HARVEST_CONVERGENCE")).toBe(true);
    expect(gates.has("G_PM_2_INDEXER_ANCHOR_STALE")).toBe(true);
    expect(gates.has("G_PM_3_RPC_QUORUM_NOT_INDEPENDENT")).toBe(true);
    expect(gates.has("G_PM_4_EIP1271_PREIMAGE")).toBe(true);
    expect(gates.has("G_PM_5_MEV_WAIVER")).toBe(true);
    expect(gates.has("G_PM_6_AUTOMATION_THROTTLE")).toBe(true);
  });

  it("surfaces G-PM-3 fail when the SDK is in single-client mode (no quorum configured)", async () => {
    const { sdk } = buildSdk();
    const preview = await sdk.quoteOpen(openTemplate as never);
    const g3 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT",
    );
    expect(g3?.status).toBe("fail");
    expect(g3?.error).toBe("RpcQuorumDegraded");
  });

  it("surfaces G-PM-4 fail for high-risk Open without eip1271PreimageDisplayProof", async () => {
    const { sdk } = buildSdk();
    const preview = await sdk.quoteOpen(openTemplate as never);
    const g4 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_4_EIP1271_PREIMAGE",
    );
    expect(g4?.status).toBe("fail");
    expect(g4?.error).toBe("Eip1271PreimageNotAttested");
  });

  it("surfaces G-PM-4 pass when the preimage proof is supplied", async () => {
    const { sdk } = buildSdk();
    const withProof = {
      ...openTemplate,
      eip1271PreimageDisplayProof: ("0x" + "ab".repeat(32)) as `0x${string}`,
    };
    const preview = await sdk.quoteOpen(withProof as never);
    const g4 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_4_EIP1271_PREIMAGE",
    );
    expect(g4?.status).toBe("pass");
  });

  it("surfaces G-PM-2 fail when the indexer anchor is emergency-stale", async () => {
    const { sdk } = buildSdk({ staleAnchor: true });
    const preview = await sdk.quoteOpen(openTemplate as never);
    const g2 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_2_INDEXER_ANCHOR_STALE",
    );
    expect(g2?.status).toBe("fail");
    expect(g2?.error).toBe("IndexerAnchorStale");
  });

  it("populates gateStatuses on previewTransaction and simulate", async () => {
    const { sdk } = buildSdk();
    const action = { ...openTemplate, eip1271PreimageDisplayProof: ("0x" + "ab".repeat(32)) as `0x${string}` };
    const preview = await sdk.previewTransaction(action as never);
    const simulate = await sdk.simulate(action as never);
    expect(preview.gateStatuses.length).toBe(6);
    expect(simulate.gateStatuses.length).toBe(6);
  });
});

describe("PR-17 Gap 2: ReadinessResult.gateStatuses", () => {
  it("includes gateStatuses on the readiness output", async () => {
    const { sdk } = buildSdk();
    const r = await sdk.getReadiness(MARKET as never);
    expect(r.gateStatuses).toBeDefined();
    expect(r.gateStatuses?.length).toBe(6);
    // G-PM-3 surfaces RpcQuorumDegraded under single-client posture.
    const g3 = r.gateStatuses?.find(
      (g) => g.gate === "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT",
    );
    expect(g3?.status).toBe("fail");
  });
});

// PR-17 audit M-1: signerOnAllowList read from registry, not hardcoded false.
describe("PR-17 audit M-1: G-PM-4 signerOnAllowList from registry", () => {
  it("owner on preimage-display allow-list + zero proof + high-risk → G-PM-4 pass", async () => {
    const { sdk } = buildSdk({
      handlerOverrides: {
        // PR-17 M-1 fixture: owner IS on the registry allow-list. G-PM-4 then
        // returns notApplicable (covered by passes-or-notApplicable here),
        // because signerOnAllowList true short-circuits the high-risk path.
        preimageDisplayGuaranteedWallet: () => true,
      },
    });
    const preview = await sdk.quoteOpen(openTemplate as never);
    const g4 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_4_EIP1271_PREIMAGE",
    );
    // Owner on allow-list → preimage gate is not applicable (gate evaluator
    // short-circuits). Either pass or notApplicable closes the M-1 hole.
    expect(g4?.status === "pass" || g4?.status === "notApplicable").toBe(true);
    expect(g4?.status).not.toBe("fail");
  });

  it("owner NOT on allow-list + zero proof + high-risk → G-PM-4 fail (preserves baseline)", async () => {
    const { sdk } = buildSdk({
      handlerOverrides: {
        preimageDisplayGuaranteedWallet: () => false,
      },
    });
    const preview = await sdk.quoteOpen(openTemplate as never);
    const g4 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_4_EIP1271_PREIMAGE",
    );
    expect(g4?.status).toBe("fail");
    expect(g4?.error).toBe("Eip1271PreimageNotAttested");
  });

  it("registry read throws → G-PM-4 falls back to fail (fail-closed)", async () => {
    const { sdk } = buildSdk({
      handlerOverrides: {
        preimageDisplayGuaranteedWallet: () => {
          throw new Error("simulated registry RPC failure");
        },
      },
    });
    const preview = await sdk.quoteOpen(openTemplate as never);
    const g4 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_4_EIP1271_PREIMAGE",
    );
    // Registry read fails → signerOnAllowList defaults to false → high-risk
    // path requires preimage; zero proof → fail. M-1's fail-closed posture.
    expect(g4?.status).toBe("fail");
    expect(g4?.error).toBe("Eip1271PreimageNotAttested");
  });
});

// PR-17 audit M-2: G-PM-1 fires for ForceExit (risk-increasing per PROTOCOL.md §6.3).
describe("PR-17 audit M-2: G-PM-1 ForceExit risk-increasing classification", () => {
  // ForceExit fixture — minimal bounds + the same envelope shape as openTemplate.
  const forceExitTemplate = {
    primaryType: "ForceExit" as const,
    owner: OWNER,
    chainId: asChainId(8453),
    verifyingContract: LOOP_FORCE_EXIT_AUTH,
    executor: LOOP_FORCE_EXEC,
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
      minRepayment: 1_000n,
      maxCollateralSold: 100_000n,
      looseSlippageBps: 500 as never,
      looseFlashFeeCap: 1_000n,
      maxCurvePositionShareBps: 1000 as never,
      acknowledgedRisks: 0,
    },
  };

  it("ForceExit during cooling window → G-PM-1 fail with HarvestConvergencePending", async () => {
    const { sdk } = buildSdk({
      handlerOverrides: {
        // Last harvest was just before head; cooling window is wide enough
        // to engulf the request.
        lastHarvestBlock: () => 1_499_950n,
        harvestCoolingBlocks: () => 1_000n,
      },
    });
    const preview = await sdk.quoteForceExit(forceExitTemplate as never);
    const g1 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_1_HARVEST_CONVERGENCE",
    );
    expect(g1?.status).toBe("fail");
    expect(g1?.error).toBe("HarvestConvergencePending");
  });

  it("ForceExit outside cooling window → G-PM-1 pass", async () => {
    const { sdk } = buildSdk({
      handlerOverrides: {
        lastHarvestBlock: () => 0n,
        harvestCoolingBlocks: () => 100n,
      },
    });
    const preview = await sdk.quoteForceExit(forceExitTemplate as never);
    const g1 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_1_HARVEST_CONVERGENCE",
    );
    expect(g1?.status).toBe("pass");
  });

  it("standard Exit during cooling window → G-PM-1 notApplicable (unchanged)", async () => {
    const { sdk } = buildSdk({
      handlerOverrides: {
        lastHarvestBlock: () => 1_499_950n,
        harvestCoolingBlocks: () => 1_000n,
      },
    });
    const exitTemplate = {
      primaryType: "Exit" as const,
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
      routeKind: "REPAY_ONLY" as const,
      bounds: {
        minRepayment: 1_000n,
        maxCollateralSold: 100_000n,
        maxSlippageBps: 100 as never,
        maxCurvePositionShareBps: 1000 as never,
        maxMorphoUtilizationImpactBps: 1_000 as never,
        flashFeeCap: 1_000n,
        protocolFeeCap: 500n,
        automationFeeCap: 250n,
        repayOnly: true,
        acceptsThirdPartyRepay: false,
      },
    };
    const preview = await sdk.quoteExit(exitTemplate as never);
    const g1 = preview.gateStatuses.find(
      (g) => g.gate === "G_PM_1_HARVEST_CONVERGENCE",
    );
    // M-2: Exit (debt-reducing) is exempt — G-PM-1 stays notApplicable.
    expect(g1?.status).toBe("notApplicable");
  });
});

// PR-17 audit MAJ-2: G-PM-5 / G-PM-6 fail-state coverage via the post-matrix
// gate evaluator directly. These exercise the wired-but-previously-untested
// fail paths.
describe("PR-17 audit MAJ-2: G-PM-5 / G-PM-6 fail-state coverage", () => {
  it("G-PM-5 fail when PUBLIC mode without PUBLIC_MEMPOOL_OPT_IN waiver", () => {
    const statuses = evaluatePostMatrixGates({
      g5: {
        signedMode: "PUBLIC",
        observedChannel: "PUBLIC_MEMPOOL",
        signedWaiverBits: 0, // missing PUBLIC_MEMPOOL_OPT_IN
        builderKeyAvailable: false,
      },
    });
    const g5 = statuses.find((g) => g.gate === "G_PM_5_MEV_WAIVER");
    expect(g5?.status).toBe("fail");
    expect(g5?.error).toBe("MevWaiverMissing");
  });

  it("G-PM-5 pass when PUBLIC mode WITH PUBLIC_MEMPOOL_OPT_IN waiver (control)", () => {
    const statuses = evaluatePostMatrixGates({
      g5: {
        signedMode: "PUBLIC",
        observedChannel: "PUBLIC_MEMPOOL",
        signedWaiverBits: MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN,
        builderKeyAvailable: false,
      },
    });
    const g5 = statuses.find((g) => g.gate === "G_PM_5_MEV_WAIVER");
    expect(g5?.status).toBe("pass");
  });

  it("G-PM-6 fail when KEEPER_PERMISSIONLESS caller not in allow-list", () => {
    const statuses = evaluatePostMatrixGates({
      g6: {
        executionKind: "KEEPER_PERMISSIONLESS",
        failedAttemptsInWindow: 0,
        maxFailedAttemptsPerWindow: 5,
        callerAllowed: false,
      },
    });
    const g6 = statuses.find((g) => g.gate === "G_PM_6_AUTOMATION_THROTTLE");
    expect(g6?.status).toBe("fail");
    expect(g6?.error).toBe("CallerNotAllowed");
  });

  it("G-PM-6 pass when KEEPER_PERMISSIONLESS caller allowed and under throttle (control)", () => {
    const statuses = evaluatePostMatrixGates({
      g6: {
        executionKind: "KEEPER_PERMISSIONLESS",
        failedAttemptsInWindow: 0,
        maxFailedAttemptsPerWindow: 5,
        callerAllowed: true,
      },
    });
    const g6 = statuses.find((g) => g.gate === "G_PM_6_AUTOMATION_THROTTLE");
    expect(g6?.status).toBe("pass");
  });
});

// Suppress unused-import for asBlockNumber when we don't reference it
// directly in this file (kept for future test extensions).
void asBlockNumber;
