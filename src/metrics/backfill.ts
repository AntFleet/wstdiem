import { decodeEventLog } from "viem";
import { erc20TransferEventAbi } from "../abi/erc20.js";
import { feeRouterHarvestEventAbis } from "../abi/feeRouter.js";
import type { Address, AppConfig, Hex, StoredCreditEvent, StoredHarvestEvent } from "../types/domain.js";

export const REORG_SAFETY_OVERLAP_BLOCKS = 20n;

export interface BackfillLog {
  address: Address;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  topics: [] | [Hex, ...Hex[]];
  data: Hex;
}

export interface BackfillBlock {
  timestamp: bigint | number;
}

export interface BackfillClient {
  getLogs(args: {
    address: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<BackfillLog[]>;
  getBlock(args: { blockNumber: bigint }): Promise<BackfillBlock>;
}

export interface BackfillStorage {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  insertCreditEvent(event: StoredCreditEvent): void;
  insertHarvestEvent(event: StoredHarvestEvent): void;
}

export interface BackfillResult {
  fromBlock: bigint;
  toBlock: bigint;
  creditEvents: number;
  harvestEvents: number;
  readiness: string[];
}

function blockTimestampSeconds(block: BackfillBlock): number {
  return typeof block.timestamp === "bigint" ? Number(block.timestamp) : Number(block.timestamp);
}

async function timestampFor(
  client: BackfillClient,
  cache: Map<bigint, number>,
  blockNumber: bigint,
): Promise<number> {
  const cached = cache.get(blockNumber);
  if (cached !== undefined) {
    return cached;
  }
  const timestamp = blockTimestampSeconds(await client.getBlock({ blockNumber }));
  cache.set(blockNumber, timestamp);
  return timestamp;
}

function decodeTransferCredit(config: AppConfig, log: BackfillLog): { amountDiem: bigint } | null {
  if (config.contracts.feeRouter === null || config.contracts.inferenceVault === null) {
    return null;
  }
  const decoded = decodeEventLog({
    abi: [erc20TransferEventAbi],
    data: log.data,
    topics: log.topics,
    strict: false,
  });
  if (decoded.eventName !== "Transfer") {
    return null;
  }
  const args = decoded.args as { from?: Address; to?: Address; value?: bigint };
  if (
    args.from?.toLowerCase() !== config.contracts.feeRouter.toLowerCase() ||
    args.to?.toLowerCase() !== config.contracts.inferenceVault.toLowerCase() ||
    args.value === undefined
  ) {
    return null;
  }
  return { amountDiem: args.value };
}

function decodeHarvest(log: BackfillLog): {
  event: "WETHHarvested" | "WstDIEMHarvested" | "VVVHarvested";
  tokenIn?: string;
  amountIn?: bigint;
  amountOut?: bigint;
  creditDiem?: bigint;
} | null {
  const decoded = decodeEventLog({
    abi: feeRouterHarvestEventAbis,
    data: log.data,
    topics: log.topics,
    strict: false,
  });
  if (decoded.eventName === "WETHHarvested") {
    const args = decoded.args as { wethIn?: bigint; wstDIEMOut?: bigint };
    return {
      event: "WETHHarvested",
      tokenIn: "WETH",
      amountIn: args.wethIn,
      amountOut: args.wstDIEMOut,
    };
  }
  if (decoded.eventName === "WstDIEMHarvested") {
    const args = decoded.args as { amount?: bigint };
    return {
      event: "WstDIEMHarvested",
      tokenIn: "wstDIEM",
      amountIn: args.amount,
    };
  }
  if (decoded.eventName === "VVVHarvested") {
    const args = decoded.args as { vvvIn?: bigint; diemCredited?: bigint };
    return {
      event: "VVVHarvested",
      tokenIn: "VVV",
      amountIn: args.vvvIn,
      amountOut: args.diemCredited,
      creditDiem: args.diemCredited,
    };
  }
  return null;
}

export async function backfillCreditAndHarvestEvents(input: {
  config: AppConfig;
  client: BackfillClient;
  storage: BackfillStorage;
  finalizedBlock: bigint;
  fromBlock?: bigint;
}): Promise<BackfillResult> {
  const readiness: string[] = [];
  if (input.config.contracts.feeRouter === null || input.config.contracts.inferenceVault === null) {
    return {
      fromBlock: 0n,
      toBlock: input.finalizedBlock,
      creditEvents: 0,
      harvestEvents: 0,
      readiness: ["feeRouter and inferenceVault are required for credit event backfill"],
    };
  }

  const lastProcessed = input.storage.getMeta("lastProcessedBlock");
  let lastProcessedBlock: bigint | null = null;
  if (lastProcessed !== null) {
    try {
      lastProcessedBlock = BigInt(lastProcessed);
    } catch {
      readiness.push(`invalid lastProcessedBlock cursor ignored: ${lastProcessed}`);
    }
  }
  const cursor =
    input.fromBlock ??
    (lastProcessedBlock === null
      ? input.finalizedBlock
      : lastProcessedBlock > REORG_SAFETY_OVERLAP_BLOCKS
        ? lastProcessedBlock - REORG_SAFETY_OVERLAP_BLOCKS
        : 0n);
  const fromBlock = cursor > input.finalizedBlock ? input.finalizedBlock : cursor;
  const toBlock = input.finalizedBlock;
  const timestamps = new Map<bigint, number>();
  let creditEvents = 0;
  let harvestEvents = 0;

  const transferLogs = await input.client.getLogs({
    address: input.config.contracts.diem,
    fromBlock,
    toBlock,
  });
  for (const log of transferLogs) {
    try {
      const credit = decodeTransferCredit(input.config, log);
      if (credit === null) {
        continue;
      }
      input.storage.insertCreditEvent({
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        timestamp: await timestampFor(input.client, timestamps, log.blockNumber),
        source: "diem-transfer",
        amountDiem: credit.amountDiem,
      });
      creditEvents += 1;
    } catch {
      continue;
    }
  }

  const harvestLogs = await input.client.getLogs({
    address: input.config.contracts.feeRouter,
    fromBlock,
    toBlock,
  });
  for (const log of harvestLogs) {
    try {
      const harvest = decodeHarvest(log);
      if (harvest === null) {
        continue;
      }
      const timestamp = await timestampFor(input.client, timestamps, log.blockNumber);
      input.storage.insertHarvestEvent({
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        timestamp,
        eventName: harvest.event,
        tokenIn: harvest.tokenIn,
        amountIn: harvest.amountIn,
        amountOut: harvest.amountOut,
      });
      harvestEvents += 1;
      if (harvest.creditDiem !== undefined) {
        input.storage.insertCreditEvent({
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          timestamp,
          source: "vvv-harvest",
          amountDiem: harvest.creditDiem,
        });
        creditEvents += 1;
      }
    } catch {
      continue;
    }
  }

  input.storage.setMeta("lastProcessedBlock", toBlock.toString());
  return { fromBlock, toBlock, creditEvents, harvestEvents, readiness };
}
