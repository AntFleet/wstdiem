// §13.4 row: Monitor.
//
// Acceptance: /positions renders the disconnected sentinel without a
// wallet; with a wallet (deferred), risk header + 6-action row +
// authorization row + event timeline + evidence export render.

import { expect, test } from "@playwright/test";
import { POSITIONS } from "./fixtures/selectors.js";

test.describe("Monitor (§13.4 row 8)", () => {
  test("disconnected sentinel renders without a wallet", async ({ page }) => {
    await page.goto("/positions");
    await expect(page.getByTestId(POSITIONS.disconnected)).toBeVisible();
  });

  test.skip(
    "risk header + 6-action row + authorization row render when connected",
    async ({ page }) => {
      // FIXME deferred: needs wallet connect + positions readiness. The
      // ActionRow / RiskHeader components are unit-tested separately.
      await page.goto("/positions");
      await expect(page.getByTestId(POSITIONS.riskHeader)).toBeVisible();
      await expect(page.getByTestId(POSITIONS.actionRow)).toBeVisible();
      for (const id of [
        POSITIONS.actionAddCollateral,
        POSITIONS.actionRepay,
        POSITIONS.actionRebalanceDown,
        POSITIONS.actionExit,
        POSITIONS.actionForceExit,
        POSITIONS.actionRevoke,
      ]) {
        await expect(page.getByTestId(id)).toBeVisible();
      }
    },
  );

  test.skip(
    "event timeline renders signed indexer events",
    async () => {
      // FIXME deferred: needs PR-10 indexer running with signed events.
    },
  );
});
