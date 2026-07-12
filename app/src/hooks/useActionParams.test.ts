// Unit tests for useActionParams — verifies the hook dispatches the friendly
// inputs to the correct SDK build*Params helper (T2b wiring). The SDK is
// mocked; no live chain / readers required.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { Address, BasisPoints, MarketId } from "@wstdiem/sdk";
import { useActionParams } from "./useActionParams.js";

const buildOpenParams = vi.fn();
const buildRebalanceParams = vi.fn();
const buildExitParams = vi.fn();

vi.mock("./useSdk.js", () => ({
  useSdk: () => ({
    sdk: { buildOpenParams, buildRebalanceParams, buildExitParams },
  }),
}));

const MARKET = ("0x" + "ab".repeat(32)) as MarketId;
const OWNER = "0x0000000000000000000000000000000000000abc" as Address;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  buildOpenParams.mockReset().mockResolvedValue({ primaryType: "Open" });
  buildRebalanceParams
    .mockReset()
    .mockResolvedValue({ primaryType: "Rebalance" });
  buildExitParams.mockReset().mockResolvedValue({ primaryType: "Exit" });
});

describe("useActionParams", () => {
  it("dispatches Open with leverage passthrough", async () => {
    const { result } = renderHook(
      () =>
        useActionParams({
          primaryType: "Open",
          market: MARKET,
          owner: OWNER,
          collateralAmount: 1_000_000n,
          leverageBps: 20_000 as BasisPoints,
          mevProtectionMode: "PRIVATE_BUILDER",
          mevWaiverBits: 0,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(buildOpenParams).toHaveBeenCalledTimes(1);
    expect(buildOpenParams).toHaveBeenCalledWith(
      expect.objectContaining({
        market: MARKET,
        owner: OWNER,
        collateralAmount: 1_000_000n,
        leverageBps: 20_000,
      }),
    );
    expect(buildRebalanceParams).not.toHaveBeenCalled();
    expect(buildExitParams).not.toHaveBeenCalled();
  });

  it("dispatches Exit with the route kind", async () => {
    const { result } = renderHook(
      () =>
        useActionParams({
          primaryType: "Exit",
          market: MARKET,
          owner: OWNER,
          collateralAmount: 800_000n,
          leverageBps: 10_000 as BasisPoints,
          mevProtectionMode: "PRIVATE_BUILDER",
          mevWaiverBits: 0,
          routeKind: "REPAY_ONLY",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(buildExitParams).toHaveBeenCalledWith(
      expect.objectContaining({ routeKind: "REPAY_ONLY" }),
    );
  });

  it("stays disabled (no build) when amount is missing", async () => {
    const { result } = renderHook(
      () =>
        useActionParams({
          primaryType: "Open",
          market: MARKET,
          owner: OWNER,
          collateralAmount: undefined,
          leverageBps: 20_000 as BasisPoints,
          mevProtectionMode: "PRIVATE_BUILDER",
          mevWaiverBits: 0,
        }),
      { wrapper },
    );
    // Query never fires while disabled.
    expect(result.current.fetchStatus).toBe("idle");
    expect(buildOpenParams).not.toHaveBeenCalled();
  });

  it("stays disabled on wrong chain", async () => {
    const { result } = renderHook(
      () =>
        useActionParams({
          primaryType: "Open",
          market: MARKET,
          owner: OWNER,
          collateralAmount: 1_000_000n,
          leverageBps: 20_000 as BasisPoints,
          mevProtectionMode: "PRIVATE_BUILDER",
          mevWaiverBits: 0,
          disabled: true,
        }),
      { wrapper },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(buildOpenParams).not.toHaveBeenCalled();
  });
});
