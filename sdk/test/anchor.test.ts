import { describe, it, expect } from "vitest";
import {
  classifyAnchorFreshness,
  DEFAULT_ANCHOR_MAX_STALE_BLOCKS,
  DEFAULT_ANCHOR_EMERGENCY_MULTIPLIER,
} from "../src/anchor/freshness.js";
import { asBlockNumber } from "../src/types/branded.js";

describe("AnchorFreshness classifier", () => {
  it("fresh at lag <= 100", () => {
    const a = classifyAnchorFreshness({
      lastAnchoredBlock: asBlockNumber(100n),
      currentBlock: asBlockNumber(200n),
    });
    expect(a.status).toBe("fresh");
  });

  it("degraded at lag > 100 and <= 300", () => {
    const a = classifyAnchorFreshness({
      lastAnchoredBlock: asBlockNumber(100n),
      currentBlock: asBlockNumber(300n),
    });
    expect(a.status).toBe("degraded");
    expect(a.error).toBe("IndexerAnchorStale");
  });

  it("emergencyStale at lag > 300", () => {
    const a = classifyAnchorFreshness({
      lastAnchoredBlock: asBlockNumber(100n),
      currentBlock: asBlockNumber(500n),
    });
    expect(a.status).toBe("emergencyStale");
    expect(a.error).toBe("IndexerAnchorStale");
  });

  it("uses Phase 1 defaults: 100-block max stale + 3x emergency multiplier", () => {
    expect(DEFAULT_ANCHOR_MAX_STALE_BLOCKS).toBe(100);
    expect(DEFAULT_ANCHOR_EMERGENCY_MULTIPLIER).toBe(3);
  });

  it("honors caller-provided overrides", () => {
    const a = classifyAnchorFreshness({
      lastAnchoredBlock: asBlockNumber(100n),
      currentBlock: asBlockNumber(151n),
      anchorMaxStaleBlocks: 50,
      anchorEmergencyMultiplier: 2,
    });
    expect(a.status).toBe("degraded");
  });
});
