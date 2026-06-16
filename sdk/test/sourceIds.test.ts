import { describe, it, expect } from "vitest";
import { deriveSourceIdHash, deriveAllSourceIdHashes } from "../src/evidence/sourceIds.js";
import { SOURCE_ID_HASHES, EVIDENCE_SOURCE_IDS } from "../src/types/evidence.js";
import { PINNED_SOURCE_IDS } from "./fixtures.js";

describe("EvidenceSource canonical sourceId derivation", () => {
  it.each(EVIDENCE_SOURCE_IDS)(
    "derives %s from canonical preimage matching contract snapshot",
    (label) => {
      expect(deriveSourceIdHash(label)).toBe(PINNED_SOURCE_IDS[label]);
    },
  );

  it("pinned SOURCE_ID_HASHES table matches derivation", () => {
    const derived = deriveAllSourceIdHashes();
    for (const id of EVIDENCE_SOURCE_IDS) {
      expect(SOURCE_ID_HASHES[id].toLowerCase()).toBe(derived[id].toLowerCase());
    }
  });

  it("complete Phase 1 source set is exactly seven labels", () => {
    expect(EVIDENCE_SOURCE_IDS).toHaveLength(7);
  });
});
