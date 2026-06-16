// Digest determinism + boundary tests. These do NOT pin specific hash values
// against the contract (that requires on-chain fork comparisons); they verify
// the SDK's hashing is deterministic and that every field is load-bearing.

import { describe, it, expect } from "vitest";
import {
  computeOpenDigest,
  computeRebalanceDigest,
  computeExitDigest,
  computeForceExitDigest,
  computeRevokeDigest,
  computeAutomationExecDigest,
} from "../src/eip712/digest.js";
import { computeDomainSeparator, ZERO_SALT } from "../src/eip712/domain.js";
import type {
  OpenAction,
  RebalanceAction,
  ExitAction,
  ForceExitAction,
  RevokeAction,
  AutomationExecAction,
} from "../src/types/action.js";
import {
  asAddress,
  EXAMPLE_DOMAIN,
  EXAMPLE_MARKET_PARAMS,
  EXAMPLE_SUB_HASHES,
  buildExampleOpen,
  buildExampleRebalance,
  buildExampleExit,
  buildExampleForceExit,
  buildExampleRevoke,
  buildExampleAutomationExec,
  EXAMPLE_AUTOMATION_BOUNDS,
} from "./digest-fixtures.js";

const DS = computeDomainSeparator(EXAMPLE_DOMAIN);

describe("Open digest", () => {
  it("is deterministic for identical inputs", () => {
    const action = buildExampleOpen();
    const d1 = computeOpenDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const d2 = computeOpenDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    expect(d1).toBe(d2);
  });

  it("changes when owner changes", () => {
    const baseAction = buildExampleOpen();
    const otherOwner: OpenAction = { ...baseAction, owner: asAddress("0x000000000000000000000000000000000000dead") };
    const d1 = computeOpenDigest({ action: baseAction, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const d2 = computeOpenDigest({ action: otherOwner, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    expect(d1).not.toBe(d2);
  });

  it("changes when marketParams.lltv changes", () => {
    const action = buildExampleOpen();
    const d1 = computeOpenDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const d2 = computeOpenDigest({ action, domainSeparator: DS, marketParams: { ...EXAMPLE_MARKET_PARAMS, lltv: EXAMPLE_MARKET_PARAMS.lltv + 1n }, subHashes: EXAMPLE_SUB_HASHES });
    expect(d1).not.toBe(d2);
  });

  it("changes when feeCaps inside bounds change", () => {
    const action = buildExampleOpen();
    const bumped: OpenAction = { ...action, bounds: { ...action.bounds, flashFeeCap: action.bounds.flashFeeCap + 1n } };
    const d1 = computeOpenDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const d2 = computeOpenDigest({ action: bumped, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    expect(d1).not.toBe(d2);
  });

  it("changes when domainSeparator differs (different chainId binds it)", () => {
    const otherDs = computeDomainSeparator({ ...EXAMPLE_DOMAIN, chainId: (EXAMPLE_DOMAIN.chainId + 1) as typeof EXAMPLE_DOMAIN.chainId });
    const action = buildExampleOpen();
    const d1 = computeOpenDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const d2 = computeOpenDigest({ action, domainSeparator: otherDs, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    expect(d1).not.toBe(d2);
  });
});

describe("Rebalance / Exit / ForceExit / Revoke / AutomationExec digests", () => {
  it("Rebalance digest is deterministic and differs from Open with same envelope", () => {
    const open = buildExampleOpen();
    const rebalance: RebalanceAction = buildExampleRebalance();
    const dOpen = computeOpenDigest({ action: open, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const dReb = computeRebalanceDigest({ action: rebalance, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    expect(dOpen).not.toBe(dReb);
  });

  it("Exit digest changes per routeKind only through evidenceBundleHash / subHashes", () => {
    // routeKind is not bound directly; it's routed through evidenceBundleHash + spenderListHash.
    const action: ExitAction = buildExampleExit("CURVE");
    const d1 = computeExitDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const d2 = computeExitDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: { ...EXAMPLE_SUB_HASHES, evidenceBundleHash: ("0x" + "11".repeat(32)) as `0x${string}` } });
    expect(d1).not.toBe(d2);
  });

  it("ForceExit digest binds acknowledgedRisks bitmask", () => {
    const action: ForceExitAction = buildExampleForceExit();
    const bumped: ForceExitAction = { ...action, bounds: { ...action.bounds, acknowledgedRisks: action.bounds.acknowledgedRisks ^ 1 } };
    const d1 = computeForceExitDigest({ action, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    const d2 = computeForceExitDigest({ action: bumped, domainSeparator: DS, marketParams: EXAMPLE_MARKET_PARAMS, subHashes: EXAMPLE_SUB_HASHES });
    expect(d1).not.toBe(d2);
  });

  it("Revoke digest binds policyClass", () => {
    const action: RevokeAction = buildExampleRevoke();
    const d1 = computeRevokeDigest({ action, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, effectiveBlock: 100n, policyClass: "REBALANCE" });
    const d2 = computeRevokeDigest({ action, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, effectiveBlock: 100n, policyClass: "EXIT" });
    expect(d1).not.toBe(d2);
  });

  it("AutomationExec digest binds triggerConditionHash", () => {
    const action: AutomationExecAction = buildExampleAutomationExec();
    const d1 = computeAutomationExecDigest({ action, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, bounds: EXAMPLE_AUTOMATION_BOUNDS });
    const d2 = computeAutomationExecDigest({ action, domainSeparator: DS, subHashes: EXAMPLE_SUB_HASHES, bounds: { ...EXAMPLE_AUTOMATION_BOUNDS, triggerConditionHash: ("0x" + "ff".repeat(32)) as `0x${string}` } });
    expect(d1).not.toBe(d2);
  });
});

describe("Domain separator", () => {
  it("differs when verifyingContract changes (AC-1 phishing defense)", () => {
    const a = computeDomainSeparator(EXAMPLE_DOMAIN);
    const b = computeDomainSeparator({ ...EXAMPLE_DOMAIN, verifyingContract: asAddress("0x000000000000000000000000000000000000beef") });
    expect(a).not.toBe(b);
  });

  it("uses zero salt by default in the fixture", () => {
    expect(EXAMPLE_DOMAIN.salt).toBe(ZERO_SALT);
  });
});
