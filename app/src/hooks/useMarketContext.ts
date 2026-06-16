// useMarketContext — exposes the user's currently-selected market.
//
// Phase 1 ships ONE market (synthesis G.4) — the registry-pinned Phase 1
// market id. The hook returns the env-configured market id so the chrome
// state-bit strip and Markets row read against a real market without each
// caller threading the id through props.
//
// Phase 5 (Markets polish) replaces this with the real per-route selection
// derived from the markets list + last-visited market in localStorage.

import { useMemo } from "react";
import { asMarketId, type Bytes32, type MarketId } from "@wstdiem/sdk";

interface MarketContext {
  activeMarket: MarketId | undefined;
  allMarketIds: readonly MarketId[];
}

const STORAGE_KEY = "wstdiem.active-market";

function readPhase1Markets(): MarketId[] {
  const raw = import.meta.env.VITE_PHASE_1_MARKET_IDS;
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^0x[0-9a-fA-F]{64}$/.test(s))
    .map((s) => asMarketId(s as Bytes32));
}

export function useMarketContext(): MarketContext {
  return useMemo(() => {
    const all = readPhase1Markets();
    if (all.length === 0) {
      return { activeMarket: undefined, allMarketIds: [] };
    }
    // Honor localStorage selection when it matches a configured market.
    let active = all[0];
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const match = all.find((m) => m === stored);
        if (match) active = match;
      }
    }
    return { activeMarket: active, allMarketIds: all };
  }, []);
}
