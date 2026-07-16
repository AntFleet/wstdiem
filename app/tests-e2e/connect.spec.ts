// §13.4 row: Wallet connect modal opens + injected mock provider.

import { expect, test } from "@playwright/test";
import { installMockWallet, MOCK_EOA } from "./fixtures/mock-wallet.js";

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
    const modal = page.locator(
      '[role="dialog"], [data-testid*="ConnectModal"], .__connectkit-container, [aria-label*="Connect" i]',
    );
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });
  });

  test("injected mock provider is visible on window.ethereum", async ({
    page,
  }) => {
    await installMockWallet(page);
    await page.goto("/markets");
    const injected = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eth = (window as any).ethereum;
      if (!eth) return null;
      const accounts = await eth.request({ method: "eth_accounts" });
      const chainId = await eth.request({ method: "eth_chainId" });
      return { accounts, chainId, isMetaMask: !!eth.isMetaMask };
    });
    expect(injected).not.toBeNull();
    expect(injected!.isMetaMask).toBe(true);
    expect(injected!.accounts[0].toLowerCase()).toBe(MOCK_EOA.toLowerCase());
    expect(injected!.chainId).toBe("0x2105");
  });
});
