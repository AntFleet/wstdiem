// §13.4 row 12 + row 19 — Phishing test (force-exit disguised as exit).
//
// THE C-1 PHISHING-DEFEAT TEST. This file runs against the :5174 webServer
// in playwright.config.ts where VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER is
// FLIPPED to the same address as VITE_CONTRACT_LOOP_AUTHORIZATION. The
// resolved authorizer NAME becomes "LoopAuthorization" while
// expectedAuthorizerFor("ForceExit") returns "LoopForceExitAuthorizer" —
// mismatch banner fires + sign-button refused regardless of dwell /
// per-bit / typed-confirm state.
//
// This is the most important audit signal in PR-16: a misconfigured
// deployment, an attacker-served bundle, or an env-override exploit
// cannot bypass the typed-data contract pin.

import { expect, test } from "@playwright/test";
import { FORCE_EXIT } from "./fixtures/selectors.js";
import { MISMATCH_FORCE_EXIT_AUTHORIZER_WRONG_NAME } from "./fixtures/env-overrides.js";

test.describe("Force-Exit C-1 phishing-defeat — mismatch path (:5174)", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
    await page.goto("/dev/force-exit");
    await expect(page.getByTestId("dev-force-exit-page")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("harness picked up the flipped env", async ({ page }) => {
    await expect(
      page.getByTestId("dev-force-exit-verifying-contract"),
    ).toContainText(MISMATCH_FORCE_EXIT_AUTHORIZER_WRONG_NAME);
  });

  test("opening the panel surfaces the authorizer-mismatch banner", async ({
    page,
  }) => {
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();

    // The authorizer-mismatch banner is the C-1 closure proof. It must
    // surface with role="alert" so screen readers + bots both pick it up.
    const mismatch = page.getByTestId(FORCE_EXIT.authorizerMismatch);
    await expect(mismatch).toBeVisible();
    await expect(mismatch).toHaveAttribute("role", "alert");

    // Resolved authorizer name renders the WRONG name (LoopAuthorization
    // instead of LoopForceExitAuthorizer).
    await expect(page.getByTestId(FORCE_EXIT.resolvedAuthorizer)).toContainText(
      "LoopAuthorization",
    );
    await expect(mismatch).toContainText("LoopForceExitAuthorizer");
  });

  test("sign button is DISABLED even after every local gate clears", async ({
    page,
  }) => {
    test.setTimeout(15_000);
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();

    // Try to drive every LOCAL gate to "passing": check every per-bit
    // row, type the literal token, wait out the dwell countdown.
    const rows = page.locator("[data-testid^=per-bit-checklist-row-]");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await rows.nth(i).locator("input").click();
    }
    await page.getByPlaceholder("FORCE-EXIT").fill("FORCE-EXIT");

    // Even after dwell countdown elapses, sign stays disabled because of
    // the authorizer mismatch (data-authorizer-mismatch=true overrides
    // every local gate).
    await page.waitForTimeout(3_500);

    const signBtn = page.getByTestId(FORCE_EXIT.signButton);
    await expect(signBtn).toBeDisabled();
    await expect(signBtn).toHaveAttribute(
      "data-authorizer-mismatch",
      "true",
    );
    await expect(signBtn).toHaveAttribute("data-enabled", "false");
  });

  test("phishing banner still shows the resolved (wrong) name + warns the user", async ({
    page,
  }) => {
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId(FORCE_EXIT.panel)).toBeVisible();

    // The phishing banner ALWAYS renders the resolved name. On the
    // mismatch path the user sees "LoopAuthorization" (the WRONG name
    // for a ForceExit). The anti-phishing prose tells them this is
    // unexpected and points them to abort.
    await expect(page.getByTestId(FORCE_EXIT.resolvedName)).toContainText(
      "LoopAuthorization",
    );
    const phishing = page.getByTestId(FORCE_EXIT.phishingBanner);
    await expect(phishing).toContainText("not interchangeable");
    await expect(phishing).toContainText("abort");
  });
});
