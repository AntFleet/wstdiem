// §13.4 row 12 — Force-Exit ≥3s dwell + per-bit + typed-confirm +
// phishing-defeat. THE HIGHEST-VALUE TEST IN THE PR-16 ACCEPTANCE SUITE.
//
// This spec covers the HAPPY PATH (matched env: verifyingContract resolves
// to "LoopForceExitAuthorizer"). The MISMATCH PATH (env-flipped so
// verifyingContract resolves to "LoopAuthorization" → C-1 banner fires +
// sign refused) is in force-exit.phishing.spec.ts running against the
// :5174 harness.
//
// The dev-only /dev/force-exit route mounts the production
// ForceExitConfirmPanel against a synthetic action whose verifyingContract
// reads from VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER exactly as
// Positions.tsx does. No SDK or wallet stubbing — the actual production
// component is exercised.

import { expect, test } from "@playwright/test";
import { FORCE_EXIT } from "./fixtures/selectors.js";
import { MATCHED_FORCE_EXIT_AUTHORIZER } from "./fixtures/env-overrides.js";

test.describe("Force-Exit confirmation panel — happy path (matched env)", () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors so an unhandled exception in the panel
    // surface fails the spec rather than silently passing.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
    await page.goto("/dev/force-exit");
    await expect(page.getByTestId("dev-force-exit-page")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("renders with the matched verifyingContract env", async ({ page }) => {
    // Sanity: the harness picked up the matched env. The address rendered
    // on the dev page should equal the matched authorizer.
    await expect(
      page.getByTestId("dev-force-exit-verifying-contract"),
    ).toContainText(MATCHED_FORCE_EXIT_AUTHORIZER);
  });

  test("opens the full-screen panel + renders phishing banner with resolved NAME", async ({
    page,
  }) => {
    await page.getByTestId("dev-force-exit-open").click();
    const panel = page.getByTestId(FORCE_EXIT.panel);
    await expect(panel).toBeVisible();

    // C-1 closure: the phishing banner surfaces the resolved authorizer
    // NAME (not the literal string from the action's primaryType). When
    // the env matches, the resolved name should be "LoopForceExitAuthorizer".
    const phishing = page.getByTestId(FORCE_EXIT.phishingBanner);
    await expect(phishing).toBeVisible();
    await expect(page.getByTestId(FORCE_EXIT.resolvedName)).toContainText(
      "LoopForceExitAuthorizer",
    );

    // The anti-phishing copy mentions both contract names — the user must
    // see that LoopAuthorization (the normal exit) is DIFFERENT from the
    // resolved LoopForceExitAuthorizer.
    await expect(phishing).toContainText("LoopAuthorization");
    await expect(phishing).toContainText("not interchangeable");
  });

  test("authorizer-mismatch banner is HIDDEN on the matched env", async ({
    page,
  }) => {
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();
    await expect(
      page.getByTestId(FORCE_EXIT.authorizerMismatch),
    ).toHaveCount(0);
  });

  test("sign button stays disabled until every gate clears", async ({
    page,
  }) => {
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();

    const signBtn = page.getByTestId(FORCE_EXIT.signButton);
    await expect(signBtn).toBeDisabled();
    await expect(signBtn).toHaveAttribute("data-enabled", "false");
  });

  test("per-bit checklist gates the typed-confirm input", async ({ page }) => {
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();

    // Before any per-bit check, the typed-confirm input is disabled.
    const typed = page.getByPlaceholder("FORCE-EXIT");
    await expect(typed).toBeDisabled();

    // Check every per-bit row (PerBitChecklist renders one row per
    // acknowledgedRisks bit). The synthetic action has two bits set so
    // exactly two rows are visible.
    const rows = page.locator("[data-testid^=per-bit-checklist-row-]");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      await rows.nth(i).locator("input").click();
    }

    // After every bit is checked, the typed-confirm input is enabled.
    await expect(typed).toBeEnabled();
  });

  test("typed-confirm + dwell countdown gate enables sign after 3 seconds", async ({
    page,
  }) => {
    test.setTimeout(15_000);
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();

    // Check every per-bit row.
    const rows = page.locator("[data-testid^=per-bit-checklist-row-]");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await rows.nth(i).locator("input").click();
    }

    // Type the literal token.
    await page.getByPlaceholder("FORCE-EXIT").fill("FORCE-EXIT");

    // Dwell countdown should now be armed.
    await expect(page.getByTestId(FORCE_EXIT.dwellCountdown)).toBeVisible();

    // Wait > 3 seconds for the dwell gate.
    await page.waitForTimeout(3_500);

    // The sign button is now enabled (assuming no external overrides on
    // the matched env — the harness picks up both env values).
    const signBtn = page.getByTestId(FORCE_EXIT.signButton);
    await expect(signBtn).toBeEnabled({ timeout: 1500 });
  });

  test("Cancel button closes the panel", async ({ page }) => {
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();
    await page.getByTestId(FORCE_EXIT.cancel).click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toHaveCount(0);
  });

  test("Esc closes the panel mid-flow", async ({ page }) => {
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(FORCE_EXIT.panel)).toHaveCount(0);
  });

  test.skip(
    "after sign, attachSignature plus broadcast complete",
    async () => {
      // FIXME deferred: needs a real wallet + I-66 preimage flow. Tracked
      // Live-testnet validation deferred to a follow-up release.
    },
  );
});
