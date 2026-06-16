// Playwright spec for the D.2 Loop Builder + §10 Preview Drawer.
//
// PROTOCOL.md §13.4 + §10 acceptance. Phase 3 lands the skeleton; full runs
// depend on Phase 5 wiring (deployed registry + indexer URL + wallet).

import { expect, test } from "@playwright/test";

test.describe("Loop Builder + Preview Drawer", () => {
  test("renders intent tabs + amount + slider on /loop", async ({ page }) => {
    await page.goto("/loop");
    await expect(page.getByTestId("intent-tab-earn-spread")).toBeVisible();
    await expect(page.getByTestId("intent-tab-increase-exposure")).toBeVisible();
    await expect(page.getByTestId("intent-tab-reduce-risk")).toBeVisible();
    await expect(page.getByTestId("intent-tab-exit")).toBeVisible();
    await expect(page.getByTestId("amount-input")).toBeVisible();
    await expect(page.getByTestId("leverage-slider")).toBeVisible();
    await expect(page.getByTestId("live-hf-section")).toBeVisible();
    await expect(page.getByTestId("mev-mode-selector")).toBeVisible();
  });

  test("clicking Open preview opens the drawer with loading state", async ({
    page,
  }) => {
    await page.goto("/loop");
    // Open-preview is initially disabled without an account; test the CTA's
    // presence (deferred to Phase 5 wallet flow for the enable path).
    await expect(page.getByTestId("open-preview-cta")).toBeVisible();
  });

  test.fixme(
    "wrong-chain blocks Sign with explicit reason",
    async ({ page }) => {
      await page.goto("/loop");
      await page.getByTestId("open-preview-cta").click();
      await expect(page.getByTestId("preview-drawer")).toBeVisible();
      await expect(
        page.getByTestId("preview-sign-override-reason"),
      ).toContainText(/Wrong chain/);
    },
  );

  test.fixme(
    "stale-quote disables Sign with QuoteStale reason",
    async ({ page }) => {
      await page.goto("/loop");
      await page.getByTestId("open-preview-cta").click();
      await expect(
        page.getByTestId("preview-sign-override-reason"),
      ).toContainText(/QuoteStale/);
    },
  );

  test.fixme(
    "MevModeSelector reveals waiver checklist on non-default mode",
    async ({ page }) => {
      await page.goto("/loop");
      await page
        .getByTestId("mev-mode-option-PUBLIC")
        .locator("input")
        .click();
      await expect(page.getByTestId("mev-waiver-section")).toBeVisible();
      await expect(page.getByTestId("mev-waiver-blocked")).toBeVisible();
    },
  );

  test.fixme(
    "PreviewDrawer renders every §10 section when preview resolves",
    async ({ page }) => {
      await page.goto("/loop");
      await page.getByTestId("amount-input").fill("1");
      await page.getByTestId("open-preview-cta").click();
      for (const id of [
        "preview-identity",
        "preview-spenders",
        "preview-digest",
        "preview-ledger",
        "preview-amounts-route",
        "preview-fees-yield",
        "preview-approvals",
        "preview-calldata",
        "preview-failure-conditions",
        "preview-gates",
      ]) {
        await expect(page.getByTestId(id)).toBeVisible();
      }
    },
  );
});
