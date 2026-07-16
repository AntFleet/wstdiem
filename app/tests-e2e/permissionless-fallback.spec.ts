// §13.4 row: Permissionless fallback.
//
// Acceptance: when a policy has executionKind = "KEEPER_PERMISSIONLESS",
// the LivePolicies card shows the "permissionless fallback" badge.
//
// Vitest unit test for LivePolicies covers the render directly. This
// Playwright spec confirms the screen mounts and the testid pattern
// exists in the wire-up — the connected-state version is fixme'd
// because it requires wallet connect + seeded policy.

import { expect, test } from "@playwright/test";
import { AUTOMATION } from "./fixtures/selectors.js";

test.describe("Permissionless fallback (§13.4 row 10)", () => {
  test("automation screen mounts (disconnected sentinel)", async ({
    page,
  }) => {
    await page.goto("/automation");
    await expect(page.getByTestId(AUTOMATION.disconnected)).toBeVisible();
  });

  test.skip(
    "KEEPER_PERMISSIONLESS policy surfaces the badge in LivePolicies",
    async ({ page }) => {
      // FIXME deferred: needs wallet connect + seeded permissionless policy
      // from the indexer. Component test
      // app/src/components/LivePolicies.test.tsx covers this transition
      // directly via React Testing Library.
      await page.goto("/automation");
      // The permissionless-badge-* testid is parameterized by policy id.
      await expect(
        page.locator("[data-testid^=permissionless-badge-]").first(),
      ).toBeVisible();
    },
  );
});
