// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopExecutorBase} from "../LoopExecutorBase.sol";
import {LoopV1Errors} from "./LoopV1Errors.sol";
import {LoopV1Types} from "./LoopV1Types.sol";

interface IMorphoPositionMinimal {
    function position(bytes32 market, address owner)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);

    function market(bytes32 market)
        external
        view
        returns (
            uint128 totalSupplyAssets,
            uint128 totalSupplyShares,
            uint128 totalBorrowAssets,
            uint128 totalBorrowShares,
            uint128 lastUpdate,
            uint128 fee
        );
}

interface IOraclePriceMinimal {
    function price() external view returns (uint256);
}

interface ICurvePoolMinimal {
    function exchange(int128 i, int128 j, uint256 dx, uint256 minDy) external returns (uint256);
    function balances(int128 i) external view returns (uint256);
}

/// @notice External position/health math shared by LoopExecutorV2 and LoopForceExitExecutor.
/// @dev Extracted verbatim from LoopExecutorBase to shrink executor bytecode (EIP-170). Functions
///      operate only on their parameters + external calls to passed-in addresses; they never read
///      executor storage or immutables. Deployed once and delegatecalled.
library LoopV1PositionMath {
    uint256 internal constant MORPHO_ORACLE_PRICE_SCALE = 1e36;
    uint256 internal constant WAD = 1e18;

    function snapshotPosition(
        address morpho,
        address adapter,
        bytes32 market,
        address owner,
        LoopV1Types.MorphoMarketParams memory params
    ) public view returns (LoopExecutorBase.PositionSnapshot memory snapshot) {
        (snapshot.debt, snapshot.collateral, snapshot.healthFactor) =
            readMorphoPosition(morpho, market, owner, params);
        snapshot.leverageBps = currentLeverageBps(adapter, owner, market, snapshot.debt, snapshot.collateral);
        snapshot.liquidationDistanceBps = currentLiquidationDistanceBps(adapter, owner, market, snapshot.healthFactor);
        snapshot.utilizationBps = currentUtilizationBps(adapter, market);
    }

    function enforcePostState(
        LoopExecutorBase.FlashContext memory context,
        LoopV1Types.LoopActionResult memory result,
        LoopExecutorBase.PositionSnapshot memory postState
    ) public pure {
        if (_isDebtReducingMode(context)) {
            if (postState.debt >= context.preState.debt) revert LoopV1Errors.DebtNotReduced();
            if (postState.healthFactor <= context.preState.healthFactor) {
                revert LoopV1Errors.HealthFactorBoundFailure();
            }
        }
        if (context.minPostHealthFactor != 0 && postState.healthFactor < context.minPostHealthFactor) {
            revert LoopV1Errors.HealthFactorBoundFailure();
        }
        if (
            context.minLiquidationDistanceBps != 0
                && postState.liquidationDistanceBps < context.minLiquidationDistanceBps
        ) revert LoopV1Errors.LiquidationDistanceBoundFailure();
        if (context.maxMorphoUtilizationImpactBps != 0) {
            uint16 impact = postState.utilizationBps > context.preState.utilizationBps
                ? postState.utilizationBps - context.preState.utilizationBps
                : uint16(0);
            if (impact > context.maxMorphoUtilizationImpactBps) revert LoopV1Errors.UtilizationImpactExceeded();
        }
        if (context.maxLeverageBps != 0 && postState.leverageBps > context.maxLeverageBps) {
            revert LoopV1Errors.LeverageBoundFailure();
        }
        if (context.targetLeverageBps != 0) {
            uint256 delta = postState.leverageBps > context.targetLeverageBps
                ? postState.leverageBps - context.targetLeverageBps
                : context.targetLeverageBps - postState.leverageBps;
            if (delta > context.targetLeverageToleranceBps) revert LoopV1Errors.LeverageBoundFailure();
        }
        if (context.minWstDiemReceived != 0 && result.collateralWstDiem < context.minWstDiemReceived) {
            revert LoopV1Errors.VaultDepositShortfall();
        }
        if (context.maxBorrowedDiem != 0) {
            if (result.borrowedDiem < context.minBorrowedDiem || result.borrowedDiem > context.maxBorrowedDiem) {
                revert LoopV1Errors.BorrowedDiemOutOfBand();
            }
        }
    }

    function _isDebtReducingMode(LoopExecutorBase.FlashContext memory context) private pure returns (bool) {
        if (context.primaryType == uint8(LoopV1Types.PrimaryType.FORCE_EXIT)) return true;
        if (context.primaryType == uint8(LoopV1Types.PrimaryType.EXIT)) return true;
        if (context.primaryType == uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)) return true;
        return context.primaryType == uint8(LoopV1Types.PrimaryType.REBALANCE) && context.borrowAssets == 0;
    }

    function enforceCurveBounds(
        uint16 maxSlippageBps,
        uint16 maxCurvePositionShareBps,
        uint256 withdrawCollateralAssets,
        uint256 diemReceived,
        address curvePool
    ) public view {
        if (maxSlippageBps != 0 && withdrawCollateralAssets != 0) {
            uint256 quote = withdrawCollateralAssets;
            uint256 delta = diemReceived > quote ? diemReceived - quote : quote - diemReceived;
            if (delta * 10_000 > quote * maxSlippageBps) revert LoopV1Errors.CurveSlippageExceeded();
        }
        if (maxCurvePositionShareBps != 0 && withdrawCollateralAssets != 0) {
            uint256 depth = curveDepth(curvePool);
            if (depth == 0) revert LoopV1Errors.CurveLiquidityInsufficient();
            if (withdrawCollateralAssets * 10_000 > depth * maxCurvePositionShareBps) {
                revert LoopV1Errors.CurveShareExceeded();
            }
        }
    }

    function readMorphoPosition(
        address morpho,
        bytes32 market,
        address owner,
        LoopV1Types.MorphoMarketParams memory params
    ) public view returns (uint256 debt, uint256 collateral, uint256 healthFactor) {
        if (morpho == address(0)) revert LoopV1Errors.MorphoEvidenceMissing();
        uint256 borrowShares;
        try IMorphoPositionMinimal(morpho).position(market, owner) returns (
            uint256, uint128 borrowShares_, uint128 collateralAssets
        ) {
            borrowShares = uint256(borrowShares_);
            collateral = uint256(collateralAssets);
        } catch {
            revert LoopV1Errors.MorphoEvidenceMissing();
        }
        // Critical (2026-06-17 F01): Morpho stores borrow as shares. Convert to assets so repay,
        // flash sizing, and HF use the interest-accrued debt, not raw share units.
        debt = borrowSharesToAssets(morpho, market, borrowShares);
        healthFactor = healthFactorWad(debt, collateral, params);
    }

    function borrowSharesToAssets(address morpho, bytes32 market, uint256 borrowShares)
        public
        view
        returns (uint256 assets)
    {
        if (borrowShares == 0) return 0;
        try IMorphoPositionMinimal(morpho).market(market) returns (
            uint128, uint128, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128, uint128
        ) {
            if (totalBorrowShares == 0) return borrowShares;
            // Morpho Blue ceilings asset conversion on repay; use ceilDiv so we never under-repay.
            return (borrowShares * uint256(totalBorrowAssets) + uint256(totalBorrowShares) - 1)
                / uint256(totalBorrowShares);
        } catch {
            revert LoopV1Errors.MorphoEvidenceMissing();
        }
    }

    function healthFactorWad(uint256 debt, uint256 collateral, LoopV1Types.MorphoMarketParams memory params)
        public
        view
        returns (uint256)
    {
        if (debt == 0) return type(uint256).max;
        uint256 priceWad = WAD;
        if (params.oracle != address(0)) {
            try IOraclePriceMinimal(params.oracle).price() returns (uint256 oraclePrice) {
                if (oraclePrice != 0) priceWad = normalizeOraclePriceToWad(oraclePrice);
            } catch {}
        }
        uint256 lltvWad = params.lltv <= 10_000 ? params.lltv * 1e14 : params.lltv;
        if (lltvWad == 0) revert LoopV1Errors.HealthIndeterminate();
        // collateralValue (WAD units of loan token) * lltv / debt
        return collateral * priceWad / WAD * lltvWad / debt;
    }

    /// @dev Accept Morpho-scale (≈1e36) or WAD-scale (1e18) oracle prices used by mocks.
    function normalizeOraclePriceToWad(uint256 rawPrice) public pure returns (uint256) {
        if (rawPrice == 0) return 0;
        // Morpho Blue collateral/loan price for 18-decimal pairs is around 1e36.
        if (rawPrice >= 1e30) return rawPrice / (MORPHO_ORACLE_PRICE_SCALE / WAD);
        return rawPrice;
    }

    function curveDepth(address curve) public view returns (uint256 depth) {
        if (curve == address(0)) return 0;
        try ICurvePoolMinimal(curve).balances(1) returns (uint256 balance) {
            return balance;
        } catch {
            return 0;
        }
    }

    function currentLeverageBps(address adapter, address owner, bytes32 market, uint256 debt, uint256 collateral)
        public
        view
        returns (uint16)
    {
        if (adapter != address(0)) {
            (bool ok, bytes memory data) =
                adapter.staticcall(abi.encodeWithSignature("currentLeverageBps(address,bytes32)", owner, market));
            if (ok && data.length >= 32) return uint16(abi.decode(data, (uint256)));
        }
        if (collateral == 0) return debt == 0 ? 0 : type(uint16).max;
        uint256 leverage = debt * 10_000 / collateral;
        return leverage > type(uint16).max ? type(uint16).max : uint16(leverage);
    }

    function currentLiquidationDistanceBps(address adapter, address owner, bytes32 market, uint256 healthFactor)
        public
        view
        returns (uint16)
    {
        if (adapter != address(0)) {
            (bool ok, bytes memory data) = adapter.staticcall(
                abi.encodeWithSignature("currentLiquidationDistanceBps(address,bytes32)", owner, market)
            );
            if (ok && data.length >= 32) return uint16(abi.decode(data, (uint256)));
        }
        if (healthFactor == type(uint256).max) return type(uint16).max;
        if (healthFactor <= 1e18) return 0;
        uint256 distance = (healthFactor - 1e18) / 1e14;
        return distance > type(uint16).max ? type(uint16).max : uint16(distance);
    }

    function currentUtilizationBps(address adapter, bytes32 market) public view returns (uint16) {
        if (adapter == address(0)) return 0;
        (bool ok, bytes memory data) =
            adapter.staticcall(abi.encodeWithSignature("currentUtilizationBps(bytes32)", market));
        if (!ok || data.length < 32) return 0;
        return uint16(abi.decode(data, (uint256)));
    }
}
