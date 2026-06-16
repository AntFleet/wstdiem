// Action union per the SDK type definitions (lines 490-586).

import type {
  Address,
  Bytes32,
  Hex,
  BlockNumber,
  ChainId,
  MarketId,
  PolicyId,
  RegistryVersion,
  BasisPoints,
  ActionDigest,
  UnixSeconds,
} from "./branded.js";
import type {
  ExecutionKind,
  MevProtectionMode,
  PrimaryType,
} from "./enums.js";

export interface Market {
  id: MarketId;
  chainId: ChainId;
  loanToken: Address;
  collateralToken: Address;
  morpho: Address;
  vault: Address;
  curvePool?: Address;
  uniswapV3FlashPool: Address;
  chainlinkFeed?: Address;
  sequencerUptimeFeed: Address;
  registryVersion: RegistryVersion;
  registryMerkleRoot: Bytes32;
}

export interface CommonActionEnvelope {
  primaryType: PrimaryType;
  owner: Address;
  chainId: ChainId;
  verifyingContract: Address;
  executor: Address;
  market: MarketId;
  registryVersion: RegistryVersion;
  registryMerkleRoot: Bytes32;
  policyId: PolicyId;
  nonceSlot: bigint;
  nonceBit: number;
  executionKind: ExecutionKind;
  deadline: UnixSeconds;
  quoteBlockNumber: BlockNumber;
  maxQuoteAgeBlocks: number;
  maxQuoteDeviationBps: BasisPoints;
  mevProtectionMode: MevProtectionMode;
  mevWaiverBits: number;
  eip1271PreimageDisplayProof?: Hex;
  evidenceBundleHash: Bytes32;
}

export interface OpenBounds {
  minWstDiemReceived: bigint;
  minBorrowedDiem: bigint;
  maxBorrowedDiem: bigint;
  maxSlippageBps: BasisPoints;
  maxPriceImpactBps: BasisPoints;
  maxLeverageBps: BasisPoints;
  minHealthFactor: bigint;
  minLiquidationDistanceBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  flashFeeCap: bigint;
  protocolFeeCap: bigint;
  automationFeeCap: bigint;
}

export interface RebalanceBounds {
  targetLeverageBps: BasisPoints;
  targetLeverageToleranceBps: BasisPoints;
  minPostHealthFactor: bigint;
  minLiquidationDistanceBps: BasisPoints;
  maxDebtIncrease: bigint;
  maxCollateralSold: bigint;
  maxSlippageBps: BasisPoints;
  maxCurvePositionShareBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  flashFeeCap: bigint;
  protocolFeeCap: bigint;
  automationFeeCap: bigint;
}

export interface ExitBounds {
  minRepayment: bigint;
  maxCollateralSold: bigint;
  maxSlippageBps: BasisPoints;
  maxCurvePositionShareBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  flashFeeCap: bigint;
  protocolFeeCap: bigint;
  automationFeeCap: bigint;
  repayOnly: boolean;
  acceptsThirdPartyRepay: boolean;
}

export interface ForceExitBounds {
  minRepayment: bigint;
  maxCollateralSold: bigint;
  looseSlippageBps: BasisPoints;
  looseFlashFeeCap: bigint;
  maxCurvePositionShareBps: BasisPoints;
  acknowledgedRisks: number;
}

export type ExitRouteKind = "CURVE" | "CURVE_FREE" | "REPAY_ONLY";

export type Action =
  | (CommonActionEnvelope & { primaryType: "Open"; bounds: OpenBounds })
  | (CommonActionEnvelope & { primaryType: "Rebalance"; bounds: RebalanceBounds })
  | (CommonActionEnvelope & {
      primaryType: "Exit";
      bounds: ExitBounds;
      routeKind: ExitRouteKind;
    })
  | (CommonActionEnvelope & { primaryType: "ForceExit"; bounds: ForceExitBounds })
  | (CommonActionEnvelope & {
      primaryType: "AutomationExec";
      underlyingPrimaryType: Exclude<PrimaryType, "AutomationExec" | "Revoke">;
      triggerConditionHash: Bytes32;
      underlyingBoundsHash: Bytes32;
    })
  | (CommonActionEnvelope & {
      primaryType: "Revoke";
      revokePolicyId?: PolicyId;
      revokeDigest?: ActionDigest;
    });

export type OpenAction = Extract<Action, { primaryType: "Open" }>;
export type RebalanceAction = Extract<Action, { primaryType: "Rebalance" }>;
export type ExitAction = Extract<Action, { primaryType: "Exit" }>;
export type ForceExitAction = Extract<Action, { primaryType: "ForceExit" }>;
export type AutomationExecAction = Extract<Action, { primaryType: "AutomationExec" }>;
export type RevokeAction = Extract<Action, { primaryType: "Revoke" }>;
