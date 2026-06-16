// Chainlink price feed + sequencer uptime feed readers.

import type { PublicClient } from "viem";
import type { Address } from "../../types/branded.js";
import { CHAINLINK_AGGREGATOR_V3_ABI } from "../abis.js";
import type { SequencerStatus } from "../../types/evidence.js";

export interface ChainlinkRound {
  roundId: bigint;
  answer: bigint;
  startedAt: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
}

export interface ChainlinkReading extends ChainlinkRound {
  decimals: number;
}

export class ChainlinkReader {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
  ) {}

  async latestRoundData(blockNumber?: bigint): Promise<ChainlinkRound> {
    const [roundId, answer, startedAt, updatedAt, answeredInRound] =
      (await this.client.readContract({
        address: this.address,
        abi: CHAINLINK_AGGREGATOR_V3_ABI,
        functionName: "latestRoundData",
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      })) as unknown as readonly [bigint, bigint, bigint, bigint, bigint];
    return { roundId, answer, startedAt, updatedAt, answeredInRound };
  }

  async decimals(blockNumber?: bigint): Promise<number> {
    const d = (await this.client.readContract({
      address: this.address,
      abi: CHAINLINK_AGGREGATOR_V3_ABI,
      functionName: "decimals",
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    })) as unknown as number;
    return Number(d);
  }

  async read(blockNumber?: bigint): Promise<ChainlinkReading> {
    const [round, decimals] = await Promise.all([
      this.latestRoundData(blockNumber),
      this.decimals(blockNumber),
    ]);
    return { ...round, decimals };
  }

  /**
   * PR-14 audit L-2 closure: read with explicit staleness verification.
   * Throws `OracleStale` when the round is stuck (`answeredInRound < roundId`)
   * or the answer is older than `staleAfterSeconds` relative to `nowSeconds`.
   * The caller supplies `nowSeconds` (typically the on-chain
   * block.timestamp) so client-clock skew cannot mask stale data.
   */
  async readWithStaleness(opts: {
    nowSeconds: number;
    staleAfterSeconds: number;
    blockNumber?: bigint;
  }): Promise<ChainlinkReading> {
    const reading = await this.read(opts.blockNumber);
    // PR-14 audit compliance M-9 closure: fail-closed on a non-positive
    // answer. Chainlink's AggregatorV3Interface CAN return answer<=0 for a
    // misconfigured feed; the caller-side `answer > 0n` filter is the only
    // remaining defense — we promote it here so a corrupt feed never produces
    // a "fresh" reading.
    if (reading.answer <= 0n) {
      const err = new Error(`OracleStale: answer=${reading.answer} (non-positive)`);
      (err as Error & { code: string }).code = "OracleStale";
      throw err;
    }
    if (reading.answeredInRound < reading.roundId) {
      const err = new Error(
        `OracleStale: answeredInRound=${reading.answeredInRound} < roundId=${reading.roundId}`,
      );
      (err as Error & { code: string }).code = "OracleStale";
      throw err;
    }
    const ageSeconds = BigInt(opts.nowSeconds) - reading.updatedAt;
    if (ageSeconds > BigInt(opts.staleAfterSeconds)) {
      const err = new Error(
        `OracleStale: age=${ageSeconds}s exceeds threshold=${opts.staleAfterSeconds}s`,
      );
      (err as Error & { code: string }).code = "OracleStale";
      throw err;
    }
    return reading;
  }
}

/** Sequencer Uptime Feed shares the AggregatorV3Interface; answer is 0 = up,
 * 1 = down. updatedAt + grace window determines whether grace is still active. */
export class SequencerFeedReader {
  private readonly chainlink: ChainlinkReader;

  constructor(client: PublicClient, address: Address) {
    this.chainlink = new ChainlinkReader(client, address);
  }

  async latestRoundData(): Promise<ChainlinkRound> {
    return this.chainlink.latestRoundData();
  }

  /** Classify the sequencer status using the registry-pinned grace window. */
  async status(opts: {
    gracePeriodSeconds: number;
    nowSeconds: number;
  }): Promise<{ status: SequencerStatus; round: ChainlinkRound }> {
    const round = await this.chainlink.latestRoundData();
    if (round.answer === 1n) {
      return { status: "down", round };
    }
    const sinceUp = BigInt(opts.nowSeconds) - round.updatedAt;
    if (sinceUp < BigInt(opts.gracePeriodSeconds)) {
      return { status: "gracePeriod", round };
    }
    return { status: "up", round };
  }
}
