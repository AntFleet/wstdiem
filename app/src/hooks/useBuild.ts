// useBuild — wraps sdk.buildAuthorization + buildTransaction + attachSignature.
//
// The flow:
//   1. usePreview produces TransactionPreview from current inputs.
//   2. User clicks Sign → useBuild.buildAuthorization(action) produces
//      typed-data + digest + evidence.
//   3. App calls wallet.signTypedData(typedData) → signature.
//   4. useBuild.attachSignature(action, signature, expectedDigest,
//      pinnedBlockNumber) → calldata ready to broadcast.

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type {
  Action,
  ActionDigest,
  Address,
  BlockNumber,
  Hex,
} from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

interface BuildAuthorizationResult {
  typedData: unknown;
  digest: ActionDigest;
}

interface BuildTransactionResult {
  to: Address;
  data: Hex;
  value: bigint;
  digest: ActionDigest;
  pinnedBlockNumber: BlockNumber;
}

interface AttachSignatureArgs {
  action: Action;
  signature: Hex;
  expectedDigest?: ActionDigest;
  pinnedBlockNumber?: BlockNumber;
}

interface UseBuildResult {
  buildAuthorization: UseMutationResult<BuildAuthorizationResult, Error, Action>;
  buildTransaction: UseMutationResult<BuildTransactionResult, Error, Action>;
  attachSignature: UseMutationResult<
    { to: Address; data: Hex; value: bigint; digest: ActionDigest },
    Error,
    AttachSignatureArgs
  >;
}

export function useBuild(): UseBuildResult {
  const { sdk } = useSdk();
  const buildAuthorization = useMutation<
    BuildAuthorizationResult,
    Error,
    Action
  >({
    mutationFn: async (action) => {
      const r = await sdk.buildAuthorization(action);
      return { typedData: r.typedData, digest: r.digest };
    },
  });
  const buildTransaction = useMutation<BuildTransactionResult, Error, Action>({
    mutationFn: async (action) => {
      const r = (await sdk.buildTransaction(action)) as BuildTransactionResult;
      return r;
    },
  });
  const attachSignature = useMutation<
    { to: Address; data: Hex; value: bigint; digest: ActionDigest },
    Error,
    AttachSignatureArgs
  >({
    mutationFn: async ({
      action,
      signature,
      expectedDigest,
      pinnedBlockNumber,
    }) => {
      // PR-17 closure: attachSignature is on the canonical WstdiemSdk
      // interface, returning {to, data, value: 0n, digest}. The previous
      // runtime feature-detect cast collapsed here.
      const opts = pinnedBlockNumber !== undefined ? { pinnedBlockNumber } : undefined;
      return sdk.attachSignature(action, signature, expectedDigest, opts);
    },
  });
  return { buildAuthorization, buildTransaction, attachSignature };
}
