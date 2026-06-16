// Combined wagmi + ConnectKit provider. Single-purpose so the audit reviewer
// can find the entire wallet trust surface in one file.

import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { ConnectKitProvider } from "connectkit";
import { wagmiConfig } from "./config.js";

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps): JSX.Element {
  return (
    <WagmiProvider config={wagmiConfig}>
      <ConnectKitProvider
        // Theme alignment with synthesis G.2 (dark default). ConnectKit's
        // theme is picked at render-time; we let it follow the document's
        // [data-theme] attribute via custom variables.
        mode="auto"
        options={{
          // §6.3 phishing-resistance posture — no "instant" connect flows that
          // hide the wallet origin. Force explicit chain-pin to Base.
          enforceSupportedChains: true,
          initialChainId: 8453,
          hideBalance: false,
          hideTooltips: false,
        }}
      >
        {children}
      </ConnectKitProvider>
    </WagmiProvider>
  );
}
