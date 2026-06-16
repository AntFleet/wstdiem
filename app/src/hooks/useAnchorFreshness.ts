// useAnchorFreshness — wraps sdk.getAnchorFreshness. Used by the header
// indicator showing the indexer anchor age and by the D.5 Evidence Technology
// category row.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AnchorFreshness } from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

export function useAnchorFreshness(): UseQueryResult<AnchorFreshness, Error> {
  const { sdk } = useSdk();
  return useQuery<AnchorFreshness, Error>({
    queryKey: ["anchor-freshness"],
    queryFn: () => sdk.getAnchorFreshness(),
    refetchInterval: 12_000,
    retry: false,
  });
}
