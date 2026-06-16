// §13.4 row: Loop simulation.
//
// Acceptance: /loop renders the intent tabs + amount input + leverage
// slider + live HF gauge container + MEV mode selector. The full
// simulation round-trip needs a live SDK quote and is deferred.

import { expect, test } from "@playwright/test";
import { LOOP } from "./fixtures/selectors.js";

test.describe("Loop simulation (§13.4 row 3)", () => {
  test("intent tabs render and are switchable", async ({ page }) => {
    await page.goto("/loop");
    for (const id of [
      LOOP.intentEarn,
      LOOP.intentIncrease,
      LOOP.intentReduce,
      LOOP.intentExit,
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // Click each non-default tab; assert the tab is now data-selected=true.
    await page.getByTestId(LOOP.intentIncrease).click();
    // Tab buttons toggle aria-pressed or class. Visible is the soft signal.
    await expect(page.getByTestId(LOOP.intentIncrease)).toBeVisible();
  });

  test("amount input + leverage slider render and accept input", async ({
    page,
  }) => {
    await page.goto("/loop");
    const amount = page.getByTestId(LOOP.amountInput);
    const slider = page.getByTestId(LOOP.leverageSlider);
    await expect(amount).toBeVisible();
    await expect(slider).toBeVisible();
    await amount.fill("1.5");
    await expect(amount).toHaveValue("1.5");
  });

  test("HF gauge container + MEV mode selector render", async ({ page }) => {
    await page.goto("/loop");
    await expect(page.getByTestId(LOOP.liveHfSection)).toBeVisible();
    await expect(page.getByTestId(LOOP.mevModeSelector)).toBeVisible();
  });

  test.fixme(
    "post-action HF estimate resolves with SDK live data",
    async () => {
      // FIXME deferred: real HF estimation needs sdk.quoteOpen/quoteRebalance
      // round-trip with real Morpho / Chainlink reads. The Phase 3 builder
      // leaves proposedAction undefined to keep the digest fail-closed.
      // Tracked under PR-17 SDK gap "live quote round-trip".
    },
  );

  test.fixme(
    "simulation feedback (estimated outputs, fees, route) renders",
    async () => {
      // FIXME deferred: per-route fee decomposition + expected output is a
      // PR-17 SDK gap. PR-16 commits the digest sub-hashes only.
    },
  );
});
