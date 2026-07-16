// §13.4 row: Authorize (EIP-1271 + I-66 preimage attestation).
//
// ALL rows fixme'd — needs:
//   - A deployed Safe contract on Base Sepolia with a real owner threshold
//   - A Coinbase Smart Wallet account with smart-wallet-aware signing
//   - I-66 preimage attestation flow with chain-pinned digest
//
// Live-testnet validation deferred to a follow-up release.

import { test } from "@playwright/test";

test.describe("Authorize via EIP-1271 + I-66 (§13.4 row 6)", () => {
  test.skip(
    "Safe co-signing produces a valid EIP-1271 signature",
    async () => {
      // FIXME deferred: needs Safe deployment + co-signer set + Safe SDK
      // signing UI bridge. Not feasible in this env.
    },
  );

  test.skip(
    "Coinbase Smart Wallet signs typed-data with smart-wallet semantics",
    async () => {
      // FIXME deferred: needs CSW account + smart-wallet-aware ConnectKit
      // adapter. The current ConnectKit/wagmi stack supports CSW but the
      // funded account is unavailable.
    },
  );

  test.skip(
    "I-66 preimage attestation pins the digest correctly",
    async () => {
      // FIXME deferred: I-66 attestation flow lands when the SDK gap
      // 'attachSignature with I-66 preimage' is closed in PR-17.
    },
  );
});
