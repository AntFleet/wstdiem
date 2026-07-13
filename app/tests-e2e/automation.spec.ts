// Playwright spec for D.4 Automation per PROTOCOL.md §13.4.

import { expect, test } from "@playwright/test";

test.describe("Automation", () => {
  test("renders disconnected state when no wallet is connected", async ({
    page,
  }) => {
    await page.goto("/automation");
    await expect(
      page.getByTestId("automation-disconnected"),
    ).toBeVisible();
  });

  test.skip(
    "policy editor + live policies render side by side when connected",
    async ({ page }) => {
      await page.goto("/automation");
      await expect(page.getByTestId("policy-editor")).toBeVisible();
      await expect(page.getByTestId("live-policies")).toBeVisible();
    },
  );

  test.skip(
    "selecting FORCE_EXIT class reveals the acknowledged-risks checklist",
    async ({ page }) => {
      await page.goto("/automation");
      await page
        .getByTestId("policy-class-FORCE_EXIT")
        .locator("input")
        .click();
      await expect(
        page.getByTestId("acknowledged-risks-section"),
      ).toBeVisible();
    },
  );

  test.skip(
    "permissionless fallback badge surfaces on KEEPER_PERMISSIONLESS policies",
    async ({ page }) => {
      await page.goto("/automation");
      // Requires a seeded permissionless policy from the indexer — fixture
      // lands in Phase 5.
      await expect(
        page.locator("[data-testid^=permissionless-badge-]").first(),
      ).toBeVisible();
    },
  );

  test.skip(
    "Revoke calls sdk.revokeAuthorization and removes the row",
    async ({ page }) => {
      await page.goto("/automation");
      const first = page.locator("[data-testid^=live-policy-revoke-]").first();
      const policyId = await first.getAttribute("data-testid");
      await first.click();
      await expect(
        page.getByTestId(`live-policy-${policyId}`),
      ).toHaveCount(0);
    },
  );
});
