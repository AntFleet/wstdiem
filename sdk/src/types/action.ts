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

// ─── Friendly envelope-derivation inputs (T2a) ──────────────────────────────
//
// The `build{Open,Rebalance,Exit,ForceExit}Params` helpers take these
// human-facing inputs (amount, leverage, MEV mode) and derive the fully-
// assembled `CommonActionEnvelope & { bounds }` envelope — sourcing
// registryVersion / merkleRoot / nonce / quoteBlockNumber / evidenceBundleHash
// from the live readers so the caller never hand-builds a security-critical
// digest field. The screens (LoopBuilder / Positions) feed the result straight
// into `quoteOpen` / `previewTransaction` / `quoteForceExit`.

/** Fields common to every build-params input. */
export interface BuildParamsCommon {
  market: MarketId;
  owner: Address;
  mevProtectionMode: MevProtectionMode;
  mevWaiverBits: number;
  /** Slippage tolerance for the derived bounds. Default 50 bps (0.5%). */
  slippageBps?: BasisPoints;
  /** Seconds from now until the action deadline. Default 600 (10 min). */
  deadlineSeconds?: number;
  /**
   * Execution mode the owner signs over. Defaults to `KEEPER_PERMISSIONLESS`
   * because users act *through* the executor, so the on-chain `validateOpen`
   * sees the executor (not the owner) as the caller — `OWNER_DIRECT` can never
   * satisfy `executionCaller == owner` in that path. Callers who genuinely
   * self-execute can opt into `OWNER_DIRECT`.
   */
  executionKind?: ExecutionKind;
}

export interface BuildOpenParamsInput extends BuildParamsCommon {
  /** wstDIEM collateral (equity) the user supplies. */
  collateralAmount: bigint;
  /** Target leverage in basis points (e.g. 20_000 = 2.0x). */
  leverageBps: BasisPoints;
}

export interface BuildRebalanceParamsInput extends BuildParamsCommon {
  /** Notional collateral budget for the rebalance leg. */
  collateralAmount: bigint;
  /** Target post-rebalance leverage in basis points. */
  leverageBps: BasisPoints;
}

export interface BuildExitParamsInput extends BuildParamsCommon {
  /** Collateral to unwind (wstDIEM). */
  collateralAmount: bigint;
  /** Exit route; defaults to "CURVE". */
  routeKind?: ExitRouteKind;
}

export interface BuildForceExitParamsInput extends BuildParamsCommon {
  /** Collateral to unwind (wstDIEM). */
  collateralAmount: bigint;
  /** Bitmask of acknowledged force-exit risks (see `ForceExitRiskBit`). */
  acknowledgedRisks: number;
}
