// §13.4 row: Stale-quote blocking.
//
// Acceptance: when the preview's quoteBlockNumber + maxQuoteAgeBlocks
// gate fails (currentBlock - quoteBlockNumber > maxQuoteAgeBlocks), the
// sign button shows QuoteStale reason inline.
//
// The Phase 3 LoopBuilder leaves proposedAction undefined when amount
// is empty, so the preview never resolves and the QuoteStale gate is
// not exercised. Full coverage needs the live SDK quote round-trip.

import { expect, test } from "@playwright/test";
import { LOOP } from "./fixtures/selectors.js";

test.describe("Stale-quote blocking (§13.4 row 16)", () => {
  test("Open preview CTA renders (chrome present)", async ({ page }) => {
    await page.goto("/loop");
    await expect(page.getByTestId(LOOP.openPreviewCta)).toBeVisible();
  });

  test.fixme(
    "QuoteStale gate surfaces sign-override reason in drawer footer",
    async () => {
      // FIXME deferred: requires the preview drawer to receive a live
      // TransactionPreview with quoteBlockNumber set. The
      // preview-sign-override-reason testid is wired in PreviewDrawer.tsx
      // line 494. Unit test for the override reason text is in
      // PreviewDrawer.test.tsx. Live round-trip lands when SDK quote
      // helpers are wired against funded testnet.
    },
  );
});
