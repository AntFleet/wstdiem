#!/usr/bin/env node
// PR-15 audit M-? closure: extract function + event selectors from compiled
// forge artifacts and compare against sdk/snapshots/abi-selectors.json.
//
// Usage (from sdk/ dir):
//   forge build --root .. --out ../out
//   node scripts/extract-forge-abis.mjs ../out
//
// Exits non-zero on any drift. CI workflow at .github/workflows/sdk-abi-parity.yml
// runs this in addition to the in-process abi-parity.test.ts snapshot check.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { toFunctionSelector, toEventSelector } from "viem";

if (process.argv.length < 3) {
  console.error("usage: extract-forge-abis.mjs <forge-out-dir>");
  process.exit(2);
}
const outDir = process.argv[2];
const SNAPSHOT_PATH = join(
  new URL(".", import.meta.url).pathname,
  "..",
  "snapshots",
  "abi-selectors.json",
);
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));

// Map: SDK contract name → snapshot signature prefixes to verify
const CONTRACTS = {
  LoopExecutorV2: ["executeOpen(", "executeRebalance(", "executeExit("],
  LoopForceExitExecutor: ["executeForceExit("],
  LoopRegistry: [
    "registryVersion()",
    "registryMerkleRoot()",
    "marketParams(bytes32)",
    "executorFor(uint8)",
    "validateExternalConfig(bytes32,uint8)",
  ],
  LoopAuthorization: [
    "domainSeparator()",
    "nonceBitmap(address,uint64,uint8,uint248)",
  ],
  LoopAnchorRegistry: ["lastAnchorBlock()"],
};

function findArtifact(name) {
  // forge out/ structure: out/<ContractName>.sol/<ContractName>.json
  const dir = join(outDir, `${name}.sol`);
  try {
    statSync(dir);
  } catch {
    return null;
  }
  const file = join(dir, `${name}.json`);
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch (err) {
    console.error(`failed to read ${file}: ${err.message}`);
    return null;
  }
}

function canonicalAbiType(p) {
  if (p.type === "tuple") {
    const inner = (p.components ?? []).map(canonicalAbiType).join(",");
    return `(${inner})`;
  }
  if (p.type.startsWith("tuple[")) {
    const inner = (p.components ?? []).map(canonicalAbiType).join(",");
    const suffix = p.type.slice("tuple".length);
    return `(${inner})${suffix}`;
  }
  return p.type;
}

let drift = 0;
let checked = 0;

for (const [contract, prefixes] of Object.entries(CONTRACTS)) {
  const artifact = findArtifact(contract);
  if (!artifact) {
    console.warn(`SKIP ${contract}: forge artifact not found at ${outDir}/${contract}.sol/`);
    continue;
  }
  const abi = artifact.abi;
  if (!Array.isArray(abi)) {
    console.error(`FAIL ${contract}: artifact has no abi[]`);
    drift++;
    continue;
  }
  // Build a signature → selector map for every function in the live ABI.
  const live = new Map();
  for (const item of abi) {
    if (item.type === "function") {
      const sig = `${item.name}(${item.inputs.map(canonicalAbiType).join(",")})`;
      live.set(sig, toFunctionSelector(sig));
    } else if (item.type === "event") {
      const sig = `${item.name}(${item.inputs.map(canonicalAbiType).join(",")})`;
      live.set(sig, toEventSelector(sig));
    }
  }
  for (const prefix of prefixes) {
    // Find the matching snapshot signature (one entry per prefix).
    const snapshotSig = Object.keys(snapshot.selectors).find((s) =>
      s.startsWith(prefix),
    );
    if (!snapshotSig) {
      console.error(`FAIL ${contract}: snapshot has no entry starting with ${prefix}`);
      drift++;
      continue;
    }
    const liveSel = live.get(snapshotSig);
    if (!liveSel) {
      console.error(`FAIL ${contract}: forge ABI does not contain ${snapshotSig}`);
      drift++;
      continue;
    }
    if (liveSel.toLowerCase() !== snapshot.selectors[snapshotSig].toLowerCase()) {
      console.error(
        `FAIL ${contract}.${snapshotSig.split("(")[0]}: live=${liveSel} snapshot=${snapshot.selectors[snapshotSig]}`,
      );
      drift++;
    } else {
      checked++;
    }
  }
  // Events: forge artifacts include them in the same abi array. Check each
  // event in our snapshot against the live ABI for the contracts that emit
  // it. For simplicity we check ALL snapshot events against every loaded
  // contract — at least one must match.
}

// Aggregate event-selector check: snapshot events must appear in the union
// of all loaded artifacts' event signatures.
const loadedEventSelectors = new Set();
for (const contract of Object.keys(CONTRACTS)) {
  const artifact = findArtifact(contract);
  if (!artifact) continue;
  for (const item of artifact.abi ?? []) {
    if (item.type !== "event") continue;
    const sig = `${item.name}(${item.inputs.map(canonicalAbiType).join(",")})`;
    loadedEventSelectors.add(toEventSelector(sig));
  }
}
for (const [sig, expected] of Object.entries(snapshot.events ?? {})) {
  const computed = toEventSelector(sig);
  if (computed !== expected) {
    console.error(`FAIL event ${sig}: computed=${computed} snapshot=${expected}`);
    drift++;
  }
  // If we loaded any artifact, also require it to expose this event.
  // (Skipped when no artifacts were loaded so dev runs without forge still work.)
  if (loadedEventSelectors.size > 0 && !loadedEventSelectors.has(expected)) {
    console.error(
      `FAIL event ${sig}: forge artifacts do not expose this event (selector ${expected})`,
    );
    drift++;
  } else {
    checked++;
  }
}

if (drift > 0) {
  console.error(`\nABI parity FAILED — ${drift} drift(s), ${checked} OK.`);
  process.exit(1);
}
console.log(`ABI parity OK — ${checked} selector(s) verified.`);
