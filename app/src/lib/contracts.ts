// Authorizer NAME resolution from VITE_CONTRACT_* envs.
//
// C-1 closure: the force-exit phishing banner previously rendered the literal
// string "LoopForceExitAuthorizer" regardless of the action's
// verifyingContract value. An attacker who substituted a `LoopAuthorization`
// address into a force-exit-styled flow would render the bold
// "LoopForceExitAuthorizer" label, defeating the user's only visual signal.
//
// This module resolves the NAME from the address by comparing against the
// registry-pinned env vars VITE_CONTRACT_LOOP_AUTHORIZATION +
// VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER. When neither matches, the result
// is "UNRECOGNIZED" — the caller is responsible for surfacing the mismatch
// as a blocker.

import type { Address } from "viem";

function z(a: string | undefined): string {
  return (a ?? "").toLowerCase();
}

const ZERO = "0x0000000000000000000000000000000000000000";

export type AuthorizerName =
  | "LoopAuthorization"
  | "LoopForceExitAuthorizer"
  | "UNRECOGNIZED";

/** Resolve the canonical authorizer NAME from the given verifyingContract
 * address. Returns "UNRECOGNIZED" when the address is zero, empty, or does
 * not match a configured VITE_CONTRACT_* env. */
export function authorizerNameFor(
  verifyingContract: Address | string | undefined,
): AuthorizerName {
  const vc = z(verifyingContract);
  if (vc === ZERO || vc === "") return "UNRECOGNIZED";
  const auth = z(import.meta.env.VITE_CONTRACT_LOOP_AUTHORIZATION);
  const force = z(import.meta.env.VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER);
  if (auth !== "" && auth !== ZERO && vc === auth) return "LoopAuthorization";
  if (force !== "" && force !== ZERO && vc === force) {
    return "LoopForceExitAuthorizer";
  }
  return "UNRECOGNIZED";
}

/** Which authorizer NAME a given action.primaryType is EXPECTED to resolve
 * against. ForceExit → LoopForceExitAuthorizer; everything else →
 * LoopAuthorization. */
export function expectedAuthorizerFor(primaryType: string): AuthorizerName {
  return primaryType === "ForceExit"
    ? "LoopForceExitAuthorizer"
    : "LoopAuthorization";
}

/** Convenience: true when the verifyingContract address resolves to the
 * authorizer NAME the primaryType implies. */
export function isAuthorizerMatching(
  primaryType: string,
  verifyingContract: Address | string | undefined,
): boolean {
  const expected = expectedAuthorizerFor(primaryType);
  const actual = authorizerNameFor(verifyingContract);
  return expected === actual;
}
