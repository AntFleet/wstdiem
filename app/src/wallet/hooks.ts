// Wallet hook wrappers.
//
// M-3 closure: the PR-16 build prompt explicitly states "The app does NOT
// call viem or fetch directly except inside `app/src/wallet/`". Direct
// `wagmi` imports outside this module are READ-ONLY today, but create
// surface for a future executor to add `useSignTypedData` and bypass the
// SDK's digest assembly + `attachSignature` contract.
//
// Every component that previously imported `useAccount` / `useChainId` /
// `useSwitchChain` from `wagmi` now imports from `app/src/wallet/index.ts`
// instead. This keeps the wallet trust surface auditable in one place.

import { useAccount, useChainId, useSwitchChain } from "wagmi";

export const useConnectedAccount = useAccount;
export const useConnectedChainId = useChainId;
export const useChainSwitch = useSwitchChain;
