// usePreview — wraps SDK quote / preview calls per intent.
//
// Returns a TransactionPreview when the SDK produces one. retry: false
// preserves the fail-closed posture; a failed preview means signing must
// not arm.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Action, TransactionPreview } from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";
import { actionToKey } from "../lib/query-keys.js";

interface UsePreviewArgs {
  action: Action | undefined;
  /** When true, the query stays disabled (e.g. inputs are still being
   * edited and a quote shouldn't be fetched yet). */
  disabled?: boolean;
}

export function usePreview(
  args: UsePreviewArgs,
): UseQueryResult<TransactionPreview, Error> {
  const { sdk } = useSdk();
  return useQuery<TransactionPreview, Error>({
    // m-do-1 closure: every distinct Action gets its own cache key. The
    // previous `args.action ?? "no-action"` collapsed every action to
    // `[object Object]` because the default queryKey serializer cannot
    // round-trip bigints inside Action.bounds.
    queryKey: [
      "preview",
      args.action ? actionToKey(args.action) : "no-action",
    ],
    queryFn: async () => {
      if (!args.action) throw new Error("usePreview: action required");
      return sdk.previewTransaction(args.action);
    },
    enabled: Boolean(args.action) && !args.disabled,
    retry: false,
    staleTime: 6_000,
  });
}
