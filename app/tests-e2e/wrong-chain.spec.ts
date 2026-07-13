// §13.4 row: Wrong-chain handling.

import { expect, test } from "@playwright/test";
import { HEADER } from "./fixtures/selectors.js";
import { installMockWallet, liveE2eEnabled } from "./fixtures/mock-wallet.js";

test.describe("Wrong-chain handling (§13.4 row 15)", () => {
  test("disconnect chip visible in header by default", async ({ page }) => {
    await page.goto("/markets");
    await expect(page.getByTestId(HEADER.walletDisconnect)).toBeVisible();
  });

  test("mock wallet on wrong chainId is injectable", async ({ page }) => {
    // Inject chain 1 (Ethereum) while app expects Base 8453.
    await installMockWallet(page, { chainIdHex: "0x1" });
    await page.goto("/markets");
    const chainId = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).ethereum.request({ method: "eth_chainId" });
    });
    expect(chainId).toBe("0x1");
  });

  test("wallet-wrong-chain pill after connect requires LIVE_E2E + ConnectKit", async ({
    page,
  }) => {
    test.skip(
      !liveE2eEnabled(),
      "Full ConnectKit connect + wrong-chain pill needs LIVE_E2E harness",
    );
    await installMockWallet(page, { chainIdHex: "0x1" });
    await page.goto("/markets");
    await expect(page.getByTestId(HEADER.walletWrongChain)).toBeVisible({
      timeout: 30_000,
    });
  });
});
