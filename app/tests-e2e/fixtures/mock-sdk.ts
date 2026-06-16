// Mock SDK helper. Intercepts SDK indexer HTTP calls via Playwright
// page.route so the chrome can render expected states without a live
// indexer.
//
// This module does NOT modify the SDK source — it intercepts at the
// network boundary. The SDK still constructs its own clients, signs its
// own HMACs (or skips when VITE_INDEXER_PUBKEY is zero in dev), but the
// JSON responses we return are what the SDK sees on the wire.
//
// IMPORTANT: route patterns MUST be narrowly scoped to the indexer URL
// (default http://localhost:9000 in the test env). A glob like
// `**/health` is too broad and will intercept the dev server's own
// asset requests, breaking the entire SPA. Always include the host
// + port prefix.

import type { Page } from "@playwright/test";

const INDEXER_HOST = "http://localhost:9000";

/** Minimal shape returned by the indexer's /readiness endpoint per the
 * PR-10 contract. The SDK's IndexerClient normalises this into ReadinessResult. */
export interface MockReadinessPayload {
  market: string;
  blockNumber: number;
  stateBitmap: number;
  sequencer: "up" | "down" | "grace";
  rpcQuorum: {
    threshold: number;
    matched: number;
    matchedFamilies: string[];
    providerFamilies: string[];
    size: number;
    status: "ok" | "degraded" | "fail";
  };
  perAction?: Record<
    string,
    {
      decision: "allowed" | "blocked";
      predicates: string[];
      errors: string[];
    }
  >;
  sources?: Array<{ name: string; blockNumber: number; status: string }>;
}

/** Defaults that produce a clean "all-green" readiness. Pass field overrides
 * to flip specific bits / decisions. */
export function makeReadinessPayload(
  market: string,
  overrides: Partial<MockReadinessPayload> = {},
): MockReadinessPayload {
  return {
    market,
    blockNumber: 100_000_000,
    stateBitmap: 0,
    sequencer: "up",
    rpcQuorum: {
      threshold: 2,
      matched: 2,
      matchedFamilies: ["alchemy", "infura"],
      providerFamilies: ["alchemy", "infura"],
      size: 2,
      status: "ok",
    },
    perAction: {
      Open: { decision: "allowed", predicates: [], errors: [] },
      Rebalance: { decision: "allowed", predicates: [], errors: [] },
      Exit: { decision: "allowed", predicates: [], errors: [] },
      ForceExit: { decision: "allowed", predicates: [], errors: [] },
      Revoke: { decision: "allowed", predicates: [], errors: [] },
      AutomationExec: { decision: "allowed", predicates: [], errors: [] },
    },
    sources: [
      { name: "morpho", blockNumber: 100_000_000, status: "ok" },
      { name: "chainlink", blockNumber: 99_999_999, status: "ok" },
    ],
    ...overrides,
  };
}

export interface MockSdkInstallOpts {
  /** When set, every /readiness response uses this payload. */
  readinessPayload?: MockReadinessPayload;
  /** When set, every /policies response uses this payload. */
  policiesPayload?: { policies: unknown[] };
  /** When set, every /anchor response uses this payload. */
  anchorPayload?: unknown;
  /** When true, return 503 for every indexer call → exercises fail-closed
   * paths in the app. */
  failClosed?: boolean;
}

/** Install indexer stubs on the page BEFORE navigating. Returns the
 * recorded request paths so tests can assert which endpoints were hit. */
export async function installMockSdk(
  page: Page,
  opts: MockSdkInstallOpts = {},
): Promise<{ recorded: string[] }> {
  const recorded: string[] = [];

  // Narrow scoping: only intercept the configured INDEXER_HOST. A pattern
  // like `**/health` would catch Vite's asset requests + websocket pings
  // and break the SPA entirely.
  await page.route(`${INDEXER_HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    recorded.push(url.pathname);

    if (opts.failClosed) {
      await route.fulfill({ status: 503, body: "" });
      return;
    }

    if (url.pathname === "/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", chainId: 8453, head: null }),
      });
      return;
    }

    if (url.pathname.startsWith("/readiness")) {
      if (!opts.readinessPayload) {
        await route.fulfill({ status: 503, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(opts.readinessPayload),
      });
      return;
    }

    if (url.pathname.startsWith("/policies")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(opts.policiesPayload ?? { policies: [] }),
      });
      return;
    }

    if (url.pathname.startsWith("/anchor")) {
      if (!opts.anchorPayload) {
        await route.fulfill({ status: 503, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(opts.anchorPayload),
      });
      return;
    }

    // Default: 404 so unmocked indexer paths surface as clear failures.
    await route.fulfill({ status: 404, body: "" });
  });

  return { recorded };
}
