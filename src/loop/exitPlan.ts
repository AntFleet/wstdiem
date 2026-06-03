import { morphoAbi } from "../abi/morpho.js";
import { buildConfiguredMarketParams } from "./params.js";
import { computeBorrowedDiem } from "../metrics/math.js";
import type { Address, AppConfig } from "../types/domain.js";
import type { LoopExitParams, RouteSlippageEvidence } from "./types.js";
import { parseMorphoMarket, parseMorphoPosition, type LoopPreflightClient } from "./preflight.js";
import { quoteCurveExitRoute, type CurveExitRouteQuote, type RouteQuoteClient } from "./routeQuote.js";

export interface LiveExitPlanResult {
  params: LoopExitParams | null;
  routeQuote?: CurveExitRouteQuote;
  routeSlippage?: RouteSlippageEvidence;
  readiness: string[];
}

export async function buildLiveLoopExitPlan(input: {
  config: AppConfig;
  owner: Address | null;
  preflightClient: LoopPreflightClient;
  routeQuoteClient: RouteQuoteClient;
  slippageBps: number;
  force?: boolean;
  nowSeconds?: number;
}): Promise<LiveExitPlanResult> {
  const readiness: string[] = [];
  const marketParams = buildConfiguredMarketParams(input.config);
  if (input.owner === null) {
    return { params: null, readiness: ["owner is required to build live exit params"] };
  }
  if (input.config.morpho.marketId === null || marketParams === null) {
    return {
      params: null,
      readiness: ["marketId, inferenceVault, and morphoOracle are required to build live exit params"],
    };
  }

  const market = parseMorphoMarket(
    await input.preflightClient.readContract({
      address: input.config.contracts.morphoBlue,
      abi: morphoAbi,
      functionName: "market",
      args: [input.config.morpho.marketId],
    }),
  );
  if (market === null) {
    return { params: null, readiness: ["Morpho market returned an unsupported shape for live exit params"] };
  }

  const position = parseMorphoPosition(
    await input.preflightClient.readContract({
      address: input.config.contracts.morphoBlue,
      abi: morphoAbi,
      functionName: "position",
      args: [input.config.morpho.marketId, input.owner],
    }),
  );
  if (position === null) {
    return { params: null, readiness: ["Morpho position returned an unsupported shape for live exit params"] };
  }
  if (position.collateral <= 0n) {
    return { params: null, readiness: ["position collateral is zero; live exit params are unavailable"] };
  }

  const repayAmountDiem = computeBorrowedDiem(market, { borrowShares: position.borrowShares });
  if (repayAmountDiem <= 0n) {
    return { params: null, readiness: ["position borrowed DIEM is zero; live exit params are unavailable"] };
  }

  const quoteResult = await quoteCurveExitRoute({
    config: input.config,
    client: input.routeQuoteClient,
    wstDiemIn: position.collateral,
    slippageBps: input.slippageBps,
  });
  readiness.push(...quoteResult.readiness);
  if (quoteResult.quote === undefined || quoteResult.evidence === undefined) {
    return { params: null, readiness };
  }
  if (!input.force && !quoteResult.evidence.valid) {
    readiness.push("Curve exit route price impact exceeds configured cap; use force only after external review");
    return {
      params: null,
      routeQuote: quoteResult.quote,
      routeSlippage: quoteResult.evidence,
      readiness,
    };
  }

  const deadline =
    BigInt(input.nowSeconds ?? Math.floor(Date.now() / 1000)) +
    BigInt(input.config.execution.transactionDeadlineSeconds);
  return {
    params: {
      owner: input.owner,
      marketParams,
      repayAmountDiem,
      maxWstDiemToSell: position.collateral,
      minDiemOut: quoteResult.quote.minDiemOut,
      force: input.force ?? false,
      deadline,
    },
    routeQuote: quoteResult.quote,
    routeSlippage: quoteResult.evidence,
    readiness,
  };
}
