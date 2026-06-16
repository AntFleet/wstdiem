// §13.4 row: Wrong-chain handling.
//
// Acceptance: when the connected wallet's chain != registry.chainId,
// the WalletPill renders as "Switch to Base" and the sign button is
// blocked. The pill is wallet-gated so for this env we only assert the
// disconnect chip (and confirm the wrong-chain testid pattern is wired).

import { expect, test } from "@playwright/test";
import { HEADER } from "./fixtures/selectors.js";

test.describe("Wrong-chain handling (§13.4 row 15)", () => {
  test("disconnect chip visible in header by default", async ({ page }) => {
    await page.goto("/markets");
    await expect(page.getByTestId(HEADER.walletDisconnect)).toBeVisible();
  });

  test.fixme(
    "switching to a wrong chain renders the wallet-wrong-chain pill",
    async ({ page }) => {
      // FIXME deferred: needs real wallet + chain-switch round-trip.
      // The hook useChainPin returns wrongChain=true when the wallet's
      // chainId != expected; WalletPill renders the data-testid=
      // 'wallet-wrong-chain' button. This is exercised in unit tests
      // for useChainPin but the wallet-bridged render flow needs a real
      // wallet connect.
      await page.goto("/markets");
      await expect(page.getByTestId(HEADER.walletWrongChain)).toBeVisible();
    },
  );

  test.fixme(
    "sign button refuses on wrong chain with WRONG_CHAIN reason",
    async () => {
      // FIXME deferred: wrong-chain reason surfaces inline via
      // preview-sign-override-reason. Tested in builder.spec.ts as
      // fixme'd — needs real wallet.
    },
  );
});
