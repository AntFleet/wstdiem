// §13.4 row: Canonical error code parity (§5.5).
//
// Acceptance: every canonical-error selector in the SDK registry surfaces
// in the UI via the canonical-errors section. The Phase 5 evidence page
// is a render-only placeholder; the full per-selector browser lands as a
// PR-17 follow-up. The §10 PreviewDrawer failure-conditions section
// surfaces the per-action selector list.

import { expect, test } from "@playwright/test";
import { EVIDENCE } from "./fixtures/selectors.js";

test.describe("Canonical error code parity (§13.4 row 22)", () => {
  test("canonical-errors section is mounted on /evidence", async ({
    page,
  }) => {
    await page.goto("/evidence");
    await expect(
      page.getByTestId(EVIDENCE.canonicalErrorsSection),
    ).toBeVisible();
  });

  test("section reports SDK getCanonicalErrors result without errors", async ({
    page,
  }) => {
    // Capture console errors — if the SDK's getCanonicalErrors throws,
    // it surfaces here.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push("console: " + msg.text());
    });
    await page.goto("/evidence");
    await page.waitForTimeout(1000);
    // The section either reports the count (success) or a fail-closed
    // banner. The screen mounts without throwing.
    await expect(
      page.getByTestId(EVIDENCE.canonicalErrorsSection),
    ).toBeVisible();
    // Filter out unrelated dev-mode noise (RPC 429s on placeholder URLs).
    const unrelated = errors.filter(
      (e) =>
        !e.match(/429|rate limit|fetch|Failed to load resource|NetworkError/i),
    );
    expect(unrelated, `unexpected page/console errors:\n${unrelated.join("\n")}`).toEqual([]);
  });

  test.skip(
    "per-selector browser surfaces every canonical error",
    async () => {
      // FIXME deferred: Phase 5 evidence page renders the count only.
      // Full per-selector browser (selector → SDK enum name → human-readable
      // description) lands as a PR-17 follow-up — STATUS.md open question
      // "canonical-errors browser".
    },
  );

  test.skip(
    "every failure-condition rendered in PreviewDrawer maps to a canonical error",
    async () => {
      // FIXME deferred: depends on the preview drawer resolving with a
      // real TransactionPreview. The PreviewDrawer testid
      // `failure-condition-{name}` is in place; live data lands when the
      // SDK quote round-trip is wired.
    },
  );
});
