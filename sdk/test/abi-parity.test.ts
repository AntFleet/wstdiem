// PR-13 A6-4 ABI parity test. Locks SDK inline ABIs to the canonical Solidity
// function signatures (snapshot at sdk/snapshots/abi-selectors.json). Drift in
// either direction — SDK changes an ABI field, or contract changes a function
// signature — is caught here.
//
// The snapshot is the source-of-truth for the LIVE deployment. CI can swap
// the snapshot for forge-extracted artifacts in a future PR; for now we ship
// the lock list and verify each SDK ABI produces the same 4-byte selector.

import { describe, it, expect } from "vitest";
import {
  toFunctionSelector,
  toEventSelector,
  type AbiFunction,
  type AbiEvent,
} from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CHAINLINK_AGGREGATOR_V3_ABI,
  CURVE_POOL_READ_ABI,
  ERC4626_ABI,
  LOOP_ANCHOR_REGISTRY_READ_ABI,
  LOOP_AUTHORIZATION_READ_ABI,
  LOOP_EVENTS_FULL_ABI,
  LOOP_EXECUTOR_V2_ABI,
  LOOP_FORCE_EXIT_EXECUTOR_ABI,
  LOOP_REGISTRY_READ_ABI,
  MORPHO_READ_ABI,
} from "../src/live/abis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "..", "snapshots", "abi-selectors.json");
const SNAPSHOT = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as {
  selectors: Record<string, string>;
  events: Record<string, string>;
};

function selectorsByName(abi: readonly unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of abi as readonly AbiFunction[]) {
    if (item.type !== "function") continue;
    // Build canonical signature: `name(arg1Type,arg2Type,...)` recursively
    // expanding tuples.
    const sig = canonicalFunctionSignature(item);
    out.set(item.name, toFunctionSelector(sig));
  }
  return out;
}

function canonicalFunctionSignature(fn: AbiFunction): string {
  const args = fn.inputs.map(canonicalAbiType).join(",");
  return `${fn.name}(${args})`;
}

function canonicalAbiType(p: { type: string; components?: readonly unknown[] }): string {
  if (p.type === "tuple") {
    const inner = (p.components ?? []).map((c) => canonicalAbiType(c as never)).join(",");
    return `(${inner})`;
  }
  if (p.type.startsWith("tuple[")) {
    const inner = (p.components ?? []).map((c) => canonicalAbiType(c as never)).join(",");
    const suffix = p.type.slice("tuple".length);
    return `(${inner})${suffix}`;
  }
  return p.type;
}

describe("PR-13 A6-4: SDK ABI ↔ snapshot parity", () => {
  it("LoopExecutorV2 entrypoints produce snapshot selectors", () => {
    const sel = selectorsByName(LOOP_EXECUTOR_V2_ABI as readonly unknown[]);
    const expectedOpen = SNAPSHOT.selectors[
      Object.keys(SNAPSHOT.selectors).find((k) => k.startsWith("executeOpen("))!
    ]!;
    const expectedRebalance = SNAPSHOT.selectors[
      Object.keys(SNAPSHOT.selectors).find((k) => k.startsWith("executeRebalance("))!
    ]!;
    const expectedExit = SNAPSHOT.selectors[
      Object.keys(SNAPSHOT.selectors).find((k) => k.startsWith("executeExit("))!
    ]!;
    expect(sel.get("executeOpen")).toBe(expectedOpen);
    expect(sel.get("executeRebalance")).toBe(expectedRebalance);
    expect(sel.get("executeExit")).toBe(expectedExit);
  });

  it("LoopForceExitExecutor.executeForceExit produces snapshot selector", () => {
    const sel = selectorsByName(LOOP_FORCE_EXIT_EXECUTOR_ABI as readonly unknown[]);
    const expectedForceExit = SNAPSHOT.selectors[
      Object.keys(SNAPSHOT.selectors).find((k) => k.startsWith("executeForceExit("))!
    ]!;
    expect(sel.get("executeForceExit")).toBe(expectedForceExit);
  });

  it("LoopRegistry read functions match snapshot selectors", () => {
    const sel = selectorsByName(LOOP_REGISTRY_READ_ABI as readonly unknown[]);
    expect(sel.get("registryVersion")).toBe(SNAPSHOT.selectors["registryVersion()"]);
    expect(sel.get("registryMerkleRoot")).toBe(SNAPSHOT.selectors["registryMerkleRoot()"]);
    expect(sel.get("marketParams")).toBe(SNAPSHOT.selectors["marketParams(bytes32)"]);
    expect(sel.get("executorFor")).toBe(SNAPSHOT.selectors["executorFor(uint8)"]);
    expect(sel.get("validateExternalConfig")).toBe(
      SNAPSHOT.selectors["validateExternalConfig(bytes32,uint8)"],
    );
  });

  it("LoopAuthorization read functions match snapshot selectors", () => {
    const sel = selectorsByName(LOOP_AUTHORIZATION_READ_ABI as readonly unknown[]);
    expect(sel.get("domainSeparator")).toBe(SNAPSHOT.selectors["domainSeparator()"]);
    expect(sel.get("nonceBitmap")).toBe(
      SNAPSHOT.selectors["nonceBitmap(address,uint64,uint8,uint248)"],
    );
  });

  it("Morpho position + market read functions match snapshot selectors", () => {
    const sel = selectorsByName(MORPHO_READ_ABI as readonly unknown[]);
    expect(sel.get("position")).toBe(SNAPSHOT.selectors["position(bytes32,address)"]);
    expect(sel.get("market")).toBe(SNAPSHOT.selectors["market(bytes32)"]);
  });

  it("Chainlink + ERC4626 + Curve match snapshot selectors", () => {
    const chainlink = selectorsByName(CHAINLINK_AGGREGATOR_V3_ABI as readonly unknown[]);
    const vault = selectorsByName(ERC4626_ABI as readonly unknown[]);
    const curve = selectorsByName(CURVE_POOL_READ_ABI as readonly unknown[]);
    expect(chainlink.get("latestRoundData")).toBe(SNAPSHOT.selectors["latestRoundData()"]);
    expect(vault.get("convertToAssets")).toBe(SNAPSHOT.selectors["convertToAssets(uint256)"]);
    expect(curve.get("get_dy")).toBe(SNAPSHOT.selectors["get_dy(int128,int128,uint256)"]);
  });

  it("LoopAnchorRegistry.lastAnchorBlock matches snapshot selector", () => {
    const sel = selectorsByName(LOOP_ANCHOR_REGISTRY_READ_ABI as readonly unknown[]);
    expect(sel.get("lastAnchorBlock")).toBe(SNAPSHOT.selectors["lastAnchorBlock()"]);
  });

  it("LOOP_EVENTS_FULL_ABI is parseable as event entries", () => {
    // Sanity: every entry decodes via viem's toEventSelector without error.
    for (const item of LOOP_EVENTS_FULL_ABI as readonly AbiEvent[]) {
      if (item.type !== "event") continue;
      const args = item.inputs.map(canonicalAbiType).join(",");
      const sel = toEventSelector(`${item.name}(${args})`);
      expect(sel).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("PR-14 audit M-1: every event topic-0 matches snapshot lock", () => {
    const computed: Record<string, string> = {};
    for (const item of LOOP_EVENTS_FULL_ABI as readonly AbiEvent[]) {
      if (item.type !== "event") continue;
      const args = item.inputs.map(canonicalAbiType).join(",");
      const sig = `${item.name}(${args})`;
      computed[sig] = toEventSelector(sig);
    }
    // Each event in the snapshot must be present in the SDK ABI with the
    // same topic-0. Drift in EITHER direction (SDK changes an event field
    // or contract changes a signature) fails this assertion.
    for (const [sig, expected] of Object.entries(SNAPSHOT.events)) {
      expect(computed[sig], `Event ${sig} missing from SDK ABI`).toBe(expected);
    }
    // And no extra events in the SDK that aren't snapshotted (catches
    // drift in the opposite direction — accidental adds).
    for (const sig of Object.keys(computed)) {
      expect(SNAPSHOT.events[sig], `SDK ABI has event ${sig} not in snapshot`).toBeDefined();
    }
  });
});
