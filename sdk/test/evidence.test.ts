import { describe, it, expect } from "vitest";
import {
  sortSources,
  assertSourcesSorted,
  validateExactSet,
  hashSources,
  deriveEvidenceBundleHash,
  buildActionEvidence,
  EvidenceSetError,
} from "../src/evidence/encoder.js";
import type { EvidenceSource } from "../src/types/evidence.js";
import { SOURCE_ID_HASHES } from "../src/types/evidence.js";
import {
  asAddress,
  asBytes32,
} from "./digest-fixtures.js";
import {
  asBlockNumber,
  asMarketId,
  asStateBitmap,
} from "../src/types/branded.js";
import {
  exitRequiredSources,
  requiredSourcesFor,
} from "../src/evidence/required-sets.js";

const A1 = asAddress("0x00000000000000000000000000000000000000a1");
const A2 = asAddress("0x00000000000000000000000000000000000000a2");
const A3 = asAddress("0x00000000000000000000000000000000000000a3");

function makeSource<S extends EvidenceSource["sourceId"]>(
  sourceId: S,
  sourceAddress: string,
): EvidenceSource {
  const base = {
    sourceIdHash: SOURCE_ID_HASHES[sourceId],
    sourceAddress: asAddress(sourceAddress),
    status: "fresh" as const,
    lastUpdateBlock: asBlockNumber(100n),
    valueHash: asBytes32("0x" + "11".repeat(32)),
  };
  if (sourceId === "morpho-position") {
    return { ...base, sourceId, value: { collateral: 0n, borrowShares: 0n, supplyShares: 0n } };
  }
  if (sourceId === "vault-nav") {
    return { ...base, sourceId, value: { convertToAssets1e18: 0n, totalSupply: 0n, totalAssets: 0n } };
  }
  if (sourceId === "chainlink-feed") {
    return { ...base, sourceId, value: { answer: 0n, updatedAt: 0n as never, roundId: 0n } };
  }
  if (sourceId === "curve-quote") {
    return { ...base, sourceId, value: { tokenIn: A1, tokenOut: A2, amountIn: 0n, amountOut: 0n, priceImpactBps: 0 as never } };
  }
  if (sourceId === "sequencer-uptime") {
    return { ...base, sourceId, value: { status: "up", startedAt: 0n as never, updatedAt: 0n as never } };
  }
  if (sourceId === "harvest-event") {
    return { ...base, sourceId, value: { lastHarvestBlock: asBlockNumber(0n), topic0: asBytes32("0x" + "22".repeat(32)), feeRouter: A3 } };
  }
  return { ...base, sourceId: "external-protocol-fingerprint" as const, value: { fingerprintRoot: asBytes32("0x" + "33".repeat(32)), integrationIds: [] } };
}

describe("evidence canonical-set sort (I-70)", () => {
  it("sortSources sorts by (sourceIdHash, sourceAddress) strictly ascending", () => {
    const a = makeSource("morpho-position", A2);
    const b = makeSource("vault-nav", A1);
    const c = makeSource("morpho-position", A1);
    const sorted = sortSources([a, b, c]);
    expect(sorted[0]?.sourceAddress).toBe(A1);
    expect(sorted[1]?.sourceAddress).toBe(A2);
    expect(sorted[2]?.sourceId).toBe("vault-nav");
  });

  it("assertSourcesSorted throws on duplicate", () => {
    const a = makeSource("morpho-position", A1);
    expect(() => assertSourcesSorted([a, a])).toThrow(EvidenceSetError);
  });

  it("assertSourcesSorted throws when out-of-order", () => {
    const a = makeSource("morpho-position", A2);
    const b = makeSource("morpho-position", A1);
    expect(() => assertSourcesSorted([a, b])).toThrow(EvidenceSetError);
  });

  it("hashSources is deterministic", () => {
    const a = makeSource("morpho-position", A1);
    const b = makeSource("vault-nav", A2);
    const sorted = sortSources([a, b]);
    const h1 = hashSources(sorted);
    const h2 = hashSources(sorted);
    expect(h1).toBe(h2);
  });
});

describe("required-set spec per primaryType", () => {
  it("Exit CURVE keeps both morpho-position and curve-quote", () => {
    const r = exitRequiredSources("CURVE");
    expect(r).toContain("morpho-position");
    expect(r).toContain("curve-quote");
  });

  it("Exit CURVE_FREE omits curve-quote", () => {
    const r = exitRequiredSources("CURVE_FREE");
    expect(r).not.toContain("curve-quote");
    expect(r).toContain("morpho-position");
  });

  it("Exit REPAY_ONLY omits curve-quote and morpho-position", () => {
    const r = exitRequiredSources("REPAY_ONLY");
    expect(r).not.toContain("curve-quote");
    expect(r).not.toContain("morpho-position");
  });

  it("Revoke is empty", () => {
    expect(requiredSourcesFor("Revoke")).toEqual([]);
  });

  it("AutomationExec inherits underlying", () => {
    const r = requiredSourcesFor("AutomationExec", { underlyingPrimaryType: "Open" });
    expect(r).toContain("harvest-event");
  });
});

describe("validateExactSet (I-70 enforcement)", () => {
  it("accepts a sorted exact set", () => {
    const sources = sortSources([
      makeSource("morpho-position", A1),
      makeSource("vault-nav", A2),
    ]);
    const ok = validateExactSet({
      sources,
      required: [
        { sourceId: "morpho-position", sourceAddress: A1 },
        { sourceId: "vault-nav", sourceAddress: A2 },
      ],
    });
    expect(ok).toHaveLength(2);
  });

  it("rejects missing required source", () => {
    expect(() =>
      validateExactSet({
        sources: [makeSource("morpho-position", A1)],
        required: [
          { sourceId: "morpho-position", sourceAddress: A1 },
          { sourceId: "vault-nav", sourceAddress: A2 },
        ],
      }),
    ).toThrow(EvidenceSetError);
  });

  it("rejects address mismatch", () => {
    expect(() =>
      validateExactSet({
        sources: [makeSource("morpho-position", A1)],
        required: [{ sourceId: "morpho-position", sourceAddress: A2 }],
      }),
    ).toThrow(EvidenceSetError);
  });

  it("rejects unexpected source", () => {
    expect(() =>
      validateExactSet({
        sources: [
          makeSource("morpho-position", A1),
          makeSource("vault-nav", A2),
        ],
        required: [{ sourceId: "morpho-position", sourceAddress: A1 }],
      }),
    ).toThrow(EvidenceSetError);
  });
});

describe("deriveEvidenceBundleHash + buildActionEvidence", () => {
  it("is deterministic", () => {
    const sources = sortSources([makeSource("morpho-position", A1)]);
    const inputs = {
      actionId: asBytes32("0x" + "01".repeat(32)),
      evidenceSetId: asBytes32("0x" + "02".repeat(32)),
      owner: A3,
      market: asMarketId(asBytes32("0x" + "03".repeat(32))),
      blockNumber: asBlockNumber(100n),
      stateBitmap: asStateBitmap(0),
      sources,
    };
    const h1 = deriveEvidenceBundleHash(inputs);
    const h2 = deriveEvidenceBundleHash(inputs);
    expect(h1).toBe(h2);
  });

  it("buildActionEvidence sorts sources and derives bundle hash", () => {
    const unsorted = [
      makeSource("vault-nav", A2),
      makeSource("morpho-position", A1),
    ];
    const bundle = buildActionEvidence({
      actionId: asBytes32("0x" + "01".repeat(32)),
      evidenceSetId: asBytes32("0x" + "02".repeat(32)),
      owner: A3,
      market: asMarketId(asBytes32("0x" + "03".repeat(32))),
      blockNumber: asBlockNumber(100n),
      stateBitmap: asStateBitmap(0),
      sources: unsorted,
    });
    expect(bundle.sources[0]?.sourceId).toBe("morpho-position");
    expect(bundle.evidenceBundleHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
