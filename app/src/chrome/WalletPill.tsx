// WalletPill — connected / disconnected / wrong-chain states.
//
// Sits in the persistent header. Wrong-chain is the most important state to
// surface — per §13.4 + persistent header acceptance, the chain pin is the
// first defense against signing on a chain the registry doesn't recognize.

import { ConnectKitButton } from "connectkit";
import {
  CHAIN_ID_BASE,
  useConnectedAccount as useAccount,
  useConnectedChainId as useChainId,
  useChainSwitch as useSwitchChain,
} from "../wallet/index.js";

function truncate(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletPill(): JSX.Element {
  const account = useAccount();
  const chainId = useChainId();
  const switchChain = useSwitchChain();
  const onWrongChain = account.isConnected && chainId !== CHAIN_ID_BASE;

  if (onWrongChain) {
    return (
      <button
        type="button"
        onClick={() => {
          switchChain.switchChain({ chainId: CHAIN_ID_BASE });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-risk-red/60 bg-risk-red/10 px-2.5 py-1 text-xs text-risk-red hover:bg-risk-red/20 focus:outline-none focus:ring-2 focus:ring-risk-red/50"
        data-testid="wallet-wrong-chain"
        aria-label="Wrong chain — switch to Base"
      >
        <span aria-hidden="true">⚠</span>
        <span>Switch to Base</span>
      </button>
    );
  }

  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, address, ensName }) => (
        <button
          type="button"
          onClick={show}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted hover:text-text hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
          data-testid={isConnected ? "wallet-connected" : "wallet-disconnect"}
          aria-label={isConnected ? "Wallet menu" : "Connect wallet"}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${
              isConnected ? "bg-risk-green" : "bg-text-muted/50"
            }`}
          />
          <span className="font-mono">
            {isConnected
              ? ensName ?? truncate(address ?? "0x0")
              : "Connect wallet"}
          </span>
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}
