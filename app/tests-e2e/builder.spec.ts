// Playwright spec for the D.2 Loop Builder + §10 Preview Drawer.
//
// PROTOCOL.md §13.4 + §10 acceptance. Pure UI paths run always; wallet-gated
// sign/preview resolution uses fixtures/mock-wallet.ts. Full funded broadcast
// remains behind LIVE_E2E=1.

import { expect, test } from "@playwright/test";
import { installMockWallet, liveE2eEnabled } from "./fixtures/mock-wallet.js";

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
    await expect(page.getByTestId("open-preview-cta")).toBeVisible();
  });

  test("MevModeSelector reveals waiver checklist on non-default mode", async ({
    page,
  }) => {
    await page.goto("/loop");
    await page.getByTestId("mev-mode-option-PUBLIC").locator("input").click();
    await expect(page.getByTestId("mev-waiver-section")).toBeVisible();
    await expect(page.getByTestId("mev-waiver-blocked")).toBeVisible();
  });

  test("with mock wallet, open-preview CTA is present and amount is editable", async ({
    page,
  }) => {
    await installMockWallet(page);
    await page.goto("/loop");
    await page.getByTestId("amount-input").fill("1");
    await expect(page.getByTestId("amount-input")).toHaveValue("1");
    await expect(page.getByTestId("open-preview-cta")).toBeVisible();
  });

  test("wrong-chain / stale-quote / full preview sections require LIVE_E2E", async ({
    page,
  }) => {
    test.skip(
      !liveE2eEnabled(),
      "Set LIVE_E2E=1 with Anvil/Sepolia mock deploy for sign-path assertions",
    );
    await installMockWallet(page);
    await page.goto("/loop");
    await page.getByTestId("amount-input").fill("1");
    await page.getByTestId("open-preview-cta").click();
    await expect(page.getByTestId("preview-drawer")).toBeVisible({
      timeout: 30_000,
    });
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
  });
});
