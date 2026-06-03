import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { collectVaultMetrics, type MetricsReadClient } from "../src/metrics/collector.js";
import { makeEmptySnapshot, WAD } from "../src/metrics/math.js";
import type { Address, AppConfig } from "../src/types/domain.js";

function completeConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    contracts: {
      ...DEFAULT_CONFIG.contracts,
      inferenceVault: "0x0000000000000000000000000000000000000001",
    },
  };
}

class MockMetricsClient implements MetricsReadClient {
  constructor(
    private readonly options: {
      asset?: Address;
      totalAssets?: bigint;
      totalSupply?: bigint;
      oneWstDiemAssets?: bigint;
    } = {},
  ) {}

  async readContract(args: { functionName: string }): Promise<unknown> {
    if (args.functionName === "asset") {
      return this.options.asset ?? DEFAULT_CONFIG.contracts.diem;
    }
    if (args.functionName === "totalAssets") {
      return this.options.totalAssets ?? 200n * WAD;
    }
    if (args.functionName === "totalSupply") {
      return this.options.totalSupply ?? 100n * WAD;
    }
    if (args.functionName === "convertToAssets") {
      return this.options.oneWstDiemAssets ?? 2n * WAD;
    }
    throw new Error(`unexpected readContract ${args.functionName}`);
  }
}

describe("metrics collector", () => {
  it("collects vault NAV from totalAssets and totalSupply", async () => {
    const result = await collectVaultMetrics(completeConfig(), new MockMetricsClient(), makeEmptySnapshot(100));
    expect(result.readiness).toEqual([]);
    expect(result.snapshot.validity.vault).toBe(true);
    expect(result.snapshot.nav).toBe(2n * WAD);
    expect(result.snapshot.navDisplay).toBe("2.000000");
    expect(result.snapshot.navSource).toBe("onchain");
    expect(result.snapshot.validity.yieldWindow).toBe(false);
  });

  it("marks an empty vault as valid but empty-source NAV", async () => {
    const result = await collectVaultMetrics(
      completeConfig(),
      new MockMetricsClient({ totalAssets: 0n, totalSupply: 0n, oneWstDiemAssets: WAD }),
      makeEmptySnapshot(100),
    );
    expect(result.snapshot.validity.vault).toBe(true);
    expect(result.snapshot.nav).toBe(WAD);
    expect(result.snapshot.navSource).toBe("empty");
  });

  it("keeps vault metrics invalid when vault asset does not match DIEM", async () => {
    const result = await collectVaultMetrics(
      completeConfig(),
      new MockMetricsClient({ asset: DEFAULT_CONFIG.contracts.weth }),
      makeEmptySnapshot(100),
    );
    expect(result.snapshot.validity.vault).toBe(false);
    expect(result.readiness.join(" ")).toContain("does not match DIEM");
  });

  it("surfaces convertToAssets NAV mismatch as readiness evidence", async () => {
    const result = await collectVaultMetrics(
      completeConfig(),
      new MockMetricsClient({ oneWstDiemAssets: 3n * WAD }),
      makeEmptySnapshot(100),
    );
    expect(result.snapshot.validity.vault).toBe(true);
    expect(result.snapshot.nav).toBe(2n * WAD);
    expect(result.readiness).toContain("vault convertToAssets(1e18) differs from totalAssets/totalSupply NAV");
  });
});
