import { inferenceVaultAbi } from "../abi/inferenceVault.js";
import type { Address, AppConfig, MetricSnapshot } from "../types/domain.js";
import { WAD, computeNav, formatWad, makeEmptySnapshot } from "./math.js";

export interface MetricsReadClient {
  readContract(args: {
    address: Address;
    abi: unknown;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
}

export interface MetricsCollectionResult {
  snapshot: MetricSnapshot;
  readiness: string[];
}

export async function collectVaultMetrics(
  config: AppConfig,
  client: MetricsReadClient,
  baseSnapshot: MetricSnapshot = makeEmptySnapshot(),
): Promise<MetricsCollectionResult> {
  if (config.contracts.inferenceVault === null) {
    return {
      snapshot: baseSnapshot,
      readiness: ["missing inferenceVault; vault metrics unavailable"],
    };
  }

  const asset = (await client.readContract({
    address: config.contracts.inferenceVault,
    abi: inferenceVaultAbi,
    functionName: "asset",
  })) as Address;
  if (asset.toLowerCase() !== config.contracts.diem.toLowerCase()) {
    return {
      snapshot: baseSnapshot,
      readiness: [`vault.asset() ${asset} does not match DIEM ${config.contracts.diem}`],
    };
  }

  const [totalAssets, totalSupply, oneWstDiemAssets] = await Promise.all([
    client.readContract({
      address: config.contracts.inferenceVault,
      abi: inferenceVaultAbi,
      functionName: "totalAssets",
    }),
    client.readContract({
      address: config.contracts.inferenceVault,
      abi: inferenceVaultAbi,
      functionName: "totalSupply",
    }),
    client.readContract({
      address: config.contracts.inferenceVault,
      abi: inferenceVaultAbi,
      functionName: "convertToAssets",
      args: [WAD],
    }),
  ]);

  const nav = computeNav(
    BigInt(totalAssets as bigint | number | string),
    BigInt(totalSupply as bigint | number | string),
  );
  const convertToAssetsNav = BigInt(oneWstDiemAssets as bigint | number | string);
  const readiness =
    convertToAssetsNav > 0n && convertToAssetsNav !== nav.nav
      ? ["vault convertToAssets(1e18) differs from totalAssets/totalSupply NAV"]
      : [];
  return {
    snapshot: {
      ...baseSnapshot,
      validity: {
        ...baseSnapshot.validity,
        vault: true,
      },
      nav: nav.nav,
      navDisplay: formatWad(nav.nav),
      navSource: nav.source,
    },
    readiness,
  };
}
