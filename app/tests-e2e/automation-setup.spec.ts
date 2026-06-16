// §13.4 row: Configure automation.
//
// Acceptance: /automation renders the disconnected sentinel without a
// wallet; with a wallet, the PolicyEditor + LivePolicies render side
// by side. Sign-policy round-trip needs a wallet → fixme'd.

import { expect, test } from "@playwright/test";
import { AUTOMATION } from "./fixtures/selectors.js";

test.describe("Configure automation (§13.4 row 9)", () => {
  test("disconnected sentinel renders without a wallet", async ({ page }) => {
    await page.goto("/automation");
    await expect(page.getByTestId(AUTOMATION.disconnected)).toBeVisible();
  });

  test.fixme(
    "PolicyEditor + LivePolicies render when connected",
    async ({ page }) => {
      // FIXME deferred: needs wallet connect.
      await page.goto("/automation");
      await expect(page.getByTestId(AUTOMATION.policyEditor)).toBeVisible();
      await expect(page.getByTestId(AUTOMATION.livePolicies)).toBeVisible();
    },
  );

  test.fixme(
    "selecting FORCE_EXIT policy class reveals acknowledged-risks checklist",
    async ({ page }) => {
      // FIXME deferred: needs PolicyEditor mounted (which needs wallet
      // connect). The Vitest unit test covers this transition.
      await page.goto("/automation");
      await page
        .getByTestId(AUTOMATION.policyClassForceExit)
        .locator("input")
        .click();
      await expect(
        page.getByTestId(AUTOMATION.acknowledgedRisks),
      ).toBeVisible();
    },
  );

  test.fixme(
    "Sign policy signs AutomationExec digest via real wallet",
    async () => {
      // FIXME deferred: needs real wallet sign flow.
    },
  );
});
