// §13.4 row: Authorize (ECDSA).
//
// ALL rows fixme'd — needs a funded test EOA + real signTypedData round-trip
// + broadcastTx into Base Sepolia. Tracked in PR-16-REPORT.md handoff
// Live-testnet validation deferred to a follow-up release.

import { test } from "@playwright/test";

test.describe("Authorize via ECDSA (§13.4 row 5)", () => {
  test.fixme(
    "EOA signs typed-data and the digest is committed on-chain",
    async () => {
      // FIXME deferred: needs funded Base Sepolia EOA (no fixture wallet
      // available in this env). Live-testnet validation deferred to a follow-up release.
    },
  );

  test.fixme(
    "wrong-chain attempt is refused with explicit reason",
    async () => {
      // FIXME deferred: real chain-switch flow needs WalletConnect + dapp
      // bridge. The wrong-chain.spec.ts spec covers the UI render path.
    },
  );

  test.fixme(
    "after broadcast, the authorization shows up in /positions",
    async () => {
      // FIXME deferred: needs broadcast + indexer round-trip.
    },
  );
});
