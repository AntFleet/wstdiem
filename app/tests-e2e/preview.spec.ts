// §13.4 row: Transaction preview (§10 fields).
//
// Acceptance: the §10 mandatory disclosure surface renders every required
// section (identity, spenders, digest, ledger, amounts+route, fees+yield,
// approvals, calldata, failure conditions, gates). The drawer rendering
// itself is testable; the full preview round-trip with live data is
// deferred.

import { expect, test } from "@playwright/test";
import { LOOP, PREVIEW } from "./fixtures/selectors.js";

test.describe("Transaction preview drawer (§13.4 row 4)", () => {
  test("Open preview CTA is visible on /loop", async ({ page }) => {
    await page.goto("/loop");
    await expect(page.getByTestId(LOOP.openPreviewCta)).toBeVisible();
  });

  test("Open Preview CTA is disabled when no wallet + no proposedAction", async ({
    page,
  }) => {
    // The Phase 3 builder leaves proposedAction undefined when amount is 0
    // (the digest is fail-closed). The CTA is disabled in that state — the
    // user must connect a wallet AND provide an amount before previewing.
    // This is the canonical fail-closed posture for the §10 preview gate.
    await page.goto("/loop");
    const cta = page.getByTestId(LOOP.openPreviewCta);
    await expect(cta).toBeVisible();
    await expect(cta).toBeDisabled();
  });

  test.skip(
    "drawer renders every §10 section when preview resolves",
    async ({ page }) => {
      // FIXME deferred: needs sdk.quoteOpen / quoteRebalance / quoteExit to
      // produce a real TransactionPreview. The PR-12-15 SDK ships the
      // primitives but live quote round-trip lands in PR-17 with funded
      // testnet env.
      await page.goto("/loop");
      await page.getByTestId(LOOP.amountInput).fill("1");
      await page.getByTestId(LOOP.openPreviewCta).click();
      for (const id of [
        PREVIEW.identity,
        PREVIEW.spenders,
        PREVIEW.digest,
        PREVIEW.ledger,
        PREVIEW.amountsRoute,
        PREVIEW.feesYield,
        PREVIEW.approvals,
        PREVIEW.calldata,
        PREVIEW.failureConditions,
        PREVIEW.gates,
      ]) {
        await expect(page.getByTestId(id)).toBeVisible();
      }
    },
  );

  test.skip(
    "Sign button signs typed-data via real wallet",
    async () => {
      // FIXME deferred: needs a real wallet (ECDSA or Safe/CSW EIP-1271).
      // Live-testnet validation deferred to a follow-up release.
    },
  );
});
