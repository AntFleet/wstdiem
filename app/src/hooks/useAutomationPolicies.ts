// useAutomationPolicies — wraps sdk.getAutomationPolicies(owner, market?).
//
// SDK boundary discipline: this is the ONLY consumer of
// getAutomationPolicies — the screens import from here.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Address, MarketId, Policy } from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

interface UseAutomationPoliciesArgs {
  owner: Address | undefined;
  market?: MarketId | undefined;
}

export function useAutomationPolicies(
  args: UseAutomationPoliciesArgs,
): UseQueryResult<readonly Policy[], Error> {
  const { sdk } = useSdk();
  return useQuery<readonly Policy[], Error>({
    queryKey: [
      "automation-policies",
      args.owner ?? "no-owner",
      args.market ?? "no-market",
    ],
    queryFn: async () => {
      if (!args.owner) {
        throw new Error("useAutomationPolicies: owner required");
      }
      return args.market
        ? sdk.getAutomationPolicies(args.owner, args.market)
        : sdk.getAutomationPolicies(args.owner);
    },
    enabled: Boolean(args.owner),
    refetchInterval: 30_000,
    retry: false,
  });
}
