import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import type { AppConfig, Hex } from "../types/domain.js";
import type { BackfillClient, BackfillLog } from "../metrics/backfill.js";
import { selectBestRpcEndpoint } from "./rpc.js";

export async function createViemBackfillClient(config: AppConfig): Promise<BackfillClient | null> {
  if (config.rpc.primaryUrl === null && config.rpc.fallbackUrls.length === 0) {
    return null;
  }
  const selection = await selectBestRpcEndpoint(config);
  const client = createPublicClient({
    chain: base,
    transport: http(selection.url, { timeout: config.rpc.timeoutMs }),
  });
  return {
    async getLogs(args) {
      const logs = await client.getLogs({
        address: args.address,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
      });
      return logs.flatMap((log) => {
        if (log.blockNumber === null || log.logIndex === null || log.transactionHash === null) {
          return [];
        }
        return [
          {
            address: log.address,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            transactionHash: log.transactionHash,
            topics: [...log.topics] as [] | [Hex, ...Hex[]],
            data: log.data,
          } satisfies BackfillLog,
        ];
      });
    },
    async getBlock(args) {
      return client.getBlock({ blockNumber: args.blockNumber });
    },
  };
}
