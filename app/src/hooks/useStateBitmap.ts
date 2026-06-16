// useStateBitmap — wraps sdk.getStateBitmap for the persistent header banner
// and the D.5 grid.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { MarketId, ReadinessResult } from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

interface StateBitmapResult {
  stateBitmap: ReadinessResult["stateBitmap"];
  decisions: ReadinessResult["perAction"];
}

export function useStateBitmap(
  market: MarketId | undefined,
): UseQueryResult<StateBitmapResult, Error> {
  const { sdk } = useSdk();
  return useQuery<StateBitmapResult, Error>({
    queryKey: ["state-bitmap", market ?? "no-market"],
    queryFn: async () => {
      if (!market) throw new Error("useStateBitmap: market required");
      return sdk.getStateBitmap(market);
    },
    enabled: Boolean(market),
    refetchInterval: 12_000,
    retry: false,
  });
}
