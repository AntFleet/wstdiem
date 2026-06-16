// Playwright spec for D.3 Positions per PROTOCOL.md §13.4.

import { expect, test } from "@playwright/test";

test.describe("Positions", () => {
  test("renders disconnected state when no wallet is connected", async ({
    page,
  }) => {
    await page.goto("/positions");
    await expect(
      page.getByTestId("positions-disconnected"),
    ).toBeVisible();
  });

  test.fixme(
    "renders risk header + 6-action row + auth + events when connected",
    async ({ page }) => {
      await page.goto("/positions");
      await expect(page.getByTestId("risk-header")).toBeVisible();
      await expect(page.getByTestId("position-action-row")).toBeVisible();
      for (const id of [
        "add-collateral",
        "repay",
        "rebalance-down",
        "exit",
        "force-exit",
        "revoke",
      ]) {
        await expect(
          page.getByTestId(`action-button-${id}`),
        ).toBeVisible();
      }
      await expect(page.getByTestId("authorization-row")).toBeVisible();
      await expect(page.getByTestId("event-timeline")).toBeVisible();
    },
  );

  test.fixme(
    "Force-Exit button opens the full-screen confirmation panel",
    async ({ page }) => {
      await page.goto("/positions");
      await page.getByTestId("action-button-force-exit").click();
      await expect(
        page.getByTestId("force-exit-confirm-panel"),
      ).toBeVisible();
    },
  );

  test.fixme(
    "AND-over-rows blocked reasons render every matched P-predicate",
    async ({ page }) => {
      // Requires a market in a state where multiple bits block the same
      // action — fixture wiring lands in Phase 5.
      await page.goto("/positions");
      const reasons = page.getByTestId("action-blocked-reasons-exit");
      const predicateCount = await reasons.locator("[data-testid^=action-predicate-]").count();
      expect(predicateCount).toBeGreaterThan(1);
    },
  );
});
