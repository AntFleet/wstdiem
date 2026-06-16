// useRevoke — wraps sdk.revokeAuthorization. The only one-click action
// site-wide per synthesis C.2 (revoke is the safe direction; §7.1 always
// allowed).

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type {
  ActionDigest,
  Address,
  Hex,
  PolicyId,
} from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";

interface RevokeArgs {
  target: PolicyId | ActionDigest;
}

interface RevokeResult {
  typedData: unknown;
  transaction: { to: Address; data: Hex };
}

export function useRevoke(): UseMutationResult<RevokeResult, Error, RevokeArgs> {
  const { sdk } = useSdk();
  return useMutation<RevokeResult, Error, RevokeArgs>({
    mutationFn: ({ target }) => sdk.revokeAuthorization(target),
  });
}
