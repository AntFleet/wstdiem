// Env-override helper for the phishing-defeat suite.
//
// The C-1 force-exit phishing-defeat acceptance row requires demonstrating
// BOTH the happy path (verifyingContract matches the env-pinned
// LoopForceExitAuthorizer, NAME resolves correctly) AND the mismatch path
// (verifyingContract points elsewhere, banner + sign-refusal fires).
//
// Vite injects `import.meta.env.VITE_*` at compile time in dev/HMR mode,
// so flipping the value at runtime would not be picked up by the bundle.
// Solution: Playwright launches a SECOND vite dev server on a different
// port with the env-flipped values, and the mismatch spec drives that
// origin via a project override.
//
// `playwright.config.ts` declares two webServers and two projects:
//   - default (5173): matched verifyingContract (happy path)
//   - phishing (5174): mismatched verifyingContract (sign-refusal)
//
// Specs decide which origin to use by setting `testMatch` glob or by tag.

export const ORIGIN_MATCHED = "http://127.0.0.1:5173";
export const ORIGIN_MISMATCHED = "http://127.0.0.1:5174";

// Constants that mirror playwright.config.ts webServer env. Tests assert
// against these to confirm the right harness booted.
export const MATCHED_FORCE_EXIT_AUTHORIZER =
  "0x3333333333333333333333333333333333333333";
export const MATCHED_LOOP_AUTHORIZATION =
  "0x2222222222222222222222222222222222222222";
export const MATCHED_FORCE_EXIT_EXECUTOR =
  "0x5555555555555555555555555555555555555555";

// The phishing scenario flips the FORCE_EXIT_AUTHORIZER env to a different
// address from the syntheticForceExit's verifyingContract. The synthesised
// action in Positions.tsx reads `verifyingContractEnv` from the SAME env
// that authorizerNameFor() compares against — so flipping the env alone
// would not produce a NAME mismatch (the action and the matcher would both
// point at the flipped address). The mismatch we need to demonstrate is
// that the FORCE_EXIT_AUTHORIZER env address is NOT the canonical address
// the action's verifyingContract points to.
//
// In the mismatched harness we set:
//   - VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER = the WRONG address
//     (zero / unrecognized) so authorizerNameFor() returns "UNRECOGNIZED"
//     against the same action.verifyingContract — synthesised action falls
//     back to ZERO when env is missing, surfacing the mismatch banner.
//
// The alternative scenario covered: VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER
// is set to the LoopAuthorization address — authorizerNameFor returns
// "LoopAuthorization" while expectedAuthorizerFor("ForceExit") returns
// "LoopForceExitAuthorizer" → mismatch banner + sign-refusal.
export const MISMATCH_FORCE_EXIT_AUTHORIZER_UNSET = "";
export const MISMATCH_FORCE_EXIT_AUTHORIZER_WRONG_NAME =
  // Same address as LoopAuthorization so the resolved name comes back
  // "LoopAuthorization" instead of "LoopForceExitAuthorizer".
  MATCHED_LOOP_AUTHORIZATION;
