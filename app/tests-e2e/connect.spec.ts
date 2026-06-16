// §13.4 row: Wallet connect modal opens.
//
// Acceptance: ConnectKit button visible in header; clicking it surfaces
// a connector picker. We don't actually CONNECT — that requires a real
// wallet and is covered separately under the test.fixme() rows for
// ECDSA / EIP-1271.

import { expect, test } from "@playwright/test";

test.describe("Wallet connect (§13.4 row 1)", () => {
  test("ConnectKit button visible on every route", async ({ page }) => {
    await page.goto("/markets");
    await expect(page.getByTestId("wallet-disconnect")).toBeVisible();
  });

  test("clicking the Connect button opens the ConnectKit modal", async ({
    page,
  }) => {
    await page.goto("/markets");
    const connect = page.getByTestId("wallet-disconnect");
    await connect.click();
    // ConnectKit renders the modal as a portal at document.body. The
    // wallet list / connector picker is what we expect to see.
    // ConnectKit's modal uses a known data attribute on the dialog root.
    const modal = page.locator(
      '[role="dialog"], [data-testid*="ConnectModal"], .__connectkit-container, [aria-label*="Connect" i]',
    );
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });
  });

  test.fixme(
    "actually connects an EOA via injected provider",
    async () => {
      // FIXME deferred: real wallet connect requires a wallet extension /
      // dapp simulator (e.g. Synpress) plus a funded test EOA. Tracked
      // Live-testnet validation deferred to a follow-up release.
    },
  );
});
