import { describe, it, expect } from "vitest";
import {
  STATE_BIT_REGISTRY,
  setBitsIn,
  hasUnknownBits,
} from "./state-bits.js";
import { StateBit } from "@wstdiem/sdk";

describe("state-bits registry", () => {
  it("has 16 slots (11 named + 5 reserved)", () => {
    expect(STATE_BIT_REGISTRY).toHaveLength(16);
    const named = STATE_BIT_REGISTRY.filter((b) => b.mask !== undefined);
    expect(named).toHaveLength(11);
    const reserved = STATE_BIT_REGISTRY.filter((b) => b.mask === undefined);
    expect(reserved).toHaveLength(5);
  });

  it("indexes are sequential 0..15", () => {
    for (let i = 0; i < 16; i++) {
      expect(STATE_BIT_REGISTRY[i]?.index).toBe(i);
    }
  });

  it("named bits map to PROTOCOL.md names", () => {
    expect(STATE_BIT_REGISTRY[0]?.name).toBe("AUDIT_GATE_CLOSED");
    expect(STATE_BIT_REGISTRY[10]?.name).toBe("VAULT_EVIDENCE_MISSING");
  });

  it("setBitsIn returns the named bits set in a bitmap", () => {
    const bm =
      StateBit.AUDIT_GATE_CLOSED |
      StateBit.SEQUENCER_DOWN_OR_GRACE;
    const set = setBitsIn(bm);
    expect(set.map((b) => b.name)).toEqual([
      "AUDIT_GATE_CLOSED",
      "SEQUENCER_DOWN_OR_GRACE",
    ]);
  });

  it("hasUnknownBits returns true when reserved high bits are set", () => {
    expect(hasUnknownBits(1 << 11)).toBe(true);
    expect(hasUnknownBits(1 << 15)).toBe(true);
    expect(hasUnknownBits(StateBit.AUDIT_GATE_CLOSED)).toBe(false);
    expect(hasUnknownBits(0)).toBe(false);
  });
});
