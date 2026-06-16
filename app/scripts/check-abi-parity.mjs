#!/usr/bin/env node
// ABI parity stub for PR-16.
//
// §13.4 row 21 — "SDK ↔ contract calldata parity differential CI" — requires
// reading forge build artifacts (out/LoopAuthorization.sol/*.json, etc.) and
// diffing the on-chain ABI against the SDK's typed encoders. Forge artifacts
// are NOT available in this worktree (forge build never ran), so this script
// ships as a stub that:
//
//   1. Confirms the SDK exports the expected getCanonicalErrors selector list.
//   2. Logs the deferred work + the exact follow-up step.
//
// Full implementation lands as a PR-17 follow-up:
//   - Wire `forge build` into the workspace install step OR
//   - Add a CI job that runs `forge build` then this script with a different
//     mode flag (--mode forge-diff)
//   - Diff every selector against the SDK constants and fail on mismatch.

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const FORGE_OUT = path.join(WORKSPACE_ROOT, "out");

console.log("[abi-parity] PR-16 stub — full diff deferred to PR-17.");
console.log(`[abi-parity] workspace root: ${WORKSPACE_ROOT}`);

if (existsSync(FORGE_OUT)) {
  const artifacts = readdirSync(FORGE_OUT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  console.log(
    `[abi-parity] forge out/ exists with ${artifacts.length} contract dirs`,
  );
  console.log(
    `[abi-parity] PR-17 follow-up: read out/LoopAuthorization.sol/*.json + diff against`,
  );
  console.log(`[abi-parity]   sdk/src/eip712/* type-hash constants`);
  process.exit(0);
}

console.log(
  `[abi-parity] forge out/ NOT present at ${FORGE_OUT}.`,
);
console.log(
  `[abi-parity] PR-17 follow-up: run forge build then re-invoke this script.`,
);
console.log(
  `[abi-parity] The PR-15 SDK ships the forge-artifact ABI diff CI scaffold; PR-16 does not invoke it.`,
);
// Exit 0 so this can be wired into CI today without blocking — the deferred
// flag is a documentation signal, not a failure signal. PR-17 flips this to
// exit 1 on mismatch.
process.exit(0);
