// Pre-computed sub-struct hashes that mirror LoopV1Hashing's private helpers.
// Each function takes flat inputs and produces the same bytes32 that the
// corresponding `_hash*` private function in the contract would produce.

import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import type { Address, BasisPoints, Bytes32, ChainId, Hex } from "../types/branded.js";
import {
  ACTION_IDENTITY_TYPEHASH,
  FRESHNESS_TYPEHASH,
  FEE_CAPS_TYPEHASH,
  DIGEST_HASHES_TYPEHASH,
  OPEN_BOUNDS_TYPEHASH,
  REBALANCE_BOUNDS_TYPEHASH,
  EXIT_BOUNDS_TYPEHASH,
  FORCE_EXIT_BOUNDS_TYPEHASH,
  REVOKE_BOUNDS_TYPEHASH,
  AUTOMATION_BOUNDS_TYPEHASH,
  SPENDER_LIST_TYPEHASH,
  ALLOWANCE_SCHEDULE_TYPEHASH,
  MARKET_PARAMS_TYPEHASH,
} from "./typehashes.js";

export interface IdentityInputs {
  owner: Address;
  chainId: ChainId;
  verifyingContract: Address;
  market: Bytes32;
  executor: Address;
  registryVersion: bigint;
  registryMerkleRoot: Bytes32;
  policyId: bigint;
  nonceSlot: bigint;
  nonceBit: number;
}

const IDENTITY_PARAMS = parseAbiParameters(
  "bytes32, address, uint256, address, bytes32, address, uint256, bytes32, uint64, uint248, uint8",
);

export function hashIdentity(id: IdentityInputs): Hex {
  return keccak256(
    encodeAbiParameters(IDENTITY_PARAMS, [
      ACTION_IDENTITY_TYPEHASH,
      id.owner,
      BigInt(id.chainId),
      id.verifyingContract,
      id.market,
      id.executor,
      id.registryVersion,
      id.registryMerkleRoot,
      id.policyId,
      id.nonceSlot,
      id.nonceBit,
    ]),
  );
}

export interface FreshnessInputs {
  deadline: bigint;
  quoteBlockNumber: bigint;
  maxQuoteAgeBlocks: bigint;
  maxQuoteDeviationBps: BasisPoints;
}

const FRESHNESS_PARAMS = parseAbiParameters(
  "bytes32, uint256, uint256, uint256, uint16",
);

export function hashFreshness(f: FreshnessInputs): Hex {
  return keccak256(
    encodeAbiParameters(FRESHNESS_PARAMS, [
      FRESHNESS_TYPEHASH,
      f.deadline,
      f.quoteBlockNumber,
      f.maxQuoteAgeBlocks,
      Number(f.maxQuoteDeviationBps),
    ]),
  );
}

export interface FeeCaps {
  flashFeeCap: bigint;
  protocolFeeCap: bigint;
  automationFeeCap: bigint;
}

const FEE_CAPS_PARAMS = parseAbiParameters(
  "bytes32, uint256, uint256, uint256",
);

export function hashFeeCaps(c: FeeCaps): Hex {
  return keccak256(
    encodeAbiParameters(FEE_CAPS_PARAMS, [
      FEE_CAPS_TYPEHASH,
      c.flashFeeCap,
      c.protocolFeeCap,
      c.automationFeeCap,
    ]),
  );
}

// ─── Quote / spender-list / allowance-schedule sub-hashes ────────────────────
//
// These three sub-hashes are *caller-supplied* — the on-chain validator binds
// them into the EIP-712 digest but does not recompute their internals. The SDK
// is responsible for assembling them from the caller's quote inputs.
//
// Phase 1 semantics (per §A6 / threat-model):
//   - quoteHash: derived from the chosen route's deterministic quote tuple.
//   - spenderListHash: empty allowance delta set → SPENDER_LIST_TYPEHASH +
//     keccak256("") (no spender entries authorized beyond Phase 1's standing
//     zero allowances reset every action).
//   - allowanceScheduleHash: empty sequential delta set → ALLOWANCE_SCHEDULE_TYPEHASH +
//     keccak256("") (no scheduled allowance changes in Phase 1).
//
// PR-13 implements: live builders so the SDK can supply real (non-placeholder)
// sub-hashes to buildAuthorization, and the produced EIP-712 digest matches the
// on-chain validator's recompute byte-for-byte.

const EMPTY_HASH = keccak256("0x");

const SPENDER_LIST_PARAMS = parseAbiParameters("bytes32, bytes32");

/**
 * Phase 1 spender-list hash. Until per-action spender allowances are added,
 * the sorted token/spender/allowance set is empty. The SDK still binds the
 * canonical empty-set hash into the digest so the on-chain validator's
 * recompute matches.
 */
export function emptySpenderListHash(): Hex {
  return keccak256(
    encodeAbiParameters(SPENDER_LIST_PARAMS, [SPENDER_LIST_TYPEHASH, EMPTY_HASH]),
  );
}

/**
 * Phase 1 allowance-schedule hash. Until sequential delta schedules are added,
 * the sequence is empty. See emptySpenderListHash for the binding rationale.
 */
export function emptyAllowanceScheduleHash(): Hex {
  return keccak256(
    encodeAbiParameters(SPENDER_LIST_PARAMS, [ALLOWANCE_SCHEDULE_TYPEHASH, EMPTY_HASH]),
  );
}

// ─── Per-route quote sub-hash ────────────────────────────────────────────────
//
// quoteHash binds the deterministic quote tuple chosen by the SDK into the
// digest. The validator does not enforce internal structure; it only verifies
// signature integrity. Phase 1 routes:
//   - CURVE: Curve.fi stable-swap (dx, dy_min, i, j, pool)
//   - UNISWAP_V3_FLASH: Uniswap V3 flash + swap (sqrtPriceLimitX96, tickSpacing, fee)
//   - MORPHO_FLASH: Morpho flash loan + Curve unwind path
//
// Multiple routes may participate in a single action (e.g. Open via Morpho
// flash + Curve swap). The SDK encodes the full multi-leg tuple in canonical
// order and hashes it; the same leg order is supplied off-chain to the
// keeper/relayer in the bound calldata for state-overrideable simulation.
export type QuoteRoute =
  | {
      kind: "CURVE";
      pool: Address;
      i: number;
      j: number;
      dx: bigint;
      dyMin: bigint;
    }
  | {
      kind: "UNISWAP_V3_FLASH";
      pool: Address;
      zeroForOne: boolean;
      amountSpecified: bigint;
      sqrtPriceLimitX96: bigint;
      fee: number;
    }
  | {
      kind: "MORPHO_FLASH";
      morpho: Address;
      asset: Address;
      assets: bigint;
      callbackHash: Bytes32;
    }
  | { kind: "REPAY_ONLY"; assets: bigint };

const QUOTE_CURVE_PARAMS = parseAbiParameters(
  "string, address, int128, int128, uint256, uint256",
);
const QUOTE_UNI_V3_PARAMS = parseAbiParameters(
  "string, address, bool, int256, uint160, uint24",
);
const QUOTE_MORPHO_PARAMS = parseAbiParameters(
  "string, address, address, uint256, bytes32",
);
const QUOTE_REPAY_PARAMS = parseAbiParameters("string, uint256");

function hashSingleRoute(r: QuoteRoute): Hex {
  switch (r.kind) {
    case "CURVE":
      return keccak256(
        encodeAbiParameters(QUOTE_CURVE_PARAMS, [
          "CURVE",
          r.pool,
          BigInt(r.i),
          BigInt(r.j),
          r.dx,
          r.dyMin,
        ]),
      );
    case "UNISWAP_V3_FLASH":
      return keccak256(
        encodeAbiParameters(QUOTE_UNI_V3_PARAMS, [
          "UNISWAP_V3_FLASH",
          r.pool,
          r.zeroForOne,
          r.amountSpecified,
          r.sqrtPriceLimitX96,
          r.fee,
        ]),
      );
    case "MORPHO_FLASH":
      return keccak256(
        encodeAbiParameters(QUOTE_MORPHO_PARAMS, [
          "MORPHO_FLASH",
          r.morpho,
          r.asset,
          r.assets,
          r.callbackHash,
        ]),
      );
    case "REPAY_ONLY":
      return keccak256(encodeAbiParameters(QUOTE_REPAY_PARAMS, ["REPAY_ONLY", r.assets]));
  }
}

const QUOTE_BUNDLE_PARAMS = parseAbiParameters("string, bytes32[]");

/**
 * Assemble a deterministic quoteHash from an ordered list of route legs.
 *
 * Encoding: keccak256(abi.encode("WSTDIEM_QUOTE_V1", [leg1Hash, leg2Hash, ...]))
 * where each legHash is keccak256(abi.encode(label, ...legFields)) per route kind.
 *
 * The label prefix "WSTDIEM_QUOTE_V1" pins the wire format so future quote-shape
 * additions (Phase 2 routes) get a distinct label and cannot collide.
 *
 * Order of legs matters: the validator only checks signature binding, so the
 * SDK + keeper MUST agree on leg order. The chosen convention is: flash-loan
 * leg first (if any), then swap leg(s) in execution order.
 */
export function hashQuoteRoutes(routes: readonly QuoteRoute[]): Hex {
  const legHashes = routes.map(hashSingleRoute);
  return keccak256(
    encodeAbiParameters(QUOTE_BUNDLE_PARAMS, ["WSTDIEM_QUOTE_V1", legHashes as readonly Hex[]]),
  );
}

export interface DigestSubHashes {
  quoteHash: Bytes32;
  spenderListHash: Bytes32;
  allowanceScheduleHash: Bytes32;
  feeCapHash: Bytes32;
  evidenceBundleHash: Bytes32;
}

const DIGEST_HASHES_PARAMS = parseAbiParameters(
  "bytes32, bytes32, bytes32, bytes32, bytes32, bytes32",
);

export function hashDigestHashes(h: DigestSubHashes): Hex {
  return keccak256(
    encodeAbiParameters(DIGEST_HASHES_PARAMS, [
      DIGEST_HASHES_TYPEHASH,
      h.quoteHash,
      h.spenderListHash,
      h.allowanceScheduleHash,
      h.feeCapHash,
      h.evidenceBundleHash,
    ]),
  );
}

export interface MorphoMarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

const MARKET_PARAMS_PARAMS = parseAbiParameters(
  "bytes32, address, address, address, address, uint256",
);

// MorphoMarketParams is a referenced struct in the canonical action encodeType,
// so _hashMarketParams in LoopV1Hashing prefixes MORPHO_MARKET_PARAMS_TYPEHASH.
// This mirrors viem's hashStruct(MorphoMarketParams) exactly.
export function hashMarketParams(p: MorphoMarketParams): Hex {
  return keccak256(
    encodeAbiParameters(MARKET_PARAMS_PARAMS, [
      MARKET_PARAMS_TYPEHASH,
      p.loanToken,
      p.collateralToken,
      p.oracle,
      p.irm,
      p.lltv,
    ]),
  );
}

export interface OpenBoundsInputs {
  minWstDiemReceived: bigint;
  minBorrowedDiem: bigint;
  maxBorrowedDiem: bigint;
  maxSlippageBps: BasisPoints;
  maxPriceImpactBps: BasisPoints;
  maxLeverageBps: BasisPoints;
  minHealthFactor: bigint;
  minLiquidationDistanceBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  feeCaps: FeeCaps;
}

const OPEN_BOUNDS_PARAMS = parseAbiParameters(
  "bytes32, uint256, uint256, uint256, uint16, uint16, uint16, uint256, uint16, uint16, bytes32",
);

export function hashOpenBounds(b: OpenBoundsInputs): Hex {
  return keccak256(
    encodeAbiParameters(OPEN_BOUNDS_PARAMS, [
      OPEN_BOUNDS_TYPEHASH,
      b.minWstDiemReceived,
      b.minBorrowedDiem,
      b.maxBorrowedDiem,
      Number(b.maxSlippageBps),
      Number(b.maxPriceImpactBps),
      Number(b.maxLeverageBps),
      b.minHealthFactor,
      Number(b.minLiquidationDistanceBps),
      Number(b.maxMorphoUtilizationImpactBps),
      hashFeeCaps(b.feeCaps),
    ]),
  );
}

export interface RebalanceBoundsInputs {
  targetLeverageBps: BasisPoints;
  targetLeverageToleranceBps: BasisPoints;
  minPostHealthFactor: bigint;
  minLiquidationDistanceBps: BasisPoints;
  maxDebtIncrease: bigint;
  maxCollateralSold: bigint;
  maxSlippageBps: BasisPoints;
  maxCurvePositionShareBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  feeCaps: FeeCaps;
}

const REBALANCE_BOUNDS_PARAMS = parseAbiParameters(
  "bytes32, uint16, uint16, uint256, uint16, uint256, uint256, uint16, uint16, uint16, bytes32",
);

export function hashRebalanceBounds(b: RebalanceBoundsInputs): Hex {
  return keccak256(
    encodeAbiParameters(REBALANCE_BOUNDS_PARAMS, [
      REBALANCE_BOUNDS_TYPEHASH,
      Number(b.targetLeverageBps),
      Number(b.targetLeverageToleranceBps),
      b.minPostHealthFactor,
      Number(b.minLiquidationDistanceBps),
      b.maxDebtIncrease,
      b.maxCollateralSold,
      Number(b.maxSlippageBps),
      Number(b.maxCurvePositionShareBps),
      Number(b.maxMorphoUtilizationImpactBps),
      hashFeeCaps(b.feeCaps),
    ]),
  );
}

export interface ExitBoundsInputs {
  minRepayment: bigint;
  maxCollateralSold: bigint;
  maxSlippageBps: BasisPoints;
  maxCurvePositionShareBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  feeCaps: FeeCaps;
  repayOnly: boolean;
  acceptsThirdPartyRepay: boolean;
}

const EXIT_BOUNDS_PARAMS = parseAbiParameters(
  "bytes32, uint256, uint256, uint16, uint16, uint16, bytes32, bool, bool",
);

export function hashExitBounds(b: ExitBoundsInputs): Hex {
  return keccak256(
    encodeAbiParameters(EXIT_BOUNDS_PARAMS, [
      EXIT_BOUNDS_TYPEHASH,
      b.minRepayment,
      b.maxCollateralSold,
      Number(b.maxSlippageBps),
      Number(b.maxCurvePositionShareBps),
      Number(b.maxMorphoUtilizationImpactBps),
      hashFeeCaps(b.feeCaps),
      b.repayOnly,
      b.acceptsThirdPartyRepay,
    ]),
  );
}

export interface ForceExitBoundsInputs {
  minRepayment: bigint;
  maxCollateralSold: bigint;
  looseSlippageBps: BasisPoints;
  looseFlashFeeCap: bigint;
  maxCurvePositionShareBps: BasisPoints;
  acknowledgedRisks: number;
}

const FORCE_EXIT_BOUNDS_PARAMS = parseAbiParameters(
  "bytes32, uint256, uint256, uint16, uint256, uint16, uint8",
);

export function hashForceExitBounds(b: ForceExitBoundsInputs): Hex {
  return keccak256(
    encodeAbiParameters(FORCE_EXIT_BOUNDS_PARAMS, [
      FORCE_EXIT_BOUNDS_TYPEHASH,
      b.minRepayment,
      b.maxCollateralSold,
      Number(b.looseSlippageBps),
      b.looseFlashFeeCap,
      Number(b.maxCurvePositionShareBps),
      b.acknowledgedRisks,
    ]),
  );
}

export interface RevokeBoundsInputs {
  policyId: bigint;
  policyClass: number;
  effectiveBlock: bigint;
}

const REVOKE_BOUNDS_PARAMS = parseAbiParameters(
  "bytes32, uint64, uint8, uint256",
);

export function hashRevokeBounds(b: RevokeBoundsInputs): Hex {
  return keccak256(
    encodeAbiParameters(REVOKE_BOUNDS_PARAMS, [
      REVOKE_BOUNDS_TYPEHASH,
      b.policyId,
      b.policyClass,
      b.effectiveBlock,
    ]),
  );
}

export interface AutomationBoundsInputs {
  triggerConditionHash: Bytes32;
  underlyingPrimaryType: number;
  underlyingActionHash: Bytes32;
  policyHash: Bytes32;
  boundSubsetHash: Bytes32;
  notBeforeBlock: bigint;
  notAfterBlock: bigint;
}

const AUTOMATION_BOUNDS_PARAMS = parseAbiParameters(
  "bytes32, bytes32, uint8, bytes32, bytes32, bytes32, uint256, uint256",
);

export function hashAutomationBounds(b: AutomationBoundsInputs): Hex {
  return keccak256(
    encodeAbiParameters(AUTOMATION_BOUNDS_PARAMS, [
      AUTOMATION_BOUNDS_TYPEHASH,
      b.triggerConditionHash,
      b.underlyingPrimaryType,
      b.underlyingActionHash,
      b.policyHash,
      b.boundSubsetHash,
      b.notBeforeBlock,
      b.notAfterBlock,
    ]),
  );
}
