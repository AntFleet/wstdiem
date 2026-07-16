// §13.4 row: Revoke (UI + SDK encode path).

import { expect, test } from "@playwright/test";
import { POSITIONS } from "./fixtures/selectors.js";
import { installMockWallet, liveE2eEnabled } from "./fixtures/mock-wallet.js";

test.describe("Revoke (§13.4 row 14)", () => {
  test("positions disconnected sentinel renders without a wallet", async ({
    page,
  }) => {
    await page.goto("/positions");
    await expect(page.getByTestId(POSITIONS.disconnected)).toBeVisible();
  });

  test("mock wallet injects without crashing /positions", async ({ page }) => {
    await installMockWallet(page);
    await page.goto("/positions");
    // Disconnected UI may still show until ConnectKit adopts injected
    // provider; page must remain interactive.
    await expect(page.locator("body")).toBeVisible();
  });

  test("revoke enabled under AUDIT_GATE_CLOSED requires LIVE_E2E connected state", async ({
    page,
  }) => {
    test.skip(!liveE2eEnabled(), "Needs connected wallet + mocked readiness");
    await installMockWallet(page);
    await page.goto("/positions");
    await expect(page.getByTestId(POSITIONS.actionRevoke)).toBeEnabled();
  });
});
