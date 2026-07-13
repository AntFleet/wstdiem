/**
 * D-2: inject a minimal EIP-1193 provider so action-path specs can exercise
 * connect / account / chainId without a browser extension.
 *
 * This does NOT fully implement signTypedData→broadcast E2E against Anvil;
 * it unblocks UI paths that only need `eth_accounts` + `eth_chainId` + a
 * deterministic address. Full funded-broadcast remains behind LIVE_E2E=1.
 */
import type { Page } from "@playwright/test";

export const MOCK_EOA = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const MOCK_CHAIN_ID_HEX = "0x14a34"; // 84532 Base Sepolia — override via opts

export interface MockWalletOpts {
  address?: string;
  chainIdHex?: string;
  /** When true, eth_requestAccounts rejects (for connect-failure specs). */
  rejectConnect?: boolean;
}

export async function installMockWallet(
  page: Page,
  opts: MockWalletOpts = {},
): Promise<void> {
  const address = opts.address ?? MOCK_EOA;
  const chainIdHex = opts.chainIdHex ?? "0x2105"; // 8453 Base mainnet matches playwright env
  const rejectConnect = opts.rejectConnect ?? false;

  await page.addInitScript(
    ({ address, chainIdHex, rejectConnect }) => {
      const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
      const provider = {
        isMetaMask: true,
        selectedAddress: address,
        chainId: chainIdHex,
        networkVersion: String(parseInt(chainIdHex, 16)),
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              if (rejectConnect) {
                throw Object.assign(new Error("User rejected"), { code: 4001 });
              }
              return [address];
            case "eth_chainId":
              return chainIdHex;
            case "net_version":
              return String(parseInt(chainIdHex, 16));
            case "personal_sign":
            case "eth_sign":
            case "eth_signTypedData":
            case "eth_signTypedData_v4":
              // Deterministic fake sig (65 bytes hex) for UI paths that only
              // check signature length / presence.
              return (
                "0x" +
                "ab".repeat(32) +
                "cd".repeat(32) +
                "1b"
              );
            case "eth_sendTransaction":
              return "0x" + "11".repeat(32);
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              if (params && Array.isArray(params) && params[0] && typeof params[0] === "object") {
                const p = params[0] as { chainId?: string };
                if (p.chainId) provider.chainId = p.chainId;
              }
              return null;
            default:
              // Soft-fail unknown methods so wagmi probes do not crash the page.
              return null;
          }
        },
        on: (event: string, cb: (...a: unknown[]) => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(cb);
        },
        removeListener: (event: string, cb: (...a: unknown[]) => void) => {
          listeners.get(event)?.delete(cb);
        },
        emit: (event: string, ...args: unknown[]) => {
          for (const cb of listeners.get(event) ?? []) cb(...args);
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).ethereum = provider;
    },
    { address, chainIdHex, rejectConnect },
  );
}

/** True when CI/local has LIVE_E2E=1 for real Anvil/Sepolia broadcast tests. */
export function liveE2eEnabled(): boolean {
  return process.env.LIVE_E2E === "1" || process.env.LIVE_E2E === "true";
}
