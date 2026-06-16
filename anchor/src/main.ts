import { createPublicClient, fallback, http, type Hex, type PublicClient } from "viem";
import type { Logger } from "pino";
import type { AnchorConfig } from "./config.js";
import { IndexerClient } from "./indexer-client.js";
import { computeManifestHash, manifestInputFrom } from "./manifest/computer.js";
import { decideSubmit, readAnchorCadenceFromRegistry } from "./submitter/cadence.js";
import { submitStateSnapshot } from "./submitter/tx.js";

export interface AnchorService {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function buildAnchorService(args: {
  config: AnchorConfig;
  logger: Logger;
}): AnchorService {
  const { config, logger } = args;
  const indexer = new IndexerClient(config.indexerApiUrl);
  const transports = [http(config.rpcUrl), ...config.rpcFallbackUrls.map((url) => http(url))];
  const publicClient: PublicClient = createPublicClient({
    transport: transports.length > 1 ? fallback(transports) : transports[0]!,
  });

  let stopped = false;
  let pollHandle: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> | null = null;
  let cachedCadence: bigint | null = null;

  const tick = async (): Promise<void> => {
    try {
      if (stopped) return;
      const snapshot = await indexer.fetchSnapshot();
      const currentBlock = await publicClient.getBlockNumber();
      const cadence =
        config.cadenceBlocksOverride ??
        (cachedCadence ??
          (cachedCadence = await readAnchorCadenceFromRegistry(
            publicClient,
            config.registryAddress as Hex,
          )));

      const decision = decideSubmit({
        currentBlock,
        lastSubmittedAnchorBlock: snapshot.latestSnapshot?.anchorBlock ?? null,
        cadenceBlocks: cadence,
        minIndexerLagBlocks: config.minIndexerLagBlocks,
        indexedBlock: snapshot.head.lastIndexedBlock,
      });

      if (!decision.shouldSubmit) {
        logger.debug(
          {
            reason: decision.reason,
            indexed: snapshot.head.lastIndexedBlock.toString(),
            current: currentBlock.toString(),
          },
          "skipping anchor submission",
        );
        return;
      }

      const manifestInput = manifestInputFrom(snapshot, config.chainId);
      const manifestHash = computeManifestHash(manifestInput);
      logger.info(
        {
          anchorBlock: decision.candidateAnchorBlock.toString(),
          manifestHash,
          registryVersion: manifestInput.registryVersion.toString(),
        },
        "submitting state snapshot",
      );

      const result = await submitStateSnapshot({
        config,
        publicClient,
        blockNumber: decision.candidateAnchorBlock,
        manifestHash,
      });
      logger.info(
        { txHash: result.txHash, status: result.status },
        "state snapshot submission complete",
      );
    } catch (err) {
      logger.error({ err }, "anchor tick failed");
    }
  };

  return {
    async start() {
      const loop = async () => {
        if (stopped) return;
        if (inFlight) return;
        inFlight = tick().finally(() => {
          inFlight = null;
        });
        await inFlight;
      };
      await loop();
      pollHandle = setInterval(() => {
        void loop();
      }, config.pollIntervalMs);
    },
    async stop() {
      stopped = true;
      if (pollHandle) clearInterval(pollHandle);
      if (inFlight) await inFlight.catch(() => undefined);
    },
  };
}
