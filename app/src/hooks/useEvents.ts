// useEvents — placeholder hook for indexer event subscription.
//
// Phase 5 wires the IndexerClient streaming endpoint via the SDK's
// decodeLoopEvent helper. Phase 4 returns the loading state so the
// EventTimeline component renders cleanly without a hard dep on indexer
// availability.

import type { TimelineEvent } from "../components/EventTimeline.js";

interface UseEventsArgs {
  owner?: string | undefined;
}

interface UseEventsResult {
  events: readonly TimelineEvent[];
  isLoading: boolean;
  error: Error | null;
}

export function useEvents(_args: UseEventsArgs): UseEventsResult {
  // m-do-4 closure: collapsed the prior `args.owner ? [] : []` ternary —
  // both branches returned the same empty array. Phase 5 wires the
  // subscription against the PR-10 indexer's /events endpoint and will
  // re-introduce branching on owner presence.
  return {
    events: [],
    isLoading: false,
    error: null,
  };
}
