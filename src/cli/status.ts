import type { AppConfig } from "../types/domain.js";
import { evaluateAlerts } from "../alerts/evaluate.js";
import { deliverConfiguredAlerts } from "../alerts/deliver.js";
import { missingDeploymentKeys } from "../config/load.js";
import { createViemLoopSimulationClient } from "../contracts/loopSimulationClient.js";
import { readBestRpcBlockStatus } from "../contracts/rpc.js";
import { YIELD_WINDOW_SECONDS, applyYieldWindowMetrics, collectVaultMetrics } from "../metrics/collector.js";
import { makeEmptySnapshot } from "../metrics/math.js";
import { Storage } from "../storage/sqlite.js";

export interface StatusResult {
  snapshot: ReturnType<typeof makeEmptySnapshot>;
  readiness: string[];
  alerts: ReturnType<typeof evaluateAlerts>;
}

export async function buildStatus(config: AppConfig): Promise<StatusResult> {
  const readiness: string[] = [];
  const missing = missingDeploymentKeys(config);
  if (missing.length > 0) {
    readiness.push(`missing deployment config: ${missing.join(", ")}`);
  }
  if (config.rpc.primaryUrl === null && config.rpc.fallbackUrls.length === 0) {
    readiness.push("missing BASE_RPC_URL/rpc.primaryUrl; on-chain status unavailable");
  }

  let snapshot = makeEmptySnapshot();
  if (config.rpc.primaryUrl !== null || config.rpc.fallbackUrls.length > 0) {
    try {
      const blockStatus = await readBestRpcBlockStatus(config);
      if (blockStatus.chainId !== config.chainId) {
        readiness.push(`unexpected chainId ${blockStatus.chainId}; expected ${config.chainId}`);
      }
      snapshot.blockNumber = blockStatus.blockNumber;
      snapshot.latestBlockAgeSeconds = Math.max(0, Math.floor(Date.now() / 1000) - blockStatus.blockTimestamp);
      snapshot.validity.rpcFreshness = blockStatus.chainId === config.chainId;
      if (snapshot.validity.rpcFreshness && config.contracts.inferenceVault !== null) {
        const client = await createViemLoopSimulationClient(config);
        if (client !== null) {
          const vaultMetrics = await collectVaultMetrics(config, client, snapshot);
          snapshot = vaultMetrics.snapshot;
          readiness.push(...vaultMetrics.readiness);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      readiness.push(`RPC read failed: ${message}`);
    }
  }

  const alerts = evaluateAlerts(snapshot, config.thresholds);
  return { snapshot, readiness, alerts };
}

export async function runWatchOnce(config: AppConfig): Promise<StatusResult> {
  let result = await buildStatus(config);
  const storage = new Storage(config.storage.sqlitePath);
  try {
    const windowStart = result.snapshot.timestamp - YIELD_WINDOW_SECONDS;
    const vaultAssetSamples = storage.listVaultAssetSamplesForWindow(windowStart);
    if (result.snapshot.validity.vault) {
      vaultAssetSamples.push({
        timestamp: result.snapshot.timestamp,
        totalAssetsDiem: result.snapshot.vaultTotalAssetsDiem,
      });
    }
    const yieldWindow = applyYieldWindowMetrics({
      config,
      snapshot: result.snapshot,
      creditSamples: storage.listCreditSamplesSince(windowStart),
      vaultAssetSamples,
    });
    result = {
      ...result,
      snapshot: yieldWindow.snapshot,
      readiness: [...result.readiness, ...yieldWindow.readiness],
      alerts: evaluateAlerts(yieldWindow.snapshot, config.thresholds),
    };
    storage.insertMetricSnapshot(result.snapshot);
    for (const alert of result.alerts) {
      const positionAddress = config.position.owner ?? "unknown";
      const dedupeKey = `${config.chainId}:${positionAddress}:${alert.alertKey}:${alert.level}`;
      const lastDeliveredAt = storage.getLastAlertDelivery(dedupeKey);
      const canDeliver =
        lastDeliveredAt === null || result.snapshot.timestamp - lastDeliveredAt >= alert.cooldownSeconds;
      if (!canDeliver) {
        storage.insertAlert(alert, result.snapshot.timestamp, ["suppressed:cooldown"]);
        continue;
      }
      const delivered = await deliverConfiguredAlerts(
        config,
        [alert],
        result.snapshot.blockNumber,
        result.snapshot.timestamp,
      );
      storage.insertAlert(alert, result.snapshot.timestamp, delivered);
      storage.setLastAlertDelivery(dedupeKey, result.snapshot.timestamp);
    }
    storage.setMeta("lastObservedBlock", result.snapshot.blockNumber.toString());
  } finally {
    storage.close();
  }
  return result;
}
