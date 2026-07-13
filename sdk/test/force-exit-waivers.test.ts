import { describe, it, expect } from "vitest";
import { ForceExitRiskBit } from "../src/types/enums.js";
import { StateBit } from "../src/types/evidence.js";
import {
  requiredForceExitRiskBitsFromStateBitmap,
  countCriticalForceExitRiskBits,
  assertForceExitWaiverMinimality,
  assertForceExitRisksCoverRequired,
  forceExitBlockedByMultiCritical,
  FORCE_EXIT_CRITICAL_RISK_MASK,
} from "../src/force-exit/waivers.js";

describe("requiredForceExitRiskBitsFromStateBitmap", () => {
  it("maps empty bitmap to zero required risks", () => {
    expect(requiredForceExitRiskBitsFromStateBitmap(0)).toBe(0);
  });

  it("maps oracle degraded → STALE_ORACLE_OVERRIDE", () => {
    expect(
      requiredForceExitRiskBitsFromStateBitmap(StateBit.ORACLE_DEGRADED),
    ).toBe(ForceExitRiskBit.STALE_ORACLE_OVERRIDE);
  });

  it("maps curve / sequencer / vault bits", () => {
    const mask =
      StateBit.CURVE_LIQUIDITY_INSUFFICIENT |
      StateBit.SEQUENCER_DOWN_OR_GRACE |
      StateBit.VAULT_EVIDENCE_MISSING;
    const required = requiredForceExitRiskBitsFromStateBitmap(mask);
    expect(required & ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH).toBeTruthy();
    expect(required & ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE).toBeTruthy();
    expect(required & ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE).toBeTruthy();
    expect(countCriticalForceExitRiskBits(required)).toBe(3);
    expect(forceExitBlockedByMultiCritical(required)).toBe(true);
  });
});

describe("assertForceExitWaiverMinimality", () => {
  it("allows a single critical bit plus LOOSE_SLIPPAGE", () => {
    expect(() =>
      assertForceExitWaiverMinimality(
        ForceExitRiskBit.LOOSE_SLIPPAGE |
          ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
      ),
    ).not.toThrow();
  });

  it("rejects two critical bits", () => {
    expect(() =>
      assertForceExitWaiverMinimality(
        ForceExitRiskBit.STALE_ORACLE_OVERRIDE |
          ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH,
      ),
    ).toThrow(/ForceExitWaiverOverbroad/);
  });
});

describe("assertForceExitRisksCoverRequired", () => {
  it("passes when required ⊆ acknowledged", () => {
    expect(() =>
      assertForceExitRisksCoverRequired(
        ForceExitRiskBit.STALE_ORACLE_OVERRIDE |
          ForceExitRiskBit.LOOSE_SLIPPAGE,
        ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
      ),
    ).not.toThrow();
  });

  it("fails when a required bit is missing", () => {
    expect(() =>
      assertForceExitRisksCoverRequired(
        ForceExitRiskBit.LOOSE_SLIPPAGE,
        ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
      ),
    ).toThrow(/AckRiskBitMissing/);
  });

  it("exposes CRITICAL mask covering the four override bits", () => {
    expect(FORCE_EXIT_CRITICAL_RISK_MASK).toBe(
      ForceExitRiskBit.STALE_ORACLE_OVERRIDE |
        ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH |
        ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE |
        ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE,
    );
  });
});
