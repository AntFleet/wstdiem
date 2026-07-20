import type { Logger } from "pino";
import type { Hex } from "viem";
import type { IndexerConfig } from "./config.js";
import type { DB } from "./db/client.js";
import { buildPublicClient, fetchLogsInRange, readBlock, readLatestSafeBlock } from "./rpc/client.js";
import { decodeLog } from "./events/decoder.js";
import { applyEvent, type Repositories } from "./events/handlers.js";
import {
  ActionStepRepository,
  AnchorSnapshotRepository,
  BlockRepository,
  HeadRepository,
  PolicyRepository,
  RegistryCommitRepository,
  RoleRotationRepository,
} from "./state/repositories.js";
import { detectReorg, rollback } from "./reorg/detector.js";

export interface IndexerHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getHead: () => bigint | null;
}

export interface BuildArgs {
  config: IndexerConfig;
  db: DB;
  logger: Logger;
  signal?: AbortSignal;
}

export function buildIndexer(args: BuildArgs): IndexerHandle {
  const { config, db, logger } = args;
  const client = buildPublicClient(config);
  const heads = new HeadRepository(db);
  const blocks = new BlockRepository(db);
  const actionSteps = new ActionStepRepository(db);
  const policies = new PolicyRepository(db);
  const registryCommits = new RegistryCommitRepository(db);
  const anchorSnapshots = new AnchorSnapshotRepository(db);
  const roleRotations = new RoleRotationRepository(db);
  const repos: Repositories = {
    actionSteps,
    policies,
    registryCommits,
    anchorSnapshots,
    roleRotations,
  };

  // EIP-170 Phase 3: `contracts.fingerprintRegistry` is optional; drop any
  // undefined entry so the RPC log filter never receives a bad address.
  const contractAddresses = Object.values(config.contracts)
    .filter((a): a is string => typeof a === "string")
    .map((a) => a as Hex);

  let stopped = false;
  let pollHandle: NodeJS.Timeout | null = null;
  let runningTick: Promise<void> | null = null;

  const tick = async (): Promise<void> => {
    try {
      if (stopped) return;
      const safe = await readLatestSafeBlock(client, config.confirmationBlocks);
      const headState = heads.get();
      const cursor = headState ? headState.lastIndexedBlock + 1n : config.startBlock;

      if (headState) {
        const reorg = await detectReorg({
          client,
          blocks,
          head: heads,
          reorgDepth: config.reorgDepth,
        });
        if (reorg) {
          logger.warn(
            { detectedAt: reorg.detectedAt, commonAncestor: reorg.commonAncestor },
            "chain reorg detected; rolling back",
          );
          rollback({
            rollback: reorg,
            blocks,
            actionSteps,
            policies,
            registryCommits,
            anchorSnapshots,
            roleRotations,
            head: heads,
          });
          return;
        }
      }

      if (cursor > safe.number) return;
      const upper = cursor + 999n < safe.number ? cursor + 999n : safe.number;
      logger.debug({ from: cursor, to: upper }, "fetching logs");
      const logs = await fetchLogsInRange(client, cursor, upper, contractAddresses);

      // Walk blocks in order, indexing each block's logs in its own DB transaction
      // so a mid-range failure does not leave a half-written range.
      let lastBlock = headState?.lastIndexedBlock ?? config.startBlock - 1n;
      let lastHash: Hex =
        headState?.lastIndexedBlockHash ??
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      for (let blockNumber = cursor; blockNumber <= upper; blockNumber += 1n) {
        const block = await readBlock(client, blockNumber);
        const tx = db.transaction(() => {
          blocks.upsert({
            number: block.number,
            hash: block.hash,
            parentHash: block.parentHash,
            timestamp: block.timestamp,
          });
          const blockLogs = logs.filter((l) => l.blockNumber === blockNumber);
          for (const log of blockLogs) {
            const decoded = decodeLog(log);
            if (!decoded) continue;
            applyEvent(decoded, { blockNumber: block.number, blockHash: block.hash }, repos);
          }
          heads.set({ lastIndexedBlock: block.number, lastIndexedBlockHash: block.hash });
        });
        tx();
        lastBlock = block.number;
        lastHash = block.hash;
      }

      logger.info({ head: lastBlock, headHash: lastHash }, "advanced head");
    } catch (err) {
      logger.error({ err }, "tick failed");
    }
  };

  return {
    async start() {
      const loop = async () => {
        if (stopped) return;
        if (runningTick) return;
        runningTick = tick().finally(() => {
          runningTick = null;
        });
        await runningTick;
      };
      await loop();
      pollHandle = setInterval(() => {
        void loop();
      }, config.pollIntervalMs);
    },
    async stop() {
      stopped = true;
      if (pollHandle) clearInterval(pollHandle);
      if (runningTick) await runningTick.catch(() => undefined);
    },
    getHead() {
      const state = heads.get();
      return state?.lastIndexedBlock ?? null;
    },
  };
}
