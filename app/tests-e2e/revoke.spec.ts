// §13.4 row: Revoke (UI render only).
//
// Acceptance: the revoke button is part of the 6-action row on /positions.
// Per PROTOCOL.md §7.1, Revoke is the ONE action that remains available even
// when AUDIT_GATE_CLOSED is set. Sign + broadcast flow is deferred.

import { expect, test } from "@playwright/test";
import { POSITIONS } from "./fixtures/selectors.js";

test.describe("Revoke (§13.4 row 14)", () => {
  test("positions disconnected sentinel renders without a wallet", async ({
    page,
  }) => {
    await page.goto("/positions");
    await expect(page.getByTestId(POSITIONS.disconnected)).toBeVisible();
  });

  test.fixme(
    "revoke button is enabled even with AUDIT_GATE_CLOSED",
    async ({ page }) => {
      // FIXME deferred: needs wallet connect + readiness with
      // AUDIT_GATE_CLOSED bit set. The state-bit-matrix lib unit test
      // covers the matrix value directly. The mocked-readiness path
      // exists in mock-sdk.ts; this row needs connected state.
      await page.goto("/positions");
      await expect(
        page.getByTestId(POSITIONS.actionRevoke),
      ).toBeEnabled();
    },
  );

  test.fixme(
    "revoke triggers sdk.revokeAuthorization round-trip",
    async () => {
      // FIXME deferred: needs real wallet sign flow.
    },
  );
});
