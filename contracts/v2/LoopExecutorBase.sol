// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopAuthorization} from "./interfaces/ILoopAuthorization.sol";
import {IEmergencyGuardian} from "./interfaces/IEmergencyGuardian.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {ILoopV1Events} from "./interfaces/ILoopV1Events.sol";
import {LoopV1EIP712} from "./libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1PositionMath} from "./libraries/LoopV1PositionMath.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IERC4626Minimal {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

interface ICurvePoolMinimal {
    function exchange(int128 i, int128 j, uint256 dx, uint256 minDy) external returns (uint256);
    function balances(int128 i) external view returns (uint256);
}

interface IUniswapV3PoolMinimal {
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

interface IUniswapV3FactoryMinimal {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

/// @notice Shared Phase 1 executor plumbing for flash callbacks, arming, approvals, and cleanup.
abstract contract LoopExecutorBase is ILoopV1Events {
    uint256 internal constant BASE_CHAIN_ID = 8453;

    bytes32 internal constant WSTDIEM_REENTRANCY_SLOT = keccak256("wstdiem.loop.executor.base.reentrancy.v1");
    bytes32 internal constant WSTDIEM_ARM_OPEN_SLOT = keccak256("wstdiem.loop.executor.v2.arm.Open.v1");
    bytes32 internal constant WSTDIEM_ARM_REBALANCE_SLOT = keccak256("wstdiem.loop.executor.v2.arm.Rebalance.v1");
    bytes32 internal constant WSTDIEM_ARM_EXIT_SLOT = keccak256("wstdiem.loop.executor.v2.arm.Exit.v1");
    bytes32 internal constant WSTDIEM_ARM_FORCE_EXIT_SLOT =
        keccak256("wstdiem.loop.force-exit-executor.arm.ForceExit.v1");

    ILoopAuthorization public immutable loopAuthorization;
    ILoopRegistry public immutable loopRegistry;
    IEmergencyGuardian internal immutable emergencyGuardian;

    LoopV1Types.LoopActionResult internal callbackResult;

    struct FlashContext {
        bytes32 digest;
        bytes sig;
        uint8 primaryType;
        bytes32 armSlot;
        bytes32 contextHash;
        uint256 registryVersion;
        address flashProvider;
        bytes32 routeId;
        bytes32 quoteHash;
        uint248 nonceSlot;
        uint8 nonceBit;
        uint256 deadline;
        address owner;
        bytes32 market;
        LoopV1Types.MorphoMarketParams params;
        uint256 flashAmount;
        uint256 supplyCollateralAssets;
        uint256 borrowAssets;
        uint256 repayAssets;
        uint256 withdrawCollateralAssets;
        uint8 mode;
        bool useVaultDeposit;
        bool useCurve;
        bool curveWstToDiem;
        uint256 flashFeeCap;
        uint256 protocolFeeCap;
        uint256 automationFeeCap;
        uint16 maxSlippageBps;
        uint16 maxCurvePositionShareBps;
        uint16 maxMorphoUtilizationImpactBps;
        uint16 targetLeverageBps;
        uint16 targetLeverageToleranceBps;
        uint16 maxLeverageBps;
        uint256 minPostHealthFactor;
        uint16 minLiquidationDistanceBps;
        uint256 minWstDiemReceived;
        uint256 minBorrowedDiem;
        uint256 maxBorrowedDiem;
        uint256 dustInputAmount;
        PositionSnapshot preState;
    }

    struct PositionSnapshot {
        uint256 debt;
        uint256 collateral;
        uint256 healthFactor;
        uint16 leverageBps;
        uint16 liquidationDistanceBps;
        uint16 utilizationBps;
    }

    constructor(ILoopAuthorization authorization_, ILoopRegistry registry_, IEmergencyGuardian guardian_) {
        loopAuthorization = authorization_;
        loopRegistry = registry_;
        emergencyGuardian = guardian_;
        _validateDeploymentConfig();
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        FlashContext memory context = abi.decode(data, (FlashContext));
        if (msg.sender != _canonicalFlashPool(context.market)) revert LoopV1Errors.InvalidCallbackSender();
        if (uint8(uint256(_tload(WSTDIEM_REENTRANCY_SLOT))) != context.primaryType) {
            revert LoopV1Errors.ReentrantCallback();
        }
        _assertArmedAndConsume(context.armSlot, context.contextHash);

        uint256 fee = _loanTokenIsToken0(context.params.loanToken, context.params.collateralToken) ? fee0 : fee1;
        uint256 otherFee = _loanTokenIsToken0(context.params.loanToken, context.params.collateralToken) ? fee1 : fee0;
        if (otherFee != 0 || fee != _flashFee(context.flashAmount, loopRegistry.uniswapV3FlashFeeTier(context.market)))
        {
            revert LoopV1Errors.FlashLiquidityUnavailable();
        }

        if (context.flashFeeCap != 0 && fee > context.flashFeeCap) revert LoopV1Errors.FlashLiquidityUnavailable();

        if (context.primaryType == uint8(LoopV1Types.PrimaryType.OPEN)) {
            callbackResult = _executeOpenInCallback(context, fee);
        } else if (context.primaryType == uint8(LoopV1Types.PrimaryType.REBALANCE)) {
            callbackResult = _executeRebalanceInCallback(context, fee);
        } else if (context.primaryType == uint8(LoopV1Types.PrimaryType.EXIT)) {
            callbackResult = _executeExitInCallback(context, fee);
        } else if (context.primaryType == uint8(LoopV1Types.PrimaryType.FORCE_EXIT)) {
            callbackResult = _executeForceExitInCallback(context, fee);
        } else if (context.primaryType == uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)) {
            callbackResult = _executeAutomationInCallback(context, fee);
        } else {
            revert LoopV1Errors.DigestTypeMismatch();
        }

        _enforcePostState(context, callbackResult);

        uint256 repayment = context.flashAmount + fee;
        if (repayment != 0) _safeTransfer(context.params.loanToken, msg.sender, repayment);
    }

    function canonicalFlashPool(bytes32 market) external view returns (address pool) {
        return _canonicalFlashPool(market);
    }

    function expectedFlashFee(bytes32 market, uint256 amount) external view returns (uint256 fee) {
        return _flashFee(amount, loopRegistry.uniswapV3FlashFeeTier(market));
    }

    function _executeOpenInCallback(FlashContext memory context, uint256 fee)
        internal
        virtual
        returns (LoopV1Types.LoopActionResult memory);

    function _executeRebalanceInCallback(FlashContext memory context, uint256 fee)
        internal
        virtual
        returns (LoopV1Types.LoopActionResult memory);

    function _executeExitInCallback(FlashContext memory context, uint256 fee)
        internal
        virtual
        returns (LoopV1Types.LoopActionResult memory);

    function _executeAutomationInCallback(FlashContext memory context, uint256 fee)
        internal
        virtual
        returns (LoopV1Types.LoopActionResult memory);

    function _executeForceExitInCallback(FlashContext memory context, uint256 fee)
        internal
        virtual
        returns (LoopV1Types.LoopActionResult memory);

    function _startFlash(FlashContext memory context) internal {
        address pool = _canonicalFlashPool(context.market);
        (uint256 amount0, uint256 amount1) = _loanTokenIsToken0(
            context.params.loanToken, context.params.collateralToken
        )
            ? (context.flashAmount, uint256(0))
            : (uint256(0), context.flashAmount);
        IUniswapV3PoolMinimal(pool).flash(address(this), amount0, amount1, abi.encode(context));
    }

    function _contextHash(FlashContext memory context) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.ARMING_CONTEXT_TYPEHASH,
                block.chainid,
                address(this),
                this.uniswapV3FlashCallback.selector,
                context.primaryType,
                context.owner,
                context.market,
                context.registryVersion,
                context.flashProvider,
                context.routeId,
                context.quoteHash,
                context.nonceSlot,
                context.nonceBit,
                context.deadline
            )
        );
    }

    function _arm(bytes32 slot, bytes32 contextHash) internal {
        if (_tload(slot) != bytes32(0)) revert LoopV1Errors.ActionContextAlreadyArmed();
        _tstore(slot, contextHash);
    }

    function _disarm(bytes32 slot) internal {
        _tstore(slot, bytes32(0));
    }

    function _assertArmedAndConsume(bytes32 slot, bytes32 expectedHash) internal {
        if (_tload(slot) != expectedHash) revert LoopV1Errors.InvalidCallbackContext();
        _tstore(slot, bytes32(0));
    }

    function _enterReentrancyGuard(uint8 primaryType) internal {
        if (_tload(WSTDIEM_REENTRANCY_SLOT) != bytes32(0)) revert LoopV1Errors.ReentrantCallback();
        _tstore(WSTDIEM_REENTRANCY_SLOT, bytes32(uint256(primaryType)));
    }

    function _requireNotPaused(uint8 primaryType) internal view {
        if (address(emergencyGuardian) != address(0)) emergencyGuardian.requireNotPaused(primaryType);
    }

    function _exitReentrancyGuard() internal {
        _tstore(WSTDIEM_REENTRANCY_SLOT, bytes32(0));
    }

    /// @notice Exact allowance with registry spender allowlist enforcement (D-3 always-on).
    /// @dev Callers MUST pass the live action `primaryType`. The legacy 3-arg overload that
    ///      skipped the check via `type(uint8).max` was removed — no production path may bypass.
    function _approveExact(address token, address spender, uint256 amount, uint8 primaryType) internal {
        _requireAllowedSpender(primaryType, token, spender);
        _safeApprove(token, spender, 0);
        _safeApprove(token, spender, amount);
    }

    function _requireAllowedSpender(uint8 primaryType, address token, address spender) internal view {
        if (spender == address(0)) revert LoopV1Errors.SpenderNotRegistered();
        ILoopRegistry.SpenderCheck memory check = loopRegistry.allowedSpender(primaryType, token, spender);
        // D-3: enforced flag OR post-bootstrap always requires a registered row.
        // Pre-bootstrap unit harnesses may leave the flag false and omit rows.
        if (check.spender == address(0)) {
            if (loopRegistry.spendAllowlistEnforced() || loopRegistry.bootstrapClosed()) {
                revert LoopV1Errors.SpenderNotRegistered();
            }
            return;
        }
        if (check.spender != spender) revert LoopV1Errors.SpenderNotRegistered();
        if (check.runtimeCodeHash != bytes32(0)) {
            bytes32 codehash;
            assembly {
                codehash := extcodehash(spender)
            }
            if (codehash != check.runtimeCodeHash) revert LoopV1Errors.BytecodeMismatch();
        }
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20Minimal.approve, (spender, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert LoopV1Errors.Erc20ApproveFailed();
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert LoopV1Errors.Erc20TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20Minimal.transferFrom, (from, to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert LoopV1Errors.Erc20TransferFromFailed();
        }
    }

    function _zeroAllowance(address token, address spender) internal {
        if (token != address(0) && spender != address(0) && IERC20Minimal(token).allowance(address(this), spender) != 0)
        {
            _safeApprove(token, spender, 0);
        }
    }

    function _sweepDust(bytes32 digest, bytes32 market, uint256 inputAmount, address token, address to) internal {
        uint256 balance = IERC20Minimal(token).balanceOf(address(this));
        if (balance == 0) return;
        uint256 bound = loopRegistry.dustBoundFor(market, inputAmount);
        if (balance > bound) {
            emit LargeDustRefund(digest, to, token, balance, bound);
            revert LoopV1Errors.DustBoundExceeded();
        }
        _safeTransfer(token, to, balance);
    }

    function _assertZeroResidual(address token) internal view {
        if (IERC20Minimal(token).balanceOf(address(this)) != 0) revert LoopV1Errors.DustBoundExceeded();
    }

    function _canonicalFlashPool(bytes32 market) internal view returns (address pool) {
        pool = loopRegistry.uniswapV3FlashPool(market);
        address factory = loopRegistry.uniswapV3Factory(market);
        uint24 feeTier = loopRegistry.uniswapV3FlashFeeTier(market);
        LoopV1Types.MorphoMarketParams memory params = loopRegistry.marketParams(market);
        if (factory != address(0)) {
            address canonical =
                IUniswapV3FactoryMinimal(factory).getPool(params.loanToken, params.collateralToken, feeTier);
            if (canonical != pool) revert LoopV1Errors.ConfigIntegrityFailure();
        }
        if (pool == address(0)) revert LoopV1Errors.FlashLiquidityUnavailable();
    }

    function _validateDeploymentConfig() internal view {
        if (address(loopAuthorization) == address(0) || address(loopRegistry) == address(0)) {
            revert LoopV1Errors.ConfigIntegrityFailure();
        }
    }

    function _flashFee(uint256 amount, uint24 feeTier) internal pure returns (uint256) {
        if (amount == 0) return 0;
        return ((amount * uint256(feeTier)) - 1) / 1_000_000 + 1;
    }

    function _snapshotPosition(FlashContext memory context) internal view returns (PositionSnapshot memory snapshot) {
        return LoopV1PositionMath.snapshotPosition(
            loopRegistry.morpho(), loopRegistry.loopRiskOracleAdapter(), context.market, context.owner, context.params
        );
    }

    function _enforcePostState(FlashContext memory context, LoopV1Types.LoopActionResult memory result) internal view {
        LoopV1PositionMath.enforcePostState(context, result, _snapshotPosition(context));
    }

    function _enforceCurveBounds(FlashContext memory context, uint256 diemReceived) internal view {
        LoopV1PositionMath.enforceCurveBounds(
            context.maxSlippageBps,
            context.maxCurvePositionShareBps,
            context.withdrawCollateralAssets,
            diemReceived,
            loopRegistry.curvePool(context.market)
        );
    }

    function _loanTokenIsToken0(address loanToken, address pairToken) internal pure returns (bool) {
        return loanToken < pairToken;
    }

    function _tload(bytes32 slot) internal view returns (bytes32 value) {
        assembly {
            value := tload(slot)
        }
    }

    function _tstore(bytes32 slot, bytes32 value) internal {
        assembly {
            tstore(slot, value)
        }
    }
}
