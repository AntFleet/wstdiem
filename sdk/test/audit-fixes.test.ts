// Audit-cycle regression tests. Locks the behavior changes introduced by the
// Codex+Codex+Claude audit findings on PR-11.

import { describe, it, expect } from "vitest";
import {
  isHighRiskFromAction,
  isHighRiskByDigest,
} from "../src/preimage/i66.js";
import {
  gatesAllPass,
  gatesAllPassStrict,
  evaluatePostMatrixGates,
  type GateStatus,
} from "../src/gates/post-matrix.js";
import {
  computeRevokeDigest,
  computeAutomationExecDigest,
} from "../src/eip712/digest.js";
import { computeDomainSeparator } from "../src/eip712/domain.js";
import {
  requiredSourcesFor,
} from "../src/evidence/required-sets.js";
import {
  asBasisPoints,
  asBlockNumber,
  asChainId,
  asPolicyId,
  asRegistryVersion,
  asStateBitmap,
  asUnixSeconds,
} from "../src/types/branded.js";
import {
  EXAMPLE_DOMAIN,
  EXAMPLE_SUB_HASHES,
  EXAMPLE_AUTOMATION_BOUNDS,
  buildExampleAutomationExec,
  buildExampleRevoke,
  buildExampleOpen,
  buildExampleRebalance,
  buildExampleForceExit,
  asAddress,
  asBytes32,
} from "./digest-fixtures.js";
import { PRIMARY_TYPE_U8 } from "../src/types/enums.js";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

const DS = computeDomainSeparator(EXAMPLE_DOMAIN);

// AUDIT FIX A4-H1 — isHighRiskFromAction removes caller-trust gap
describe("isHighRiskFromAction (audit A4-H1)", () => {
  it("derives Open as high-risk from action alone", () => {
    expect(isHighRiskFromAction({ primaryType: "Open" })).toBe(true);
  });

  it("derives ForceExit as high-risk from action alone", () => {
    expect(isHighRiskFromAction({ primaryType: "ForceExit" })).toBe(true);
  });

  it("derives Rebalance high-risk from action.bounds.maxDebtIncrease", () => {
    expect(isHighRiskFromAction({ primaryType: "Rebalance", bounds: { maxDebtIncrease: 0n } })).toBe(false);
    expect(isHighRiskFromAction({ primaryType: "Rebalance", bounds: { maxDebtIncrease: 1n } })).toBe(true);
  });

  it("derives AutomationExec from underlyingPrimaryType (closes caller-trust gap)", () => {
    expect(isHighRiskFromAction({ primaryType: "AutomationExec", underlyingPrimaryType: "Open" })).toBe(true);
    expect(isHighRiskFromAction({ primaryType: "AutomationExec", underlyingPrimaryType: "ForceExit" })).toBe(true);
    // Rebalance underlying: conservatively high-risk (SDK can't read inner maxDebtIncrease)
    expect(isHighRiskFromAction({ primaryType: "AutomationExec", underlyingPrimaryType: "Rebalance" })).toBe(true);
    expect(isHighRiskFromAction({ primaryType: "AutomationExec", underlyingPrimaryType: "Exit" })).toBe(false);
  });

  it("throws when AutomationExec has no underlyingPrimaryType", () => {
    expect(() =>
      isHighRiskFromAction({ primaryType: "AutomationExec" }),
    ).toThrow(/requires action.underlyingPrimaryType/);
  });

  it("non-high-risk actions classify correctly", () => {
    expect(isHighRiskFromAction({ primaryType: "Exit" })).toBe(false);
    expect(isHighRiskFromAction({ primaryType: "Revoke" })).toBe(false);
  });
});

// AUDIT FIX A4-M2 — computeAutomationExecDigest overrides bounds.underlyingPrimaryType
describe("computeAutomationExecDigest underlyingPrimaryType binding (audit A4-M2)", () => {
  it("derives bounds.underlyingPrimaryType from action.underlyingPrimaryType (not caller bounds)", () => {
    const action = buildExampleAutomationExec(); // underlyingPrimaryType: "Rebalance"
    // Caller maliciously passes Revoke=4 in bounds; SDK must override to Rebalance=1.
    const lieBounds = { ...EXAMPLE_AUTOMATION_BOUNDS, underlyingPrimaryType: 4 };
    const truthBounds = { ...EXAMPLE_AUTOMATION_BOUNDS, underlyingPrimaryType: PRIMARY_TYPE_U8.Rebalance };
    const dLie = computeAutomationExecDigest({ action, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, bounds: lieBounds });
    const dTruth = computeAutomationExecDigest({ action, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, bounds: truthBounds });
    expect(dLie).toBe(dTruth);
  });

  it("digests differ when action.underlyingPrimaryType differs even if bounds match", () => {
    const a = buildExampleAutomationExec(); // Rebalance
    const b = { ...a, underlyingPrimaryType: "Open" as const };
    const dA = computeAutomationExecDigest({ action: a, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, bounds: EXAMPLE_AUTOMATION_BOUNDS });
    const dB = computeAutomationExecDigest({ action: b, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, bounds: EXAMPLE_AUTOMATION_BOUNDS });
    expect(dA).not.toBe(dB);
  });
});

// AUDIT FIX A4-M4 — computeRevokeDigest rejects digest-targeted revoke
describe("computeRevokeDigest digest-targeted rejection (audit A4-M4)", () => {
  it("throws when only revokeDigest is set (Phase 1 unsupported)", () => {
    const action = { ...buildExampleRevoke() };
    action.revokePolicyId = undefined;
    action.revokeDigest = asBytes32("0x" + "11".repeat(32)) as never;
    expect(() =>
      computeRevokeDigest({
        action: action as never,
        domainSeparator: DS,
        subHashes: EXAMPLE_SUB_HASHES,
        effectiveBlock: 100n,
        policyClass: "REBALANCE",
      }),
    ).toThrow(/Phase 1 Revoke supports revokePolicyId only/);
  });

  it("works when revokePolicyId is set (revokeDigest may also be set as informational metadata)", () => {
    const action = buildExampleRevoke();
    const d = computeRevokeDigest({
      action,
      domainSeparator: DS,
      subHashes: EXAMPLE_SUB_HASHES,
      effectiveBlock: 100n,
      policyClass: "REBALANCE",
    });
    expect(d).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// AUDIT FIX A10-M3 — gatesAllPassStrict closes missing-input-as-bypass
describe("gatesAllPassStrict (audit A10-M3)", () => {
  it("passes when every required gate has status pass", () => {
    const statuses: GateStatus[] = [
      { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "pass" },
      { gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT", status: "pass" },
    ];
    expect(gatesAllPassStrict(statuses, ["G_PM_2_INDEXER_ANCHOR_STALE"])).toBe(true);
  });

  it("fails when a required gate is notApplicable (closes the bypass)", () => {
    const statuses: GateStatus[] = [
      { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "notApplicable" },
    ];
    expect(gatesAllPass(statuses)).toBe(true); // old behavior
    expect(gatesAllPassStrict(statuses, ["G_PM_2_INDEXER_ANCHOR_STALE"])).toBe(false);
  });

  it("fails when any gate is fail regardless of required list", () => {
    const statuses: GateStatus[] = [
      { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "fail" },
    ];
    expect(gatesAllPassStrict(statuses, [])).toBe(false);
  });

  it("allows unrequired gates to be notApplicable", () => {
    const statuses: GateStatus[] = [
      { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "pass" },
      { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "notApplicable" },
    ];
    expect(gatesAllPassStrict(statuses, ["G_PM_2_INDEXER_ANCHOR_STALE"])).toBe(true);
  });
});

// AUDIT FIX D14-M2 — requiredSourcesFor throws on missing exitRoute
describe("requiredSourcesFor explicit exitRoute (audit D14-M2)", () => {
  it("throws for Exit without exitRoute", () => {
    expect(() => requiredSourcesFor("Exit")).toThrow(/requires opts.exitRoute/);
  });

  it("throws for AutomationExec(Exit) without exitRoute", () => {
    expect(() =>
      requiredSourcesFor("AutomationExec", { underlyingPrimaryType: "Exit" }),
    ).toThrow(/requires opts.exitRoute/);
  });

  it("works when exitRoute is explicit", () => {
    expect(requiredSourcesFor("Exit", { exitRoute: "REPAY_ONLY" })).not.toContain("curve-quote");
    expect(requiredSourcesFor("Exit", { exitRoute: "REPAY_ONLY" })).not.toContain("morpho-position");
    expect(
      requiredSourcesFor("AutomationExec", { underlyingPrimaryType: "Exit", exitRoute: "REPAY_ONLY" }),
    ).not.toContain("curve-quote");
  });

  it("AutomationExec with non-Exit underlying does not require exitRoute", () => {
    expect(requiredSourcesFor("AutomationExec", { underlyingPrimaryType: "Open" })).toContain("harvest-event");
    expect(requiredSourcesFor("AutomationExec", { underlyingPrimaryType: "Rebalance" })).toContain("curve-quote");
  });
});

// AUDIT FIX A9-L — branded type range validation
describe("brand range validators (audit A9-L)", () => {
  it("asBasisPoints rejects bigint and out-of-range values", () => {
    expect(() => asBasisPoints(70000)).toThrow(RangeError);
    expect(() => asBasisPoints(-1)).toThrow(RangeError);
    expect(() => asBasisPoints(1.5)).toThrow(RangeError);
    expect(() => asBasisPoints(0n as never)).toThrow(RangeError);
    expect(asBasisPoints(0)).toBe(0);
    expect(asBasisPoints(65535)).toBe(65535);
  });

  it("asChainId rejects out-of-range integers", () => {
    expect(() => asChainId(-1)).toThrow(RangeError);
    expect(() => asChainId(2 ** 31)).toThrow(RangeError);
    expect(asChainId(8453)).toBe(8453);
  });

  it("asStateBitmap matches uint16 bounds", () => {
    expect(() => asStateBitmap(70000)).toThrow(RangeError);
    expect(asStateBitmap(0x07ff)).toBe(0x07ff);
  });

  it("asPolicyId rejects negative or > 2^64", () => {
    expect(() => asPolicyId(-1n)).toThrow(RangeError);
    expect(() => asPolicyId(1n << 64n)).toThrow(RangeError);
    expect(asPolicyId(0n)).toBe(0n);
    expect(asPolicyId((1n << 64n) - 1n)).toBe((1n << 64n) - 1n);
  });

  it("asBlockNumber + asUnixSeconds + asRegistryVersion reject negatives", () => {
    expect(() => asBlockNumber(-1n)).toThrow(RangeError);
    expect(() => asUnixSeconds(-1n)).toThrow(RangeError);
    expect(() => asRegistryVersion(-1n)).toThrow(RangeError);
  });
});
