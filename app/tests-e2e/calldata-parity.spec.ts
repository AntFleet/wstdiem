// §13.4 row: SDK ↔ contract calldata parity.
//
// ALL rows fixme'd — needs forge build artifacts (out/ directory) to
// produce the on-chain ABI to diff against the SDK's typed encoding.
// Tracked under PR-17 SDK gap "ABI parity differential CI".

import { test } from "@playwright/test";

test.describe("SDK ↔ contract calldata parity (§13.4 row 21)", () => {
  test.skip(
    "decodeCalldata round-trip matches the build",
    async () => {
      // FIXME deferred: needs forge artifacts in workspace root
      // (out/LoopAuthorization.sol/*.json, etc). The PR-17 follow-up
      // wires `scripts/check-abi-parity.mjs` to read those artifacts
      // and diff against the SDK constants. The PR-15 SDK includes the
      // forge artifact ABI diff CI scaffold but PR-16 does not invoke it.
    },
  );

  test.skip(
    "every Action shape produces a calldata-hash matching on-chain verifier",
    async () => {
      // FIXME deferred: same dependency on forge artifacts.
    },
  );
});
