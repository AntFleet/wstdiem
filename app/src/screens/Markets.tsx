// D.1 Markets — Phase 5 wires the MarketCard + MarketFilterStrip into
// the Beefy + Morpho + DeFi Saver card density per synthesis A.4 / B.1 /
// D.1. Phase 1 thin row replaced.
//
// Per-market MarketCard renders pair / state-bit / audit-gate / Open +
// Manage CTAs; expanded reveals StatePillExpanded with utilization / LLTV
// / Curve depth / vault NAV / executor codehash / sequencer / anchor /
// 24h transitions / RPC quorum.
//
// MarketFilterStrip surfaces chain / state / automation / audit-gate
// filters; default hides closed-audit-gate markets (with a "show all
// including closed" toggle), per synthesis D.1.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StateBit, type MarketId, type ReadinessResult } from "@wstdiem/sdk";
import { MarketCard } from "../components/MarketCard.js";
import {
  MarketFilterStrip,
  DEFAULT_FILTERS,
  type MarketFilters,
} from "../components/MarketFilterStrip.js";
import { useMarketContext } from "../hooks/useMarketContext.js";
import { useSdk } from "../hooks/useSdk.js";
import { useAnchorFreshness } from "../hooks/useAnchorFreshness.js";
import { hasUnknownBits } from "../lib/state-bits.js";

interface MarketBundle {
  marketId: MarketId;
  readiness: ReadinessResult | undefined;
  isLoading: boolean;
}

function useMarketReadiness(marketId: MarketId): MarketBundle {
  const { sdk } = useSdk();
  const query = useQuery<ReadinessResult, Error>({
    queryKey: ["markets-readiness", marketId],
    queryFn: () => sdk.getReadiness(marketId),
    enabled: Boolean(marketId),
    refetchInterval: 12_000,
    retry: false,
  });
  return {
    marketId,
    readiness: query.data,
    isLoading: query.isLoading,
  };
}

function matchesFilters(
  bundle: MarketBundle,
  filters: MarketFilters,
  automationAvailable: boolean | undefined,
): boolean {
  const bitmap = bundle.readiness?.stateBitmap;
  if (filters.auditGateOnlyOpen) {
    if (bitmap === undefined) {
      // No readiness yet → can't confirm audit-gate is open; hide unless
      // the user toggles "show all including closed".
      return false;
    }
    if ((bitmap & StateBit.AUDIT_GATE_CLOSED) === StateBit.AUDIT_GATE_CLOSED) {
      return false;
    }
  }
  if (filters.stateOnlyClear) {
    if (bitmap === undefined || bitmap !== 0 || hasUnknownBits(bitmap)) {
      return false;
    }
  }
  if (filters.automationOnly) {
    if (!automationAvailable) return false;
  }
  return true;
}

export function Markets(): JSX.Element {
  const { activeMarket: _activeMarket, allMarketIds } = useMarketContext();
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_FILTERS);
  const anchorQuery = useAnchorFreshness();

  // Phase 1 ships one market; Phase 5 hoist iterates per configured id.
  // Each id needs its own readiness query — useMarketReadiness handles
  // that and the hook order is stable because allMarketIds is memoized
  // by useMarketContext (env-derived).
  const bundles: MarketBundle[] = [];
  for (const mid of allMarketIds) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const bundle = useMarketReadiness(mid);
    bundles.push(bundle);
  }

  const visibleBundles = useMemo(
    () => bundles.filter((b) => matchesFilters(b, filters, undefined)),
    [bundles, filters],
  );

  if (allMarketIds.length === 0) {
    return (
      <div
        className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-muted"
        data-testid="markets-empty"
      >
        <h2 className="text-base font-semibold text-text">
          No markets configured
        </h2>
        <p className="mt-1">
          Populate{" "}
          <code className="font-mono">VITE_PHASE_1_MARKET_IDS</code> in{" "}
          <code className="font-mono">.env.local</code> with the
          registry-pinned Phase 1 market id.
        </p>
      </div>
    );
  }

  const hiddenCount = bundles.length - visibleBundles.length;

  return (
    <div className="space-y-4" data-testid="markets-screen">
      <header>
        <h2 className="text-lg font-semibold text-text">Markets</h2>
        <p className="text-sm text-text-muted">
          Loop-eligible Morpho markets the registry recognises.{" "}
          {allMarketIds.length === 1
            ? "One market"
            : `${allMarketIds.length} markets`}
          {hiddenCount > 0
            ? `; ${hiddenCount} hidden by filters`
            : ""}
          .
        </p>
      </header>

      <MarketFilterStrip filters={filters} onChange={setFilters} />

      {visibleBundles.length === 0 ? (
        <div
          data-testid="markets-list-empty"
          className="rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-text-muted"
        >
          No markets match the current filters.{" "}
          <button
            type="button"
            onClick={() =>
              setFilters({
                auditGateOnlyOpen: false,
                stateOnlyClear: false,
                automationOnly: false,
              })
            }
            data-testid="markets-clear-filters"
            className="font-mono text-accent underline hover:opacity-80"
          >
            Show all including closed
          </button>
        </div>
      ) : (
        <ul
          data-testid="markets-list"
          className="space-y-3"
        >
          {visibleBundles.map((b) => (
            <li key={b.marketId} data-testid="market-row">
              <MarketCard
                marketId={b.marketId}
                readiness={b.readiness}
                {...(anchorQuery.data !== undefined
                  ? { anchor: anchorQuery.data }
                  : {})}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
