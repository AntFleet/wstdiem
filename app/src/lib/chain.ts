// Resolve the app's pinned chain from VITE_CHAIN_ID.
// Tests leave the env unset and stay on Base mainnet so existing fixtures hold.

import { base, baseSepolia, type Chain } from "viem/chains";

const FALLBACK_CHAIN_ID = base.id;

export function configuredChainId(): number {
  const raw = Number(import.meta.env.VITE_CHAIN_ID ?? FALLBACK_CHAIN_ID);
  return Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_CHAIN_ID;
}

export function configuredChain(): Chain {
  return configuredChainId() === baseSepolia.id ? baseSepolia : base;
}

export function configuredChainLabel(): string {
  return configuredChainId() === baseSepolia.id ? "Base Sepolia" : "Base";
}
