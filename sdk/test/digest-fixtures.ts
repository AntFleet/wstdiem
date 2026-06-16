// Reusable test fixtures for digest tests. The values are illustrative — they
// do NOT have to match any specific on-chain digest; they exist so tests can
// vary one field at a time and assert the hash changes.

import {
  asBasisPoints,
  asBlockNumber,
  asChainId,
  asMarketId,
  asPolicyId,
  asRegistryVersion,
  asUnixSeconds,
} from "../src/types/branded.js";
import type {
  Address,
  Bytes32,
  Hex,
} from "../src/types/branded.js";
import type {
  Action,
  AutomationExecAction,
  CommonActionEnvelope,
  ExitAction,
  ExitRouteKind,
  ForceExitAction,
  OpenAction,
  RebalanceAction,
  RevokeAction,
} from "../src/types/action.js";
import { ZERO_SALT } from "../src/eip712/domain.js";
import type { Eip712Domain } from "../src/eip712/domain.js";
import type {
  DigestSubHashes,
  MorphoMarketParams,
  AutomationBoundsInputs,
} from "../src/eip712/sub-hashes.js";

export const asAddress = (a: string): Address => a as Address;
export const asBytes32 = (b: string): Bytes32 => b as Bytes32;
export const asHex = (h: string): Hex => h as Hex;

export const EXAMPLE_DOMAIN: Eip712Domain = {
  // PR-13 audit C1 fix: must match contracts/v2/LoopAuthorization.sol:27
  // EIP712_NAME = "WSTDIEM Loop".
  name: "WSTDIEM Loop",
  version: "1",
  chainId: asChainId(8453),
  verifyingContract: asAddress("0x0000000000000000000000000000000000000001"),
  salt: ZERO_SALT,
};

export const EXAMPLE_MARKET_PARAMS: MorphoMarketParams = {
  loanToken: asAddress("0x0000000000000000000000000000000000000010"),
  collateralToken: asAddress("0x0000000000000000000000000000000000000011"),
  oracle: asAddress("0x0000000000000000000000000000000000000012"),
  irm: asAddress("0x0000000000000000000000000000000000000013"),
  lltv: 800000000000000000n,
};

export const EXAMPLE_SUB_HASHES: DigestSubHashes = {
  quoteHash: asBytes32("0x" + "01".repeat(32)),
  spenderListHash: asBytes32("0x" + "02".repeat(32)),
  allowanceScheduleHash: asBytes32("0x" + "03".repeat(32)),
  feeCapHash: asBytes32("0x" + "04".repeat(32)),
  evidenceBundleHash: asBytes32("0x" + "05".repeat(32)),
};

export const EXAMPLE_AUTOMATION_BOUNDS: AutomationBoundsInputs = {
  triggerConditionHash: asBytes32("0x" + "aa".repeat(32)),
  underlyingPrimaryType: 1, // Rebalance
  underlyingActionHash: asBytes32("0x" + "bb".repeat(32)),
  policyHash: asBytes32("0x" + "cc".repeat(32)),
  boundSubsetHash: asBytes32("0x" + "dd".repeat(32)),
  notBeforeBlock: 1_000n,
  notAfterBlock: 2_000n,
};

function commonEnvelope(extra: Partial<CommonActionEnvelope> = {}): CommonActionEnvelope {
  return {
    primaryType: "Open",
    owner: asAddress("0x0000000000000000000000000000000000000020"),
    chainId: asChainId(8453),
    verifyingContract: asAddress("0x0000000000000000000000000000000000000001"),
    executor: asAddress("0x0000000000000000000000000000000000000002"),
    market: asMarketId(asBytes32("0x" + "ab".repeat(32))),
    registryVersion: asRegistryVersion(1n),
    registryMerkleRoot: asBytes32("0x" + "cd".repeat(32)),
    policyId: asPolicyId(0n),
    nonceSlot: 0n,
    nonceBit: 0,
    executionKind: "OWNER_DIRECT",
    deadline: asUnixSeconds(1_900_000_000n),
    quoteBlockNumber: asBlockNumber(123n),
    maxQuoteAgeBlocks: 5,
    maxQuoteDeviationBps: asBasisPoints(50),
    mevProtectionMode: "PRIVATE_BUILDER",
    mevWaiverBits: 0,
    evidenceBundleHash: asBytes32("0x" + "05".repeat(32)),
    ...extra,
  };
}

export function buildExampleOpen(): OpenAction {
  return {
    ...commonEnvelope({ primaryType: "Open" }),
    primaryType: "Open",
    bounds: {
      minWstDiemReceived: 1_000n,
      minBorrowedDiem: 100n,
      maxBorrowedDiem: 10_000n,
      maxSlippageBps: asBasisPoints(25),
      maxPriceImpactBps: asBasisPoints(25),
      maxLeverageBps: asBasisPoints(8500),
      minHealthFactor: 1_100_000_000_000_000_000n,
      minLiquidationDistanceBps: asBasisPoints(500),
      maxMorphoUtilizationImpactBps: asBasisPoints(500),
      flashFeeCap: 100n,
      protocolFeeCap: 50n,
      automationFeeCap: 25n,
    },
  };
}

export function buildExampleRebalance(): RebalanceAction {
  return {
    ...commonEnvelope({ primaryType: "Rebalance" }),
    primaryType: "Rebalance",
    bounds: {
      targetLeverageBps: asBasisPoints(8000),
      targetLeverageToleranceBps: asBasisPoints(100),
      minPostHealthFactor: 1_100_000_000_000_000_000n,
      minLiquidationDistanceBps: asBasisPoints(500),
      maxDebtIncrease: 1_000n,
      maxCollateralSold: 1_000n,
      maxSlippageBps: asBasisPoints(75),
      maxCurvePositionShareBps: asBasisPoints(2000),
      maxMorphoUtilizationImpactBps: asBasisPoints(500),
      flashFeeCap: 100n,
      protocolFeeCap: 50n,
      automationFeeCap: 25n,
    },
  };
}

export function buildExampleExit(routeKind: ExitRouteKind = "CURVE"): ExitAction {
  return {
    ...commonEnvelope({ primaryType: "Exit" }),
    primaryType: "Exit",
    routeKind,
    bounds: {
      minRepayment: 10_000n,
      maxCollateralSold: 100_000n,
      maxSlippageBps: asBasisPoints(75),
      maxCurvePositionShareBps: asBasisPoints(2000),
      maxMorphoUtilizationImpactBps: asBasisPoints(500),
      flashFeeCap: 100n,
      protocolFeeCap: 50n,
      automationFeeCap: 25n,
      repayOnly: routeKind === "REPAY_ONLY",
      acceptsThirdPartyRepay: false,
    },
  };
}

export function buildExampleForceExit(): ForceExitAction {
  return {
    ...commonEnvelope({ primaryType: "ForceExit" }),
    primaryType: "ForceExit",
    bounds: {
      minRepayment: 10_000n,
      maxCollateralSold: 100_000n,
      looseSlippageBps: asBasisPoints(200),
      looseFlashFeeCap: 200n,
      maxCurvePositionShareBps: asBasisPoints(2000),
      acknowledgedRisks: 1,
    },
  };
}

export function buildExampleRevoke(): RevokeAction {
  return {
    ...commonEnvelope({ primaryType: "Revoke" }),
    primaryType: "Revoke",
    revokePolicyId: asPolicyId(42n),
  };
}

export function buildExampleAutomationExec(): AutomationExecAction {
  return {
    ...commonEnvelope({ primaryType: "AutomationExec" }),
    primaryType: "AutomationExec",
    underlyingPrimaryType: "Rebalance",
    triggerConditionHash: asBytes32("0x" + "aa".repeat(32)),
    underlyingBoundsHash: asBytes32("0x" + "bb".repeat(32)),
  };
}

export function buildExampleAction(kind: Action["primaryType"]): Action {
  switch (kind) {
    case "Open": return buildExampleOpen();
    case "Rebalance": return buildExampleRebalance();
    case "Exit": return buildExampleExit();
    case "ForceExit": return buildExampleForceExit();
    case "Revoke": return buildExampleRevoke();
    case "AutomationExec": return buildExampleAutomationExec();
  }
}
