import { describe, it, expect } from "vitest";
import { classifyFingerprint, hasDrift } from "../src/external/fingerprint.js";
import { asAddress, asBytes32 } from "./digest-fixtures.js";

describe("ExternalProtocolFingerprint classifier", () => {
  const ID = asBytes32("0x" + "01".repeat(32));
  const ADDR = asAddress("0x0000000000000000000000000000000000000010");
  const FRESH = asBytes32("0x" + "AA".repeat(32));
  const DRIFTED = asBytes32("0x" + "BB".repeat(32));

  it("match when live equals expected", () => {
    const r = classifyFingerprint({
      integrationId: ID,
      integrationKind: "CurvePool",
      sourceAddress: ADDR,
      liveFingerprint: FRESH,
      expectedFingerprint: FRESH,
    });
    expect(r.status).toBe("match");
    expect(r.subCause).toBe("curve-pool");
  });

  it("drift when live differs from expected", () => {
    const r = classifyFingerprint({
      integrationId: ID,
      integrationKind: "ChainlinkFeed",
      sourceAddress: ADDR,
      liveFingerprint: DRIFTED,
      expectedFingerprint: FRESH,
    });
    expect(r.status).toBe("drift");
    expect(r.subCause).toBe("chainlink-feed");
  });

  it("pendingUpdate when registry timelock is queued", () => {
    const r = classifyFingerprint({
      integrationId: ID,
      integrationKind: "MorphoMarket",
      sourceAddress: ADDR,
      liveFingerprint: FRESH,
      expectedFingerprint: FRESH,
      pendingUpdate: true,
    });
    expect(r.status).toBe("pendingUpdate");
  });

  it("downgrades to drift on staleness even if hashes match", () => {
    const r = classifyFingerprint({
      integrationId: ID,
      integrationKind: "ChainlinkFeed",
      sourceAddress: ADDR,
      liveFingerprint: FRESH,
      expectedFingerprint: FRESH,
      tolerance: { target: 0n, maxStalenessSeconds: 60 },
      observedAtSeconds: 0,
      nowSeconds: 120,
    });
    expect(r.status).toBe("drift");
  });

  it("hasDrift true if any entry not match", () => {
    expect(
      hasDrift([
        { integrationId: ID, integrationKind: "CurvePool", sourceAddress: ADDR, fingerprint: FRESH, status: "match" },
        { integrationId: ID, integrationKind: "CurvePool", sourceAddress: ADDR, fingerprint: FRESH, status: "drift" },
      ]),
    ).toBe(true);
  });
});
