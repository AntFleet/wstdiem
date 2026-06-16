// useReadiness — wraps sdk.getReadiness with fail-closed defaults.
//
// On RpcQuorumNotIndependent (G-PM-3 fail), the hook surfaces `quorumDegraded`
// so the chrome banner shows the right reason and signing flows refuse to
// arm. On indexer 5xx or network error, the hook surfaces `error` and the
// caller MUST treat the result as "unknown" — never as "all green."

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Address, MarketId, ReadinessResult } from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

interface UseReadinessArgs {
  market: MarketId | undefined;
  owner?: Address;
  /** Override polling interval (ms). Default 12_000 (≈ Base block time). */
  refetchInterval?: number;
}

export function useReadiness(
  args: UseReadinessArgs,
): UseQueryResult<ReadinessResult, Error> {
  const { sdk } = useSdk();
  return useQuery<ReadinessResult, Error>({
    queryKey: [
      "readiness",
      args.market ?? "no-market",
      args.owner ?? "no-owner",
    ],
    queryFn: async () => {
      if (!args.market) throw new Error("useReadiness: market required");
      return args.owner
        ? sdk.getReadiness(args.market, args.owner)
        : sdk.getReadiness(args.market);
    },
    enabled: Boolean(args.market),
    refetchInterval: args.refetchInterval ?? 12_000,
    // Fail-closed: do NOT auto-retry on quorum-degraded errors. The user must
    // resolve the RPC config before signing.
    retry: false,
  });
}
