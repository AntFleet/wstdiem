// usePositions — wraps sdk.getPositionRisk for the active owner+market.
//
// Phase 4 uses query-polling (12s interval). Phase 5 may upgrade to
// sdk.subscribePosition for push updates.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Address, MarketId, PositionRisk } from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

interface UsePositionsArgs {
  market: MarketId | undefined;
  owner: Address | undefined;
}

export function usePositions(
  args: UsePositionsArgs,
): UseQueryResult<PositionRisk, Error> {
  const { sdk } = useSdk();
  return useQuery<PositionRisk, Error>({
    queryKey: [
      "position-risk",
      args.market ?? "no-market",
      args.owner ?? "no-owner",
    ],
    queryFn: async () => {
      if (!args.market || !args.owner) {
        throw new Error("usePositions: market + owner required");
      }
      return sdk.getPositionRisk(args.market, args.owner);
    },
    enabled: Boolean(args.market && args.owner),
    refetchInterval: 12_000,
    retry: false,
  });
}
