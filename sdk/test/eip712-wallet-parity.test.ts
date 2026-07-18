// EIP-712 WALLET PARITY ORACLE (Phase A acceptance gate).
//
// Proves that the canonical typed-data this SDK hands a wallet reproduces the
// SDK's own on-chain digest. viem's hashTypedData is the EIP-712 reference
// implementation, so:
//
//   hashTypedData(buildActionTypedData(action)) === computeDigest(action)
//
// If this holds, a spec-compliant wallet's eth_signTypedData_v4 produces a
// signature the on-chain validator (which recomputes computeDigest's Solidity
// twin) accepts. A committed cross-language fixture (eip712-open-parity.json,
// also consumed by test/foundry/v2/Eip712WalletParity.t.sol) pins the shared
// digest so contract-hashOpen == viem-hashTypedData == SDK-digest is asserted
// from both sides.

import { describe, it, expect } from "vitest";
import { hashTypedData, type TypedData, type TypedDataDomain } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeDomainSeparator } from "../src/eip712/domain.js";
import {
  computeOpenDigest,
  computeRebalanceDigest,
  computeExitDigest,
  computeForceExitDigest,
} from "../src/eip712/digest.js";
import { buildActionTypedData } from "../src/eip712/typed-data.js";
import {
  EXAMPLE_DOMAIN,
  EXAMPLE_MARKET_PARAMS,
  EXAMPLE_SUB_HASHES,
  buildExampleOpen,
  buildExampleRebalance,
  buildExampleExit,
  buildExampleForceExit,
  asAddress,
  asBytes32,
} from "./digest-fixtures.js";
import type { OpenAction } from "../src/types/action.js";
import {
  asBasisPoints,
  asBlockNumber,
  asChainId,
  asMarketId,
  asPolicyId,
  asRegistryVersion,
  asUnixSeconds,
} from "../src/types/branded.js";

// EXAMPLE_DOMAIN as a viem TypedDataDomain (chainId as number).
const viemDomain: TypedDataDomain = {
  name: EXAMPLE_DOMAIN.name,
  version: EXAMPLE_DOMAIN.version,
  chainId: Number(EXAMPLE_DOMAIN.chainId),
  verifyingContract: EXAMPLE_DOMAIN.verifyingContract,
  salt: EXAMPLE_DOMAIN.salt,
};
const DS = computeDomainSeparator(EXAMPLE_DOMAIN);

describe("EIP-712 wallet parity: hashTypedData(typedData) === computeDigest", () => {
  it("Open", () => {
    const action = buildExampleOpen();
    const digest = computeOpenDigest({
      action,
      domainSeparator: DS,
      marketParams: EXAMPLE_MARKET_PARAMS,
      subHashes: EXAMPLE_SUB_HASHES,
    });
    const td = buildActionTypedData(action, EXAMPLE_MARKET_PARAMS, EXAMPLE_SUB_HASHES, viemDomain);
    expect(
      hashTypedData({
        domain: td.domain,
        types: td.types as TypedData,
        primaryType: td.primaryType,
        message: td.message,
      }),
    ).toBe(digest);
  });

  it("Rebalance", () => {
    const action = buildExampleRebalance();
    const digest = computeRebalanceDigest({
      action,
      domainSeparator: DS,
      marketParams: EXAMPLE_MARKET_PARAMS,
      subHashes: EXAMPLE_SUB_HASHES,
    });
    const td = buildActionTypedData(action, EXAMPLE_MARKET_PARAMS, EXAMPLE_SUB_HASHES, viemDomain);
    expect(
      hashTypedData({
        domain: td.domain,
        types: td.types as TypedData,
        primaryType: td.primaryType,
        message: td.message,
      }),
    ).toBe(digest);
  });

  it("Exit", () => {
    const action = buildExampleExit();
    const digest = computeExitDigest({
      action,
      domainSeparator: DS,
      marketParams: EXAMPLE_MARKET_PARAMS,
      subHashes: EXAMPLE_SUB_HASHES,
    });
    const td = buildActionTypedData(action, EXAMPLE_MARKET_PARAMS, EXAMPLE_SUB_HASHES, viemDomain);
    expect(
      hashTypedData({
        domain: td.domain,
        types: td.types as TypedData,
        primaryType: td.primaryType,
        message: td.message,
      }),
    ).toBe(digest);
  });

  it("ForceExit", () => {
    const action = buildExampleForceExit();
    const digest = computeForceExitDigest({
      action,
      domainSeparator: DS,
      marketParams: EXAMPLE_MARKET_PARAMS,
      subHashes: EXAMPLE_SUB_HASHES,
    });
    const td = buildActionTypedData(action, EXAMPLE_MARKET_PARAMS, EXAMPLE_SUB_HASHES, viemDomain);
    expect(
      hashTypedData({
        domain: td.domain,
        types: td.types as TypedData,
        primaryType: td.primaryType,
        message: td.message,
      }),
    ).toBe(digest);
  });
});

// ─── Shared cross-language fixture ───────────────────────────────────────────

interface OpenParityFixture {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
    salt: string;
  };
  message: {
    identity: Record<string, string>;
    freshness: Record<string, string>;
    executionKind: string;
    mevProtectionMode: string;
    mevWaiverBits: string;
    marketParams: Record<string, string>;
    feeCaps: { flashFeeCap: string; protocolFeeCap: string; automationFeeCap: string };
    bounds: Record<string, string>;
    hashes: Record<string, string>;
  };
  expectedDigest: string;
}

const fixture: OpenParityFixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/eip712-open-parity.json", import.meta.url)),
    "utf8",
  ),
);

describe("EIP-712 shared cross-language fixture (contract == viem == SDK)", () => {
  it("SDK computeOpenDigest reproduces the committed fixture digest", () => {
    const m = fixture.message;
    const action: OpenAction = {
      primaryType: "Open",
      owner: asAddress(m.identity.owner),
      chainId: asChainId(Number(m.identity.chainId)),
      verifyingContract: asAddress(m.identity.verifyingContract),
      executor: asAddress(m.identity.executor),
      market: asMarketId(asBytes32(m.identity.market)),
      registryVersion: asRegistryVersion(BigInt(m.identity.registryVersion)),
      registryMerkleRoot: asBytes32(m.identity.registryMerkleRoot),
      policyId: asPolicyId(BigInt(m.identity.policyId)),
      nonceSlot: BigInt(m.identity.nonceSlot),
      nonceBit: Number(m.identity.nonceBit),
      executionKind: "OWNER_DIRECT", // executionKind "0"
      deadline: asUnixSeconds(BigInt(m.freshness.deadline)),
      quoteBlockNumber: asBlockNumber(BigInt(m.freshness.quoteBlockNumber)),
      maxQuoteAgeBlocks: Number(m.freshness.maxQuoteAgeBlocks),
      maxQuoteDeviationBps: asBasisPoints(Number(m.freshness.maxQuoteDeviationBps)),
      mevProtectionMode: "PRIVATE_BUILDER", // mevProtectionMode "1"
      mevWaiverBits: Number(m.mevWaiverBits),
      evidenceBundleHash: asBytes32(m.hashes.evidenceBundleHash),
      bounds: {
        minWstDiemReceived: BigInt(m.bounds.minWstDiemReceived),
        minBorrowedDiem: BigInt(m.bounds.minBorrowedDiem),
        maxBorrowedDiem: BigInt(m.bounds.maxBorrowedDiem),
        maxSlippageBps: asBasisPoints(Number(m.bounds.maxSlippageBps)),
        maxPriceImpactBps: asBasisPoints(Number(m.bounds.maxPriceImpactBps)),
        maxLeverageBps: asBasisPoints(Number(m.bounds.maxLeverageBps)),
        minHealthFactor: BigInt(m.bounds.minHealthFactor),
        minLiquidationDistanceBps: asBasisPoints(Number(m.bounds.minLiquidationDistanceBps)),
        maxMorphoUtilizationImpactBps: asBasisPoints(Number(m.bounds.maxMorphoUtilizationImpactBps)),
        flashFeeCap: BigInt(m.feeCaps.flashFeeCap),
        protocolFeeCap: BigInt(m.feeCaps.protocolFeeCap),
        automationFeeCap: BigInt(m.feeCaps.automationFeeCap),
      },
    };
    const ds = computeDomainSeparator({
      name: fixture.domain.name,
      version: fixture.domain.version,
      chainId: asChainId(fixture.domain.chainId),
      verifyingContract: asAddress(fixture.domain.verifyingContract),
      salt: asBytes32(fixture.domain.salt),
    });
    const digest = computeOpenDigest({
      action,
      domainSeparator: ds,
      marketParams: {
        loanToken: asAddress(m.marketParams.loanToken),
        collateralToken: asAddress(m.marketParams.collateralToken),
        oracle: asAddress(m.marketParams.oracle),
        irm: asAddress(m.marketParams.irm),
        lltv: BigInt(m.marketParams.lltv),
      },
      subHashes: {
        quoteHash: asBytes32(m.hashes.quoteHash),
        spenderListHash: asBytes32(m.hashes.spenderListHash),
        allowanceScheduleHash: asBytes32(m.hashes.allowanceScheduleHash),
        feeCapHash: asBytes32(m.hashes.feeCapHash),
        evidenceBundleHash: asBytes32(m.hashes.evidenceBundleHash),
      },
    });
    expect(digest).toBe(fixture.expectedDigest);
  });
});
