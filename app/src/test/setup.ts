import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Pin VITE_CONTRACT_* envs to the canonical test addresses used by
// component fixtures. The C-1 closure in ForceExitConfirmPanel.tsx +
// PreviewDrawer.tsx resolves the authorizer NAME from these envs — the
// test fixtures (`buildPreview` / `buildForceExitAction`) use a
// distinct canonical address per authorizer so a matching env lets the
// non-mismatch path render cleanly.
// LoopAuthorization is bound to verifyingContract=0x22…22 (Open / Rebalance / Exit).
// LoopForceExitAuthorizer is bound to verifyingContract=0x33…33 (ForceExit).
// Tests that exercise the MISMATCH branch use a different verifyingContract
// (zero address or a distinct 0xff…ff) on the action.
// The `vite-env.d.ts` ImportMetaEnv declares these as readonly; cast to
// a mutable shape so the runtime stub respects the declared types.
const env = import.meta.env as Record<string, string | undefined>;
env.VITE_CONTRACT_LOOP_AUTHORIZATION =
  "0x2222222222222222222222222222222222222222";
env.VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER =
  "0x3333333333333333333333333333333333333333";

// vitest.config.ts has `globals: false`, so @testing-library/react's auto
// cleanup (which fires on a global afterEach) doesn't trigger. Wire it up
// manually so each test starts with an empty body — otherwise getByTestId
// finds matches from prior renders.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia by default — wagmi/ConnectKit don't use
// it in our happy path, but ThemeToggle's prefers-color-scheme detection
// might. Stub it to a sensible default.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
