import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { erc20TransferEventAbi } from "../src/abi/erc20.js";
import { feeRouterHarvestEventAbis } from "../src/abi/feeRouter.js";
import {
  REORG_SAFETY_OVERLAP_BLOCKS,
  backfillCreditAndHarvestEvents,
  type BackfillBlock,
  type BackfillClient,
  type BackfillLog,
  type BackfillStorage,
} from "../src/metrics/backfill.js";
import { WAD } from "../src/metrics/math.js";
import type { Address, AppConfig, Hex, StoredCreditEvent, StoredHarvestEvent } from "../src/types/domain.js";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";

const DIEM = "0x0000000000000000000000000000000000000001";
const FEE_ROUTER = "0x0000000000000000000000000000000000000002";
const INFERENCE_VAULT = "0x0000000000000000000000000000000000000003";
const OTHER = "0x0000000000000000000000000000000000000004";

class MemoryBackfillStorage implements BackfillStorage {
  readonly meta = new Map<string, string>();
  readonly creditEvents: StoredCreditEvent[] = [];
  readonly harvestEvents: StoredHarvestEvent[] = [];

  getMeta(key: string): string | null {
    return this.meta.get(key) ?? null;
  }

  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
  }

  insertCreditEvent(event: StoredCreditEvent): void {
    this.creditEvents.push(event);
  }

  insertHarvestEvent(event: StoredHarvestEvent): void {
    this.harvestEvents.push(event);
  }
}

class MemoryBackfillClient implements BackfillClient {
  constructor(
    private readonly logs: BackfillLog[],
    private readonly timestamps: Record<string, number>,
  ) {}

  async getLogs(args: { address: Address; fromBlock: bigint; toBlock: bigint }): Promise<BackfillLog[]> {
    return this.logs.filter(
      (log) =>
        log.address.toLowerCase() === args.address.toLowerCase() &&
        log.blockNumber >= args.fromBlock &&
        log.blockNumber <= args.toBlock,
    );
  }

  async getBlock(args: { blockNumber: bigint }): Promise<BackfillBlock> {
    return { timestamp: this.timestamps[args.blockNumber.toString()] ?? Number(args.blockNumber) };
  }
}

function completeConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    contracts: {
      ...DEFAULT_CONFIG.contracts,
      diem: DIEM,
      feeRouter: FEE_ROUTER,
      inferenceVault: INFERENCE_VAULT,
    },
  };
}

function transferLog(args: {
  from: Address;
  to: Address;
  value: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
}): BackfillLog {
  return {
    address: DIEM,
    blockNumber: args.blockNumber,
    logIndex: args.logIndex,
    transactionHash: args.txHash,
    topics: encodeEventTopics({
      abi: [erc20TransferEventAbi],
      eventName: "Transfer",
      args: { from: args.from, to: args.to },
    }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: "uint256" }], [args.value]),
  };
}

function vvvHarvestLog(args: {
  vvvIn: bigint;
  diemCredited: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
}): BackfillLog {
  return {
    address: FEE_ROUTER,
    blockNumber: args.blockNumber,
    logIndex: args.logIndex,
    transactionHash: args.txHash,
    topics: encodeEventTopics({
      abi: feeRouterHarvestEventAbis,
      eventName: "VVVHarvested",
    }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [args.vvvIn, args.diemCredited]),
  };
}

describe("credit and harvest event backfill", () => {
  it("persists FeeRouter DIEM transfer credits and VVV harvest credits", async () => {
    const storage = new MemoryBackfillStorage();
    const client = new MemoryBackfillClient(
      [
        transferLog({
          from: FEE_ROUTER,
          to: INFERENCE_VAULT,
          value: 5n * WAD,
          blockNumber: 100n,
          logIndex: 1,
          txHash: "0xaaa",
        }),
        transferLog({
          from: OTHER,
          to: INFERENCE_VAULT,
          value: 99n * WAD,
          blockNumber: 101n,
          logIndex: 2,
          txHash: "0xaab",
        }),
        vvvHarvestLog({
          vvvIn: 3n * WAD,
          diemCredited: 7n * WAD,
          blockNumber: 102n,
          logIndex: 3,
          txHash: "0xaac",
        }),
      ],
      { "100": 1_700_000_100, "102": 1_700_000_102 },
    );

    const result = await backfillCreditAndHarvestEvents({
      config: completeConfig(),
      client,
      storage,
      finalizedBlock: 120n,
      fromBlock: 90n,
    });

    expect(result).toMatchObject({
      fromBlock: 90n,
      toBlock: 120n,
      creditEvents: 2,
      harvestEvents: 1,
      readiness: [],
    });
    expect(storage.creditEvents).toEqual([
      {
        txHash: "0xaaa",
        logIndex: 1,
        blockNumber: 100n,
        timestamp: 1_700_000_100,
        source: "diem-transfer",
        amountDiem: 5n * WAD,
      },
      {
        txHash: "0xaac",
        logIndex: 3,
        blockNumber: 102n,
        timestamp: 1_700_000_102,
        source: "vvv-harvest",
        amountDiem: 7n * WAD,
      },
    ]);
    expect(storage.harvestEvents).toEqual([
      {
        txHash: "0xaac",
        logIndex: 3,
        blockNumber: 102n,
        timestamp: 1_700_000_102,
        eventName: "VVVHarvested",
        tokenIn: "VVV",
        amountIn: 3n * WAD,
        amountOut: 7n * WAD,
      },
    ]);
    expect(storage.getMeta("lastProcessedBlock")).toBe("120");
  });

  it("replays a short overlap from the saved cursor for reorg safety", async () => {
    const storage = new MemoryBackfillStorage();
    storage.setMeta("lastProcessedBlock", "200");

    const result = await backfillCreditAndHarvestEvents({
      config: completeConfig(),
      client: new MemoryBackfillClient([], {}),
      storage,
      finalizedBlock: 250n,
    });

    expect(result.fromBlock).toBe(200n - REORG_SAFETY_OVERLAP_BLOCKS);
    expect(result.toBlock).toBe(250n);
    expect(storage.getMeta("lastProcessedBlock")).toBe("250");
  });

  it("does not advance the cursor when deployment addresses are missing", async () => {
    const storage = new MemoryBackfillStorage();
    const config = completeConfig();
    config.contracts.feeRouter = null;

    const result = await backfillCreditAndHarvestEvents({
      config,
      client: new MemoryBackfillClient([], {}),
      storage,
      finalizedBlock: 250n,
    });

    expect(result.creditEvents).toBe(0);
    expect(result.harvestEvents).toBe(0);
    expect(result.readiness).toEqual(["feeRouter and inferenceVault are required for credit event backfill"]);
    expect(storage.getMeta("lastProcessedBlock")).toBeNull();
  });

  it("ignores corrupt cursor metadata instead of failing watch backfill", async () => {
    const storage = new MemoryBackfillStorage();
    storage.setMeta("lastProcessedBlock", "not-a-block");

    const result = await backfillCreditAndHarvestEvents({
      config: completeConfig(),
      client: new MemoryBackfillClient([], {}),
      storage,
      finalizedBlock: 250n,
    });

    expect(result.fromBlock).toBe(250n);
    expect(result.readiness).toEqual(["invalid lastProcessedBlock cursor ignored: not-a-block"]);
    expect(storage.getMeta("lastProcessedBlock")).toBe("250");
  });
});
