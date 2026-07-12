// useActionParams — derive a fully-assembled Action envelope from the
// LoopBuilder's friendly inputs (amount, leverage, MEV mode) via the SDK's
// build*Params helpers (T2a). The result feeds straight into usePreview.
//
// The build call hits the live readers (registryVersion / nonce / block), so
// it is modeled as a react-query query keyed on the friendly INPUTS — not the
// resulting Action — so it only re-runs when the user changes an input rather
// than on every render. retry: false preserves the fail-closed posture: a
// failed build means no action is armed and signing never enables.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  Action,
  Address,
  BasisPoints,
  ExitRouteKind,
  MarketId,
  MevProtectionMode,
} from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

/** The LoopBuilder intents that map onto a user-signed manual action. */
export type BuilderPrimaryType = "Open" | "Rebalance" | "Exit";

interface UseActionParamsArgs {
  primaryType: BuilderPrimaryType;
  market: MarketId | undefined;
  owner: Address | undefined;
  /** Parsed collateral amount (base units). undefined disables the query. */
  collateralAmount: bigint | undefined;
  leverageBps: BasisPoints;
  mevProtectionMode: MevProtectionMode;
  mevWaiverBits: number;
  /** Exit-only route selection. */
  routeKind?: ExitRouteKind;
  /** External disable (e.g. wrong chain / disconnected). */
  disabled?: boolean;
}

export function useActionParams(
  args: UseActionParamsArgs,
): UseQueryResult<Action, Error> {
  const { sdk } = useSdk();
  const enabled =
    Boolean(args.market && args.owner) &&
    args.collateralAmount !== undefined &&
    args.collateralAmount > 0n &&
    !args.disabled;

  return useQuery<Action, Error>({
    queryKey: [
      "action-params",
      args.primaryType,
      args.market ?? "no-market",
      args.owner ?? "no-owner",
      args.collateralAmount?.toString() ?? "no-amount",
      args.leverageBps,
      args.mevProtectionMode,
      args.mevWaiverBits,
      args.routeKind ?? "default-route",
    ],
    queryFn: async () => {
      if (!args.market || !args.owner || args.collateralAmount === undefined) {
        throw new Error("useActionParams: market + owner + amount required");
      }
      const common = {
        market: args.market,
        owner: args.owner,
        collateralAmount: args.collateralAmount,
        mevProtectionMode: args.mevProtectionMode,
        mevWaiverBits: args.mevWaiverBits,
      };
      switch (args.primaryType) {
        case "Open":
          return sdk.buildOpenParams({ ...common, leverageBps: args.leverageBps });
        case "Rebalance":
          return sdk.buildRebalanceParams({
            ...common,
            leverageBps: args.leverageBps,
          });
        case "Exit":
          return sdk.buildExitParams({
            ...common,
            ...(args.routeKind !== undefined ? { routeKind: args.routeKind } : {}),
          });
      }
    },
    enabled,
    retry: false,
    // Rebuild deadline/quote block only when inputs change or the cache goes
    // stale — keeps the derived nonce/deadline stable across renders.
    staleTime: 6_000,
  });
}
