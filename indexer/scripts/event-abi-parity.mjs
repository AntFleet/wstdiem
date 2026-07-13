#!/usr/bin/env node
/**
 * Indexer event ABI / topic0 + indexed-flag parity against forge artifacts.
 *
 * Compares every event in INDEXER_EVENTS (mirrors indexer/src/events/abi.ts)
 * against the union of events on LoopRegistry / LoopAuthorization /
 * LoopAnchorRegistry / EmergencyGuardian forge artifacts.
 *
 * Usage:
 *   forge build
 *   node indexer/scripts/event-abi-parity.mjs [forge-out-dir]
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toEventSelector } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? join(__dirname, "../../out");

/**
 * Must stay in lockstep with indexer/src/events/abi.ts INDEXER_ABI.
 * Types + indexed flags are the decode surface; topic0 is keccak of types only.
 */
const INDEXER_EVENTS = [
  {
    name: "LoopActionStep",
    inputs: [
      { type: "address", indexed: true },
      { type: "bytes32", indexed: true },
      { type: "bytes32", indexed: true },
      { type: "uint8", indexed: false },
      { type: "uint8", indexed: false },
      { type: "address", indexed: false },
      { type: "bytes4", indexed: false },
      { type: "bool", indexed: false },
    ],
  },
  {
    name: "PolicyCreated",
    inputs: [
      { type: "address", indexed: true },
      { type: "uint64", indexed: true },
      { type: "uint8", indexed: true },
      { type: "bytes32", indexed: false },
      { type: "uint256", indexed: false },
    ],
  },
  {
    name: "PolicyUpdated",
    inputs: [
      { type: "address", indexed: true },
      { type: "uint64", indexed: true },
      { type: "bytes32", indexed: false },
      { type: "bytes32", indexed: false },
      { type: "uint256", indexed: false },
    ],
  },
  {
    name: "PolicyRevoking",
    inputs: [
      { type: "address", indexed: true },
      { type: "uint64", indexed: true },
      { type: "uint256", indexed: false },
    ],
  },
  {
    name: "PolicyRevoked",
    inputs: [
      { type: "address", indexed: true },
      { type: "uint64", indexed: true },
    ],
  },
  {
    name: "RegistryConfigBatchCommitted",
    inputs: [
      { type: "uint256", indexed: true },
      { type: "bytes32", indexed: true },
      { type: "address", indexed: true },
      { type: "uint16", indexed: false },
    ],
  },
  {
    name: "StateSnapshotAccepted",
    inputs: [
      { type: "uint256", indexed: true },
      { type: "bytes32", indexed: true },
      { type: "address", indexed: true },
    ],
  },
  {
    name: "IndexerSignerRotated",
    inputs: [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
      { type: "uint256", indexed: false },
    ],
  },
  {
    name: "AnchorSubmitterRotated",
    inputs: [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
      { type: "uint256", indexed: false },
    ],
  },
  {
    name: "GovernanceRoleChanged",
    inputs: [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
    ],
  },
  {
    name: "RegistryEmergencyGuardianChanged",
    inputs: [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
      { type: "uint256", indexed: false },
    ],
  },
  {
    name: "GuardianRoleRotated",
    inputs: [
      { type: "address", indexed: true },
      { type: "address", indexed: true },
    ],
  },
];

const CONTRACTS = [
  "LoopRegistry",
  "LoopAuthorization",
  "LoopAnchorRegistry",
  "EmergencyGuardian",
];

function findArtifact(name) {
  const dir = join(outDir, `${name}.sol`);
  try {
    statSync(dir);
  } catch {
    return null;
  }
  try {
    return JSON.parse(readFileSync(join(dir, `${name}.json`), "utf-8"));
  } catch (err) {
    console.error(`failed to read artifact ${name}: ${err.message}`);
    return null;
  }
}

function canonicalType(p) {
  if (p.type === "tuple") {
    return `(${(p.components ?? []).map(canonicalType).join(",")})`;
  }
  if (p.type?.startsWith("tuple[")) {
    return `(${(p.components ?? []).map(canonicalType).join(",")})${p.type.slice("tuple".length)}`;
  }
  return p.type;
}

function eventSignature(item) {
  return `${item.name}(${(item.inputs ?? []).map(canonicalType).join(",")})`;
}

function indexedKey(item) {
  return (item.inputs ?? [])
    .map((p) => `${canonicalType(p)}:${p.indexed ? "i" : "d"}`)
    .join(",");
}

const forgeEvents = new Map();

for (const name of CONTRACTS) {
  const artifact = findArtifact(name);
  if (!artifact) {
    console.warn(`SKIP forge artifact missing: ${name}`);
    continue;
  }
  for (const item of artifact.abi ?? []) {
    if (item.type !== "event") continue;
    const sig = eventSignature(item);
    const topic0 = toEventSelector(sig);
    const key = indexedKey(item);
    const prev = forgeEvents.get(item.name);
    if (prev && (prev.sig !== sig || prev.indexedKey !== key)) {
      console.error(`FAIL forge inconsistency for ${item.name}: ${prev.source} vs ${name}`);
      process.exit(1);
    }
    forgeEvents.set(item.name, { sig, topic0, indexedKey: key, source: name });
  }
}

if (forgeEvents.size === 0) {
  console.error(`FAIL: no forge events loaded from ${outDir}. Run \`forge build\` first.`);
  process.exit(1);
}

let drift = 0;
let ok = 0;

for (const item of INDEXER_EVENTS) {
  const sig = eventSignature(item);
  const topic0 = toEventSelector(sig);
  const key = indexedKey(item);
  const forge = forgeEvents.get(item.name);
  if (!forge) {
    console.error(`FAIL indexer event ${item.name}: not in forge artifacts (${sig})`);
    drift++;
    continue;
  }
  if (forge.sig !== sig) {
    console.error(
      `FAIL ${item.name}: type signature drift\n  indexer: ${sig}\n  forge:   ${forge.sig}`,
    );
    drift++;
    continue;
  }
  if (forge.topic0.toLowerCase() !== topic0.toLowerCase()) {
    console.error(
      `FAIL ${item.name}: topic0 drift indexer=${topic0} forge=${forge.topic0}`,
    );
    drift++;
    continue;
  }
  if (forge.indexedKey !== key) {
    console.error(
      `FAIL ${item.name}: indexed-flag drift\n  indexer: ${key}\n  forge:   ${forge.indexedKey}`,
    );
    drift++;
    continue;
  }
  ok++;
  console.log(`OK  ${item.name}  ${topic0}`);
}

if (drift > 0) {
  console.error(`\nIndexer event ABI parity FAILED — ${drift} drift(s), ${ok} OK.`);
  process.exit(1);
}
console.log(`\nIndexer event ABI parity OK — ${ok} event(s) verified against forge.`);
