import {
  createPublicClient,
  fallback,
  http,
  type Hex,
  type PublicClient,
  type GetLogsReturnType,
  type Log,
} from "viem";
import type { IndexerConfig } from "../config.js";

export function buildPublicClient(config: IndexerConfig): PublicClient {
  const transports = [http(config.rpcUrl), ...config.rpcFallbackUrls.map((url) => http(url))];
  return createPublicClient({
    transport: transports.length > 1 ? fallback(transports) : transports[0]!,
  });
}

export interface BlockHead {
  number: bigint;
  hash: Hex;
  parentHash: Hex;
  timestamp: bigint;
}

export async function readBlock(client: PublicClient, blockNumber: bigint): Promise<BlockHead> {
  const block = await client.getBlock({ blockNumber, includeTransactions: false });
  return {
    number: block.number!,
    hash: block.hash!,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
  };
}

export async function readLatestSafeBlock(
  client: PublicClient,
  confirmations: number,
): Promise<BlockHead> {
  const tip = await client.getBlockNumber();
  const safe = tip > BigInt(confirmations) ? tip - BigInt(confirmations) : 0n;
  return readBlock(client, safe);
}

export async function fetchLogsInRange(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  contracts: Hex[],
): Promise<Log[]> {
  if (contracts.length === 0) return [];
  return client.getLogs({ address: contracts, fromBlock, toBlock }) as Promise<
    GetLogsReturnType<undefined, undefined, false, bigint, bigint>
  >;
}
