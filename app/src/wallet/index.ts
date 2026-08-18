// Public surface of app/src/wallet/. The rest of `app/src/` imports from here,
// not from `connectkit` or `wagmi` directly — that keeps the wallet trust
// surface auditable in one place.

export { WalletProvider } from "./WalletProvider.js";
export { wagmiConfig, CHAIN_ID_BASE } from "./config.js";
export { configuredChainLabel } from "../lib/chain.js";
export {
  useErc20Allowance,
  useErc20Balance,
  useApproveErc20,
  formatTokenAmount,
} from "./tokens.js";
export {
  useConnectedAccount,
  useConnectedChainId,
  useChainSwitch,
} from "./hooks.js";
export { signAndAttachAction, broadcastTx } from "./sign.js";
export type { SignAndAttachResult } from "./sign.js";
export { ConnectWalletButton } from "./ConnectWalletButton.js";
