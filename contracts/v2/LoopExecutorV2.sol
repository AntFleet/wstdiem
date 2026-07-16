// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopExecutorBase, IERC20Minimal, IERC4626Minimal, ICurvePoolMinimal} from "./LoopExecutorBase.sol";
import {IEmergencyGuardian} from "./interfaces/IEmergencyGuardian.sol";
import {ILoopAuthorization} from "./interfaces/ILoopAuthorization.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {LoopV1EIP712} from "./libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Hashing} from "./libraries/LoopV1Hashing.sol";
import {LoopV1MorphoCalldata} from "./libraries/LoopV1MorphoCalldata.sol";
import {LoopV1ThrottleCounter} from "./libraries/LoopV1ThrottleCounter.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";

/// @notice Phase 1 executor for Open, Rebalance, Exit, AutomationExec, and Revoke.
contract LoopExecutorV2 is LoopExecutorBase {
    using LoopV1ThrottleCounter for LoopV1ThrottleCounter.Counter;

    uint8 internal constant MODE_LEVERAGE_INCREASE = 1;
    uint8 internal constant MODE_PARTIAL_DELEVERAGE = 2;
    uint8 internal constant MODE_HEALTH_FACTOR_RECOVERY = 3;
    uint8 internal constant POLICY_REPAY_ONLY = 3;
    uint8 internal constant POLICY_DELEVERAGE_ONLY = 4;

    mapping(uint64 policyId => LoopV1ThrottleCounter.Counter counter) private throttleCounters;

    constructor(ILoopAuthorization authorization_, ILoopRegistry registry_, IEmergencyGuardian guardian_)
        LoopExecutorBase(authorization_, registry_, guardian_)
    {}

    function failedAttemptState(uint64 policyId) external view returns (uint64 windowStartBlock, uint8 failedAttempts) {
        LoopV1ThrottleCounter.Counter storage counter = throttleCounters[policyId];
        return (counter.windowStartBlock, counter.failedAttempts);
    }

    function executeOpen(
        LoopV1EIP712.Open calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result) {
        uint8 primaryType = uint8(LoopV1Types.PrimaryType.OPEN);
        _enterReentrancyGuard(primaryType);
        _requireNotPaused(primaryType);
        bytes32 digest = LoopV1Hashing.hashOpen(action, loopAuthorization.domainSeparator());
        loopAuthorization.validateOpen(digest, sig, action, evidence, eip1271PreimageDisplayProof);

        FlashContext memory context = _baseContext(digest, sig, primaryType, WSTDIEM_ARM_OPEN_SLOT, action.identity);
        context.params = loopRegistry.marketParams(action.identity.market);
        context.flashProvider = _canonicalFlashPool(action.identity.market);
        context.registryVersion = action.identity.registryVersion;
        context.quoteHash = action.hashes.quoteHash;
        context.nonceSlot = action.identity.nonceSlot;
        context.nonceBit = action.identity.nonceBit;
        context.deadline = action.freshness.deadline;
        context.borrowAssets = action.bounds.maxBorrowedDiem;
        context.flashAmount = _flashPrincipalForBudget(action.identity.market, context.borrowAssets);
        context.useVaultDeposit = true;
        context.supplyCollateralAssets = action.bounds.minWstDiemReceived;
        context.minWstDiemReceived = action.bounds.minWstDiemReceived;
        context.minBorrowedDiem = action.bounds.minBorrowedDiem;
        context.maxBorrowedDiem = action.bounds.maxBorrowedDiem;
        context.maxLeverageBps = action.bounds.maxLeverageBps;
        context.minPostHealthFactor = action.bounds.minHealthFactor;
        context.minLiquidationDistanceBps = action.bounds.minLiquidationDistanceBps;
        context.maxMorphoUtilizationImpactBps = action.bounds.maxMorphoUtilizationImpactBps;
        context.flashFeeCap = action.bounds.feeCaps.flashFeeCap;
        context.protocolFeeCap = action.bounds.feeCaps.protocolFeeCap;
        context.automationFeeCap = action.bounds.feeCaps.automationFeeCap;
        context.dustInputAmount = context.flashAmount;
        context.preState = _snapshotPosition(context);
        context.contextHash = _contextHash(context);
        _arm(context.armSlot, context.contextHash);
        _startFlash(context);
        result = callbackResult;
        delete callbackResult;
        _finish(digest, action.identity.owner, action.identity.market, context.params, context.dustInputAmount);
        emit LoopOpenedV2(
            digest, action.identity.owner, action.identity.market, result.collateralWstDiem, result.borrowedDiem, 0
        );
        emit LoopActionCompleted(digest, 0);
    }

    function executeRebalance(
        LoopV1EIP712.Rebalance calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result) {
        uint256 mdi = action.bounds.maxDebtIncrease;
        uint256 mcs = action.bounds.maxCollateralSold;
        if (mdi > 0 && mcs > 0) revert LoopV1Errors.RebalanceModeAmbiguous();
        uint8 mode =
            mdi > 0 ? MODE_LEVERAGE_INCREASE : (mcs > 0 ? MODE_PARTIAL_DELEVERAGE : MODE_HEALTH_FACTOR_RECOVERY);

        uint8 primaryType = uint8(LoopV1Types.PrimaryType.REBALANCE);
        _enterReentrancyGuard(primaryType);
        if (mode == MODE_LEVERAGE_INCREASE) _requireNotPaused(primaryType);
        bytes32 digest = LoopV1Hashing.hashRebalance(action, loopAuthorization.domainSeparator());
        loopAuthorization.validateRebalance(digest, sig, action, evidence, eip1271PreimageDisplayProof);

        FlashContext memory context =
            _baseContext(digest, sig, primaryType, WSTDIEM_ARM_REBALANCE_SLOT, action.identity);
        context.params = loopRegistry.marketParams(action.identity.market);
        context.flashProvider = _canonicalFlashPool(action.identity.market);
        context.registryVersion = action.identity.registryVersion;
        context.quoteHash = action.hashes.quoteHash;
        context.nonceSlot = action.identity.nonceSlot;
        context.nonceBit = action.identity.nonceBit;
        context.deadline = action.freshness.deadline;
        context.mode = mode;
        context.targetLeverageBps = action.bounds.targetLeverageBps;
        context.targetLeverageToleranceBps = action.bounds.targetLeverageToleranceBps;
        context.minPostHealthFactor = action.bounds.minPostHealthFactor;
        context.minLiquidationDistanceBps = action.bounds.minLiquidationDistanceBps;
        context.maxSlippageBps = action.bounds.maxSlippageBps;
        context.maxCurvePositionShareBps = action.bounds.maxCurvePositionShareBps;
        context.maxMorphoUtilizationImpactBps = action.bounds.maxMorphoUtilizationImpactBps;
        context.flashFeeCap = action.bounds.feeCaps.flashFeeCap;
        context.protocolFeeCap = action.bounds.feeCaps.protocolFeeCap;
        context.automationFeeCap = action.bounds.feeCaps.automationFeeCap;
        context.preState = _snapshotPosition(context);
        if (mode == MODE_LEVERAGE_INCREASE) {
            context.borrowAssets = mdi;
            context.flashAmount = _flashPrincipalForBudget(action.identity.market, mdi);
            context.useVaultDeposit = true;
            context.minWstDiemReceived = context.flashAmount;
        } else if (mode == MODE_PARTIAL_DELEVERAGE) {
            context.repayAssets = _min(context.preState.debt, mcs);
            context.withdrawCollateralAssets = mcs;
            context.flashAmount = context.repayAssets;
            context.useCurve = true;
            context.curveWstToDiem = true;
        } else {
            context.repayAssets = context.preState.debt;
            context.flashAmount = context.repayAssets;
        }
        context.dustInputAmount = context.withdrawCollateralAssets + context.flashAmount;
        context.contextHash = _contextHash(context);
        _arm(context.armSlot, context.contextHash);
        _startFlash(context);
        result = callbackResult;
        delete callbackResult;
        _finish(digest, action.identity.owner, action.identity.market, context.params, context.dustInputAmount);
        emit LoopRebalancedV2(digest, action.identity.owner, action.identity.market, int256(mdi), -int256(mcs), 0);
        emit LoopActionCompleted(digest, 0);
    }

    function executeExit(
        LoopV1EIP712.Exit calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result) {
        uint8 primaryType = uint8(LoopV1Types.PrimaryType.EXIT);
        _enterReentrancyGuard(primaryType);
        bytes32 digest = LoopV1Hashing.hashExit(action, loopAuthorization.domainSeparator());
        loopAuthorization.validateExit(digest, sig, action, evidence, eip1271PreimageDisplayProof);

        FlashContext memory context = _baseContext(digest, sig, primaryType, WSTDIEM_ARM_EXIT_SLOT, action.identity);
        context.params = loopRegistry.marketParams(action.identity.market);
        context.flashProvider = _canonicalFlashPool(action.identity.market);
        context.registryVersion = action.identity.registryVersion;
        context.quoteHash = action.hashes.quoteHash;
        context.nonceSlot = action.identity.nonceSlot;
        context.nonceBit = action.identity.nonceBit;
        context.deadline = action.freshness.deadline;
        context.maxSlippageBps = action.bounds.maxSlippageBps;
        context.maxCurvePositionShareBps = action.bounds.maxCurvePositionShareBps;
        context.maxMorphoUtilizationImpactBps = action.bounds.maxMorphoUtilizationImpactBps;
        context.flashFeeCap = action.bounds.feeCaps.flashFeeCap;
        context.protocolFeeCap = action.bounds.feeCaps.protocolFeeCap;
        context.automationFeeCap = action.bounds.feeCaps.automationFeeCap;
        context.preState = _snapshotPosition(context);
        context.repayAssets = context.preState.debt;
        context.flashAmount = context.repayAssets;
        if (!action.bounds.repayOnly) {
            context.withdrawCollateralAssets = action.bounds.maxCollateralSold;
            context.useCurve = true;
            context.curveWstToDiem = true;
        }
        context.dustInputAmount = context.withdrawCollateralAssets + context.flashAmount;
        context.contextHash = _contextHash(context);
        _arm(context.armSlot, context.contextHash);
        _startFlash(context);
        result = callbackResult;
        delete callbackResult;
        _finish(digest, action.identity.owner, action.identity.market, context.params, context.dustInputAmount);
        emit LoopExitedV2(
            digest,
            action.identity.owner,
            action.identity.market,
            context.repayAssets,
            context.withdrawCollateralAssets,
            0
        );
        emit LoopActionCompleted(digest, 0);
    }

    function executeAutomationExec(
        LoopV1EIP712.AutomationExec calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result) {
        if (!loopRegistry.permissionlessCallerAllowed(msg.sender)) {
            revert LoopV1Errors.CallerNotAllowed();
        }
        uint64 policyId = action.identity.policyId;
        throttleCounters[policyId].check(loopRegistry);
        bytes32 digest = LoopV1Hashing.hashAutomationExec(action, loopAuthorization.domainSeparator());

        try this.executeAutomationExecAttempt(action, sig, evidence, eip1271PreimageDisplayProof) returns (
            LoopV1Types.LoopActionResult memory attemptResult
        ) {
            result = attemptResult;
            throttleCounters[policyId].clear();
            emit AutomationExecuted(policyId, digest, msg.sender);
            emit LoopActionCompleted(digest, 0);
        } catch (bytes memory reason) {
            throttleCounters[policyId].recordFailure(loopRegistry);
            emit AutomationFailed(policyId, digest, msg.sender, _selector(reason));
            result = LoopV1Types.LoopActionResult(0, 0, 0, false);
        }
    }

    function executeAutomationExecAttempt(
        LoopV1EIP712.AutomationExec calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result) {
        if (msg.sender != address(this)) revert LoopV1Errors.CallerNotAllowed();
        uint8 policyClass = action.bounds.underlyingPrimaryType;
        uint8 primaryType = uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC);
        _enterReentrancyGuard(primaryType);
        bytes32 digest = LoopV1Hashing.hashAutomationExec(action, loopAuthorization.domainSeparator());
        loopAuthorization.validateAutomationExec(digest, sig, action, evidence, eip1271PreimageDisplayProof);
        FlashContext memory context = _baseContext(digest, sig, primaryType, WSTDIEM_ARM_EXIT_SLOT, action.identity);
        context.params = loopRegistry.marketParams(action.identity.market);
        context.flashProvider = _canonicalFlashPool(action.identity.market);
        context.registryVersion = action.identity.registryVersion;
        context.quoteHash = action.hashes.quoteHash;
        context.nonceSlot = action.identity.nonceSlot;
        context.nonceBit = action.identity.nonceBit;
        context.deadline = action.freshness.deadline;
        context.preState = _snapshotPosition(context);
        context.repayAssets = context.preState.debt;
        context.flashAmount = context.repayAssets;
        if (policyClass == POLICY_REPAY_ONLY) {
            context.withdrawCollateralAssets = 0;
        } else if (policyClass == POLICY_DELEVERAGE_ONLY) {
            context.withdrawCollateralAssets = context.preState.collateral;
            context.useCurve = true;
            context.curveWstToDiem = true;
        } else {
            revert LoopV1Errors.Phase1AutomationScopeViolation();
        }
        context.dustInputAmount = context.withdrawCollateralAssets + context.flashAmount;
        context.contextHash = _contextHash(context);
        _arm(context.armSlot, context.contextHash);
        _startFlash(context);
        result = callbackResult;
        delete callbackResult;
        result.succeeded = true;
        _finish(digest, action.identity.owner, action.identity.market, context.params, context.dustInputAmount);
    }

    function _executeOpenInCallback(FlashContext memory context, uint256)
        internal
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        uint256 collateralAssets = context.supplyCollateralAssets;
        if (context.useVaultDeposit && context.flashAmount != 0) {
            address vault = loopRegistry.wstDiemVault(context.market);
            _approveExact(context.params.loanToken, vault, context.flashAmount, context.primaryType);
            collateralAssets = IERC4626Minimal(vault).deposit(context.flashAmount, address(this));
        }
        if (collateralAssets != 0) {
            _safeTransfer(context.params.collateralToken, address(loopAuthorization), collateralAssets);
            loopAuthorization.executeMorpho(
                context.digest,
                context.sig,
                LoopV1MorphoCalldata.supplyCollateral(context.params, collateralAssets, context.owner)
            );
        }
        bytes memory data = loopAuthorization.executeMorpho(
            context.digest,
            context.sig,
            LoopV1MorphoCalldata.borrow(context.params, context.borrowAssets, context.owner, address(this))
        );
        uint256 borrowed = _firstReturnWord(data, context.borrowAssets);
        return LoopV1Types.LoopActionResult(collateralAssets, borrowed, 0, true);
    }

    function _executeRebalanceInCallback(FlashContext memory context, uint256 fee)
        internal
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        if (context.mode == MODE_LEVERAGE_INCREASE) {
            return _executeOpenInCallback(context, 0);
        }
        _safeTransfer(context.params.loanToken, address(loopAuthorization), context.repayAssets);
        loopAuthorization.executeMorpho(
            context.digest, context.sig, LoopV1MorphoCalldata.repay(context.params, context.repayAssets, context.owner)
        );
        if (context.withdrawCollateralAssets != 0) {
            loopAuthorization.executeMorpho(
                context.digest,
                context.sig,
                LoopV1MorphoCalldata.withdrawCollateral(
                    context.params, context.withdrawCollateralAssets, context.owner, address(this)
                )
            );
            _curveSwapWstToDiem(context, fee);
        }
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }

    function _executeExitInCallback(FlashContext memory context, uint256 fee)
        internal
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        _safeTransfer(context.params.loanToken, address(loopAuthorization), context.repayAssets);
        loopAuthorization.executeMorpho(
            context.digest, context.sig, LoopV1MorphoCalldata.repay(context.params, context.repayAssets, context.owner)
        );
        if (context.withdrawCollateralAssets != 0) {
            loopAuthorization.executeMorpho(
                context.digest,
                context.sig,
                LoopV1MorphoCalldata.withdrawCollateral(
                    context.params, context.withdrawCollateralAssets, context.owner, address(this)
                )
            );
            _curveSwapWstToDiem(context, fee);
        }
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }

    function _executeAutomationInCallback(FlashContext memory context, uint256 fee)
        internal
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        return _executeExitInCallback(context, fee);
    }

    function _executeForceExitInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        revert LoopV1Errors.DigestTypeMismatch();
    }

    function _curveSwapWstToDiem(FlashContext memory context, uint256 flashFee) private {
        address curve = loopRegistry.curvePool(context.market);
        _approveExact(context.params.collateralToken, curve, context.withdrawCollateralAssets, context.primaryType);
        uint256 minDy = context.flashAmount + flashFee + context.protocolFeeCap + context.automationFeeCap;
        uint256 diemReceived = ICurvePoolMinimal(curve).exchange(1, 0, context.withdrawCollateralAssets, minDy);
        if (diemReceived < minDy) revert LoopV1Errors.CurveSlippageExceeded();
        _enforceCurveBounds(context, diemReceived);
    }

    function _finish(
        bytes32 digest,
        address owner,
        bytes32 market,
        LoopV1Types.MorphoMarketParams memory params,
        uint256 dustInputAmount
    ) private {
        address curve = loopRegistry.curvePool(market);
        address vault = loopRegistry.wstDiemVault(market);
        _zeroAllowance(params.loanToken, address(loopAuthorization));
        _zeroAllowance(params.collateralToken, address(loopAuthorization));
        _zeroAllowance(params.loanToken, vault);
        _zeroAllowance(params.collateralToken, curve);
        _sweepDust(digest, market, dustInputAmount, params.loanToken, owner);
        _sweepDust(digest, market, dustInputAmount, params.collateralToken, owner);
        _assertZeroResidual(params.loanToken);
        _assertZeroResidual(params.collateralToken);
        _exitReentrancyGuard();
    }

    function _baseContext(
        bytes32 digest,
        bytes calldata sig,
        uint8 primaryType,
        bytes32 armSlot,
        LoopV1EIP712.ActionIdentity calldata identity
    ) private view returns (FlashContext memory context) {
        context.digest = digest;
        context.sig = sig;
        context.primaryType = primaryType;
        context.armSlot = armSlot;
        context.owner = identity.owner;
        context.market = identity.market;
    }

    function _flashPrincipalForBudget(bytes32 market, uint256 budget) private view returns (uint256) {
        uint24 feeTier = loopRegistry.uniswapV3FlashFeeTier(market);
        if (budget == 0) return 0;
        return (budget * 1_000_000) / (1_000_000 + feeTier);
    }

    function _firstReturnWord(bytes memory data, uint256 fallbackValue) private pure returns (uint256 value) {
        if (data.length < 32) return fallbackValue;
        assembly {
            value := mload(add(data, 0x20))
        }
    }

    function _selector(bytes memory reason) private pure returns (bytes4 selector) {
        if (reason.length < 4) return bytes4(0);
        assembly {
            selector := mload(add(reason, 0x20))
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
