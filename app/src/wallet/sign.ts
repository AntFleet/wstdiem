// Wallet sign + attachSignature helper.
//
// This is the canonical sign-flow entry. It is the only place in the app
// that calls into `wagmi/actions.signTypedData` — every screen
// (LoopBuilder / Positions / Automation) routes through here so the SDK's
// digest-assembly + attachSignature contract is the single audited path.

import {
  sendTransaction as wagmiSendTransaction,
  signTypedData as wagmiSignTypedData,
} from "wagmi/actions";
import type {
  Action,
  ActionDigest,
  Address,
  Hex,
  WstdiemSdk,
} from "@wstdiem/sdk";
import { wagmiConfig } from "./config.js";

export interface SignAndAttachResult {
  to: Address;
  data: Hex;
  value: bigint;
  digest: ActionDigest;
}

interface SignAndAttachArgs {
  sdk: WstdiemSdk;
  action: Action;
}

/** End-to-end: SDK.buildAuthorization → wallet.signTypedData → SDK
 * .attachSignature. Returns the broadcast-ready tx payload. */
export async function signAndAttachAction(
  args: SignAndAttachArgs,
): Promise<SignAndAttachResult> {
  const built = await args.sdk.buildTransaction(args.action);
  // Prefer typed data from the same assembly that produced the digest so
  // chain advancement between build and attach cannot QuoteDrift.
  const typedData =
    "typedData" in built && built.typedData
      ? built.typedData
      : (await args.sdk.buildAuthorization(args.action)).typedData;
  const signature = (await wagmiSignTypedData(wagmiConfig, {
    account: undefined as unknown as Address,
    ...(typedData as object),
  } as Parameters<typeof wagmiSignTypedData>[1])) as Hex;
  return args.sdk.attachSignature(args.action, signature, built.digest, {
    pinnedBlockNumber: built.pinnedBlockNumber,
  });
}

/** Broadcast a signed action's calldata via the connected wallet. Kept inside
 * `app/src/wallet/` so `wagmi/actions` stays the single audited transaction
 * surface. Returns the broadcast transaction hash. */
export async function broadcastTx(tx: SignAndAttachResult): Promise<Hex> {
  return (await wagmiSendTransaction(wagmiConfig, {
    to: tx.to,
    data: tx.data,
    value: tx.value,
  })) as Hex;
}
