// Live quoting readers — Curve get_dy + Uniswap V3 QuoterV2 simulation.
//
// PR-13 closes the placeholder quoteHash by deriving deterministic quote tuples
// from on-chain reads (Curve get_dy) and quoter simulations (Uniswap V3
// QuoterV2.quoteExactInputSingle). The returned tuple matches the SDK's
// `QuoteRoute` discriminator so it can be fed straight into `hashQuoteRoutes`.

import type { PublicClient } from "viem";
import type { Address } from "../../types/branded.js";
import {
  CURVE_POOL_READ_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
} from "../abis.js";

export interface CurveQuoteRequest {
  pool: Address;
  i: number;
  j: number;
  dx: bigint;
  /** Minimum acceptable dy. The caller derives this from the action's
   * maxSlippageBps + an oracle-derived reference price. */
  minDyOverride?: bigint;
}

export interface CurveQuote {
  pool: Address;
  i: number;
  j: number;
  dx: bigint;
  dyExpected: bigint;
  dyMin: bigint;
}

export class CurveQuoter {
  constructor(private readonly client: PublicClient) {}

  async getDy(req: CurveQuoteRequest, blockNumber?: bigint): Promise<CurveQuote> {
    const dyExpected = (await this.client.readContract({
      address: req.pool,
      abi: CURVE_POOL_READ_ABI,
      functionName: "get_dy" as never,
      args: [req.i, req.j, req.dx] as never,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    })) as bigint;
    const dyMin = req.minDyOverride ?? dyExpected;
    return {
      pool: req.pool,
      i: req.i,
      j: req.j,
      dx: req.dx,
      dyExpected,
      dyMin,
    };
  }
}

export interface UniV3QuoteRequest {
  quoter: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  fee: number;
  /** Default 0 — pool tick limit unconstrained. */
  sqrtPriceLimitX96?: bigint;
}

export interface UniV3Quote {
  pool: Address;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOut: bigint;
  sqrtPriceX96After: bigint;
  fee: number;
}

export class UniswapV3Quoter {
  constructor(private readonly client: PublicClient) {}

  /**
   * Calls QuoterV2.quoteExactInputSingle via eth_call. QuoterV2 is marked
   * non-payable (it reverts to encode the quote result in production); using
   * publicClient.simulateContract reads the return data without state mutation.
   * Returns the tuple expected by the SDK's QuoteRoute discriminator.
   */
  async quoteExactInputSingle(
    req: UniV3QuoteRequest,
    blockNumber?: bigint,
  ): Promise<UniV3Quote> {
    const result = (await this.client.simulateContract({
      address: req.quoter,
      abi: UNISWAP_V3_QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle" as never,
      args: [
        {
          tokenIn: req.tokenIn,
          tokenOut: req.tokenOut,
          amountIn: req.amountIn,
          fee: req.fee,
          sqrtPriceLimitX96: req.sqrtPriceLimitX96 ?? 0n,
        },
      ] as never,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    })) as { result: readonly [bigint, bigint, number, bigint] };
    const [amountOut, sqrtPriceX96After] = result.result;
    return {
      pool: req.quoter,
      zeroForOne: req.tokenIn.toLowerCase() < req.tokenOut.toLowerCase(),
      amountIn: req.amountIn,
      amountOut,
      sqrtPriceX96After,
      fee: req.fee,
    };
  }
}
