import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { buildLiveLoopExitPlan } from "../src/loop/exitPlan.js";
import type { LoopPreflightClient } from "../src/loop/preflight.js";
import type { RouteQuoteClient } from "../src/loop/routeQuote.js";
import { WAD } from "../src/metrics/math.js";
import type { Address, AppConfig, Hex } from "../src/types/domain.js";

const owner = "0x0000000000000000000000000000000000000009" as const;

function completeConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    rpc: {
      ...DEFAULT_CONFIG.rpc,
      primaryUrl: "https://base.example.invalid",
    },
    contracts: {
      ...DEFAULT_CONFIG.contracts,
      inferenceVault: "0x0000000000000000000000000000000000000001",
      curvePool: "0x0000000000000000000000000000000000000002",
      morphoOracle: "0x0000000000000000000000000000000000000003",
      loopExecutor: "0x0000000000000000000000000000000000000004",
    },
    morpho: {
      ...DEFAULT_CONFIG.morpho,
      marketId: `0x${"11".repeat(32)}` as Hex,
    },
    position: { owner },
  };
}

class MockExitPlanClient implements LoopPreflightClient, RouteQuoteClient {
  constructor(
    private readonly options: {
      blockNumber?: bigint;
      chainId?: number;
      collateral?: bigint;
      borrowShares?: bigint;
      totalBorrowAssets?: bigint;
      totalBorrowShares?: bigint;
      expectedDiemOutAtNav?: bigint;
      quotedDiemOut?: bigint;
    } = {},
  ) {}

  async getBlockNumber(): Promise<bigint> {
    return this.options.blockNumber ?? 321n;
  }

  async getChainId(): Promise<number> {
    return this.options.chainId ?? 8453;
  }

  async getCode(_address: Address): Promise<Hex> {
    return "0x01";
  }

  async readContract(args: { functionName: string; blockNumber?: bigint }): Promise<unknown> {
    if (args.functionName === "market") {
      return [
        1_000n * WAD,
        1_000n * WAD,
        this.options.totalBorrowAssets ?? 200n * WAD,
        this.options.totalBorrowShares ?? 200n * WAD,
        0n,
        0n,
      ];
    }
    if (args.functionName === "position") {
      return [0n, this.options.borrowShares ?? 50n * WAD, this.options.collateral ?? 100n * WAD];
    }
    if (args.functionName === "convertToAssets") {
      return this.options.expectedDiemOutAtNav ?? 100n * WAD;
    }
    if (args.functionName === "get_dy") {
      return this.options.quotedDiemOut ?? 99n * WAD;
    }
    throw new Error(`unexpected readContract ${args.functionName}`);
  }
}

describe("live exit plan builder", () => {
  it("builds exact LoopExitParams from Morpho debt, collateral, and Curve quote", async () => {
    const client = new MockExitPlanClient();
    const result = await buildLiveLoopExitPlan({
      config: completeConfig(),
      owner,
      preflightClient: client,
      routeQuoteClient: client,
      slippageBps: 50,
      nowSeconds: 1_000,
    });

    expect(result.readiness).toEqual([]);
    expect(result.params).toMatchObject({
      owner,
      repayAmountDiem: 50n * WAD,
      maxWstDiemToSell: 100n * WAD,
      minDiemOut: (99n * WAD * 9_950n) / 10_000n,
      force: false,
      deadline: 1_300n,
    });
    expect(result.routeSlippage).toMatchObject({
      source: "route-quote",
      action: "exit",
      priceImpactBps: 100,
      protectedMinOut: (99n * WAD * 9_950n) / 10_000n,
      valid: true,
    });
  });

  it("does not build exit params for zero debt or zero collateral", async () => {
    const zeroDebt = await buildLiveLoopExitPlan({
      config: completeConfig(),
      owner,
      preflightClient: new MockExitPlanClient({ borrowShares: 0n }),
      routeQuoteClient: new MockExitPlanClient(),
      slippageBps: 50,
    });
    const zeroCollateral = await buildLiveLoopExitPlan({
      config: completeConfig(),
      owner,
      preflightClient: new MockExitPlanClient({ collateral: 0n }),
      routeQuoteClient: new MockExitPlanClient(),
      slippageBps: 50,
    });

    expect(zeroDebt.params).toBeNull();
    expect(zeroDebt.readiness).toEqual(["position borrowed DIEM is zero; live exit params are unavailable"]);
    expect(zeroCollateral.params).toBeNull();
    expect(zeroCollateral.readiness).toEqual(["position collateral is zero; live exit params are unavailable"]);
  });

  it("blocks unsafe Curve impact unless force is explicit", async () => {
    const preflightClient = new MockExitPlanClient({ quotedDiemOut: 98n * WAD });
    const routeQuoteClient = new MockExitPlanClient({ quotedDiemOut: 98n * WAD });
    const blocked = await buildLiveLoopExitPlan({
      config: completeConfig(),
      owner,
      preflightClient,
      routeQuoteClient,
      slippageBps: 50,
    });
    const forced = await buildLiveLoopExitPlan({
      config: completeConfig(),
      owner,
      preflightClient,
      routeQuoteClient,
      slippageBps: 50,
      force: true,
    });

    expect(blocked.params).toBeNull();
    expect(blocked.routeSlippage?.valid).toBe(false);
    expect(blocked.readiness).toEqual([
      "Curve exit route price impact exceeds configured cap; use force only after external review",
    ]);
    expect(forced.params?.force).toBe(true);
    expect(forced.routeSlippage?.valid).toBe(false);
  });

  it("blocks exit params when protected Curve output cannot cover Morpho repay", async () => {
    const client = new MockExitPlanClient({
      totalBorrowAssets: 300n * WAD,
      totalBorrowShares: 100n * WAD,
      borrowShares: 50n * WAD,
      quotedDiemOut: 100n * WAD,
    });

    const result = await buildLiveLoopExitPlan({
      config: completeConfig(),
      owner,
      preflightClient: client,
      routeQuoteClient: client,
      slippageBps: 50,
    });

    expect(result.params).toBeNull();
    expect(result.routeQuote?.minDiemOut).toBe((100n * WAD * 9_950n) / 10_000n);
    expect(result.readiness).toEqual(["Curve exit route minDiemOut does not cover Morpho repay amount"]);
  });
});
