import { decodeEventLog, type Log, type Hex } from "viem";
import { INDEXER_ABI } from "./abi.js";

export interface DecodedEvent {
  eventName: string;
  args: Record<string, unknown>;
  log: Log;
}

/**
 * Decode a raw log against the indexer's ABI. Returns null if topic0 is unknown
 * (the indexer sees every event from subscribed contracts, including ones it
 * does not consume yet -- e.g. AutomationExecuted, ExitFlashBound, etc.).
 */
export function decodeLog(log: Log): DecodedEvent | null {
  try {
    const decoded = decodeEventLog({
      abi: INDEXER_ABI,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    });
    return {
      eventName: decoded.eventName,
      args: decoded.args as Record<string, unknown>,
      log,
    };
  } catch {
    return null;
  }
}
