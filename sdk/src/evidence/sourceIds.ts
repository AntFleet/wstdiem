// Canonical sourceId derivation: keccak256("wstdiem.source.<label>").
// On module load, recomputed values are asserted equal to SOURCE_ID_HASHES so
// pinned constants stay honest if the canonical preimage rule ever changes.

import { keccak256, toBytes } from "viem";
import type { Bytes32 } from "../types/branded.js";
import { SOURCE_ID_HASHES, type EvidenceSourceId, EVIDENCE_SOURCE_IDS } from "../types/evidence.js";

export function deriveSourceIdHash(label: EvidenceSourceId): Bytes32 {
  return keccak256(toBytes(`wstdiem.source.${label}`)) as Bytes32;
}

export function deriveAllSourceIdHashes(): Record<EvidenceSourceId, Bytes32> {
  return Object.fromEntries(
    EVIDENCE_SOURCE_IDS.map((id) => [id, deriveSourceIdHash(id)]),
  ) as Record<EvidenceSourceId, Bytes32>;
}

/** Recompute every pinned hash and throw if any drifts. Callers should invoke
 * this once at SDK init (or in a test) to lock the SOURCE_ID_HASHES table to
 * the canonical preimage rule. Not run automatically at module load so the
 * package honors `"sideEffects": false` for bundler tree-shaking. */
export function assertSourceIdParity(): void {
  for (const id of EVIDENCE_SOURCE_IDS) {
    const derived = deriveSourceIdHash(id);
    const pinned = SOURCE_ID_HASHES[id];
    if (derived.toLowerCase() !== pinned.toLowerCase()) {
      throw new Error(
        `wstdiem.source.${id} pinned hash drift: pinned=${pinned} derived=${derived}`,
      );
    }
  }
}
