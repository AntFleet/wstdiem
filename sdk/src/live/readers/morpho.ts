// Morpho reader — position state + market totals for utilization/health.

import type { PublicClient } from "viem";
import type { Address, MarketId } from "../../types/branded.js";
import { MORPHO_READ_ABI } from "../abis.js";

export interface MorphoPositionRaw {
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

export interface MorphoMarketState {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export class MorphoReader {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
  ) {}

  async position(
    market: MarketId,
    owner: Address,
    blockNumber?: bigint,
  ): Promise<MorphoPositionRaw> {
    const [supplyShares, borrowShares, collateral] = (await this.client.readContract({
      address: this.address,
      abi: MORPHO_READ_ABI,
      functionName: "position",
      args: [market, owner],
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    })) as unknown as readonly [bigint, bigint, bigint];
    return { supplyShares, borrowShares, collateral };
  }

  async market(market: MarketId, blockNumber?: bigint): Promise<MorphoMarketState> {
    const [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ] = (await this.client.readContract({
      address: this.address,
      abi: MORPHO_READ_ABI,
      functionName: "market",
      args: [market],
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    })) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    return {
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    };
  }
}
