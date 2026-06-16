// §13.4 row: Evidence download.
//
// Acceptance: /evidence renders the export button + copy-to-clipboard
// button. The actual JSON shape depends on the SDK's getMarketEvidence
// round-trip; the buttons are gated disabled until a bundle resolves.

import { expect, test } from "@playwright/test";
import { EVIDENCE } from "./fixtures/selectors.js";

test.describe("Evidence download (§13.4 row 20)", () => {
  test("/evidence renders with the export + copy buttons", async ({ page }) => {
    await page.goto("/evidence");
    await expect(page.getByTestId(EVIDENCE.screen)).toBeVisible();
    // Both buttons render even when disabled (no bundle yet).
    await expect(page.getByTestId(EVIDENCE.download)).toBeVisible();
    await expect(page.getByTestId(EVIDENCE.copy)).toBeVisible();
  });

  test("audit-gate-summary section renders", async ({ page }) => {
    await page.goto("/evidence");
    await expect(page.getByTestId(EVIDENCE.auditGateSummary)).toBeVisible();
  });

  test("state-bit-grid renders with all 16 cells (11 named + 5 reserved)", async ({
    page,
  }) => {
    await page.goto("/evidence");
    await expect(page.getByTestId(EVIDENCE.stateBitGrid)).toBeVisible();
    const cells = page.locator("[data-testid^=state-bit-cell-]");
    await expect(cells).toHaveCount(16);
  });

  test("canonical-errors section renders", async ({ page }) => {
    await page.goto("/evidence");
    await expect(
      page.getByTestId(EVIDENCE.canonicalErrorsSection),
    ).toBeVisible();
  });

  test.fixme(
    "download button triggers a JSON download with canonical evidence",
    async ({ page }) => {
      // FIXME deferred: needs the SDK's getMarketEvidence to resolve
      // (currently blocked on the mocked indexer's signature scheme).
      // The unit test for EvidenceExportButton covers the file/clipboard
      // mechanics directly.
      await page.goto("/evidence");
      const downloadPromise = page.waitForEvent("download");
      await page.getByTestId(EVIDENCE.download).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.json$/);
    },
  );

  test.fixme(
    "copy button writes canonical JSON to clipboard",
    async () => {
      // FIXME deferred: same dependency as download — bundle needs to resolve.
    },
  );
});
