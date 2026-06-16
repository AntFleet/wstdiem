// Public surface of app/src/wallet/. The rest of `app/src/` imports from here,
// not from `connectkit` or `wagmi` directly — that keeps the wallet trust
// surface auditable in one place.

export { WalletProvider } from "./WalletProvider.js";
export { wagmiConfig, CHAIN_ID_BASE } from "./config.js";
export {
  useConnectedAccount,
  useConnectedChainId,
  useChainSwitch,
} from "./hooks.js";
export { signAndAttachAction } from "./sign.js";
export type { SignAndAttachResult } from "./sign.js";
