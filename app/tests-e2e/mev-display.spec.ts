// §13.4 row: mevProtectionMode display + opt-in.
//
// Acceptance: the MEV mode selector renders the enum name (PRIVATE_BUILDER /
// PUBLIC / SEQUENCER_DIRECT_FAILOPEN / SEALED_AUCTION) + plain-language
// subtitle. Non-default modes reveal the mev-waiver-section + per-bit
// checklist. An incomplete waiver surfaces the mev-waiver-blocked alert.

import { expect, test } from "@playwright/test";
import { LOOP } from "./fixtures/selectors.js";

test.describe("MEV mode display + opt-in (§13.4 row 18)", () => {
  test("default PRIVATE_BUILDER mode renders with no waiver section", async ({
    page,
  }) => {
    await page.goto("/loop");
    await expect(page.getByTestId(LOOP.mevModeSelector)).toBeVisible();
    await expect(page.getByTestId(LOOP.mevModeOptionPrivate)).toBeVisible();
    // PRIVATE_BUILDER is default → no waiver section.
    await expect(page.getByTestId(LOOP.mevWaiverSection)).toHaveCount(0);
  });

  test("each mode shows enum-name + plain-language subtitle", async ({
    page,
  }) => {
    await page.goto("/loop");
    for (const id of [
      LOOP.mevModeOptionPrivate,
      LOOP.mevModeOptionPublic,
      LOOP.mevModeOptionSequencer,
      LOOP.mevModeOptionSealed,
    ]) {
      const option = page.getByTestId(id);
      await expect(option).toBeVisible();
      // Each option text contains the enum NAME verbatim.
      const text = await option.textContent();
      expect(text).toMatch(
        /PRIVATE_BUILDER|PUBLIC|SEQUENCER_DIRECT_FAILOPEN|SEALED_AUCTION/,
      );
    }
  });

  test("selecting PUBLIC reveals waiver section with blocked sign banner", async ({
    page,
  }) => {
    await page.goto("/loop");
    await page
      .getByTestId(LOOP.mevModeOptionPublic)
      .locator("input")
      .click();
    await expect(page.getByTestId(LOOP.mevWaiverSection)).toBeVisible();
    // Until the user checks the required waiver, the blocked alert shows.
    await expect(page.getByTestId(LOOP.mevWaiverBlocked)).toBeVisible();
  });

  test("checking the required waiver bit clears the blocked alert", async ({
    page,
  }) => {
    await page.goto("/loop");
    await page
      .getByTestId(LOOP.mevModeOptionPublic)
      .locator("input")
      .click();
    await expect(page.getByTestId(LOOP.mevWaiverSection)).toBeVisible();

    // Check every per-bit row inside mev-waiver-checklist.
    const rows = page.locator("[data-testid^=per-bit-checklist-row-]");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      await rows.nth(i).locator("input").click();
    }

    // Blocked alert is gone.
    await expect(page.getByTestId(LOOP.mevWaiverBlocked)).toHaveCount(0);
  });

  test("MevModeSelector exposes data-mode + data-waivers-ok attributes", async ({
    page,
  }) => {
    await page.goto("/loop");
    const sel = page.getByTestId(LOOP.mevModeSelector);
    await expect(sel).toHaveAttribute("data-mode", "PRIVATE_BUILDER");
    await expect(sel).toHaveAttribute("data-waivers-ok", "true");
  });
});
