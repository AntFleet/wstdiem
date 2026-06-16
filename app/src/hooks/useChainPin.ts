// useChainPin — surfaces wrong-chain state for the LoopBuilder sign gate.
//
// Header WalletPill renders the "Switch to Base" CTA; the builder's sign
// button reads this hook to refuse to enable when on the wrong chain.

import {
  CHAIN_ID_BASE,
  useConnectedChainId as useChainId,
} from "../wallet/index.js";

interface ChainPinStatus {
  expected: number;
  current: number;
  wrongChain: boolean;
}

export function useChainPin(): ChainPinStatus {
  const current = useChainId();
  return {
    expected: CHAIN_ID_BASE,
    current,
    wrongChain: current !== CHAIN_ID_BASE,
  };
}
