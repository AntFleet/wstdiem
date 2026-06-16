// ConnectKit + wagmi v2 config. Picked in Phase 0 — see
// app/spike/WALLET-INTEGRATOR-DECISION.md.
//
// SDK boundary discipline: this file is the ONLY place in `app/src/` that may
// reach into viem / wagmi directly. Everything downstream of `useAccount()` and
// `useSignTypedData()` must round-trip through `@wstdiem/sdk` so the §13.5
// signing-flow audit reviews exactly one wallet entrypoint.

import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected, safe, walletConnect } from "wagmi/connectors";
import { getDefaultConfig } from "connectkit";

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!walletConnectProjectId) {
  // Fail-loud at dev-time. Production builds without this env var produce a
  // wallet pill that never opens — better to refuse to start than ship a
  // silently-broken signing surface.
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID is not set. ConnectKit will fall back to " +
      "an unauthenticated WalletConnect Cloud session — wallet pairing will fail. " +
      "Populate from https://cloud.walletconnect.com.",
  );
}

const rpc1 = import.meta.env.VITE_BASE_RPC_URL_1;
const rpc2 = import.meta.env.VITE_BASE_RPC_URL_2;
const rpc3 = import.meta.env.VITE_BASE_RPC_URL_3;

// Primary transport is whichever RPC the user populated first; the SDK reads
// from its own multi-PublicClient quorum (G-PM-3), so wagmi's transport is
// only the wallet-side fallback for chain reads inside the connector layer.
const primaryRpc = rpc1 ?? rpc2 ?? rpc3 ?? "https://mainnet.base.org";

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [base],
    transports: {
      [base.id]: http(primaryRpc),
    },
    connectors: [
      injected({ shimDisconnect: true }),
      coinbaseWallet({
        appName: "wstDIEM",
        // Coinbase Smart Wallet — counterfactual passkey accounts. Per Base
        // docs, the SDK's ERC-6492 unwrapping (viem.parseErc6492Signature)
        // handles the wrapper for counterfactual deploys. `all` keeps the EOA
        // path available for users who haven't onboarded a passkey.
        preference: { options: "all" },
      }),
      safe(),
      ...(walletConnectProjectId
        ? [
            walletConnect({
              projectId: walletConnectProjectId,
              showQrModal: false, // ConnectKit owns the QR rendering
            }),
          ]
        : []),
    ],
    walletConnectProjectId: walletConnectProjectId ?? "",
    appName: "wstDIEM",
    appDescription: "Evidence-backed leveraged DIEM loops on Base.",
    appUrl: "https://wstdiem.xyz",
    ssr: false, // G.9: static export — wagmi/ConnectKit run client-side only
  }),
);

export const CHAIN_ID_BASE = base.id;
