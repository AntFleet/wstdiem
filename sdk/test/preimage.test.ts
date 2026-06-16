import { describe, it, expect } from "vitest";
import {
  computePreimageDisplayProof,
  isHighRiskByDigest,
  requiresPreimageProof,
  buildPreimageProof,
} from "../src/preimage/i66.js";
import {
  asAddress,
  asBytes32,
} from "./digest-fixtures.js";
import { asMarketId, asUnixSeconds } from "../src/types/branded.js";

const BASE_INPUTS: Parameters<typeof computePreimageDisplayProof>[0] = {
  owner: asAddress("0x0000000000000000000000000000000000000020"),
  primaryType: "Open",
  executionKind: "OWNER_DIRECT",
  mevProtectionMode: "PRIVATE_BUILDER",
  mevWaiverBits: 0,
  acknowledgedRisks: 0,
  policyClass: "OPEN",
  market: asMarketId(asBytes32("0x" + "ab".repeat(32))),
  registryVersion: 1n,
  nonceSlot: 0n,
  nonceBit: 0,
  maxCollateralSold: 0n,
  maxDebtIncrease: 0n,
  deadline: asUnixSeconds(1_900_000_000n),
  verifyingContract: asAddress("0x0000000000000000000000000000000000000001"),
};

describe("I-66 EIP-1271 preimage display proof", () => {
  it("is deterministic", () => {
    const a = computePreimageDisplayProof(BASE_INPUTS);
    const b = computePreimageDisplayProof(BASE_INPUTS);
    expect(a).toBe(b);
  });

  it("changes when primaryType changes", () => {
    const a = computePreimageDisplayProof(BASE_INPUTS);
    const b = computePreimageDisplayProof({ ...BASE_INPUTS, primaryType: "ForceExit" });
    expect(a).not.toBe(b);
  });

  it("changes when verifyingContract changes (AC-1 binding)", () => {
    const a = computePreimageDisplayProof(BASE_INPUTS);
    const b = computePreimageDisplayProof({
      ...BASE_INPUTS,
      verifyingContract: asAddress("0x0000000000000000000000000000000000000099"),
    });
    expect(a).not.toBe(b);
  });

  it("buildPreimageProof returns proof + echoed fields", () => {
    const built = buildPreimageProof(BASE_INPUTS);
    expect(built.proof).toMatch(/^0x[0-9a-f]{64}$/);
    expect(built.attestedFields.primaryType).toBe("Open");
  });
});

describe("isHighRiskByDigest", () => {
  it("Open is always high-risk", () => {
    expect(isHighRiskByDigest({ primaryType: "Open" })).toBe(true);
  });
  it("ForceExit is always high-risk", () => {
    expect(isHighRiskByDigest({ primaryType: "ForceExit" })).toBe(true);
  });
  it("Rebalance is high-risk only when maxDebtIncrease > 0", () => {
    expect(isHighRiskByDigest({ primaryType: "Rebalance", maxDebtIncrease: 0n })).toBe(false);
    expect(isHighRiskByDigest({ primaryType: "Rebalance", maxDebtIncrease: 1n })).toBe(true);
  });
  it("AutomationExec defers to underlying classification", () => {
    expect(isHighRiskByDigest({ primaryType: "AutomationExec", isUnderlyingHighRisk: false })).toBe(false);
    expect(isHighRiskByDigest({ primaryType: "AutomationExec", isUnderlyingHighRisk: true })).toBe(true);
  });
  it("Exit and Revoke are never digest-content high-risk", () => {
    expect(isHighRiskByDigest({ primaryType: "Exit" })).toBe(false);
    expect(isHighRiskByDigest({ primaryType: "Revoke" })).toBe(false);
  });
});

describe("requiresPreimageProof", () => {
  it("bypasses when signer is on allow-list", () => {
    expect(
      requiresPreimageProof({
        primaryType: "Open",
        signerOnAllowList: true,
      }),
    ).toBe(false);
  });

  it("requires proof for Open when signer not on allow-list", () => {
    expect(
      requiresPreimageProof({
        primaryType: "Open",
        signerOnAllowList: false,
      }),
    ).toBe(true);
  });

  it("does not require proof for plain Exit", () => {
    expect(
      requiresPreimageProof({
        primaryType: "Exit",
        signerOnAllowList: false,
      }),
    ).toBe(false);
  });
});
