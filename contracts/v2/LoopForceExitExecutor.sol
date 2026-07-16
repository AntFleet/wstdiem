// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopExecutorBase, ICurvePoolMinimal} from "./LoopExecutorBase.sol";
import {IEmergencyGuardian} from "./interfaces/IEmergencyGuardian.sol";
import {ILoopAuthorization} from "./interfaces/ILoopAuthorization.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {LoopV1EIP712} from "./libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Hashing} from "./libraries/LoopV1Hashing.sol";
import {LoopV1MorphoCalldata} from "./libraries/LoopV1MorphoCalldata.sol";
import {LoopV1ThrottleCounter} from "./libraries/LoopV1ThrottleCounter.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";

/// @notice Dedicated Phase 1 force-exit executor; not reachable through LoopExecutorV2.
contract LoopForceExitExecutor is LoopExecutorBase {
    using LoopV1ThrottleCounter for LoopV1ThrottleCounter.Counter;

    mapping(uint64 policyId => LoopV1ThrottleCounter.Counter counter) private throttleCounters;

    event ForceExitExecutorConfigured(address indexed authorization, address indexed forceAuthorizer, address registry);

    constructor(ILoopAuthorization authorization_, ILoopRegistry registry_, IEmergencyGuardian guardian_)
        LoopExecutorBase(authorization_, registry_, guardian_)
    {
        emit ForceExitExecutorConfigured(
            address(authorization_), registry_.loopForceExitAuthorizer(), address(registry_)
        );
    }

    function failedAttemptState(uint64 policyId) external view returns (uint64 windowStartBlock, uint8 failedAttempts) {
        LoopV1ThrottleCounter.Counter storage counter = throttleCounters[policyId];
        return (counter.windowStartBlock, counter.failedAttempts);
    }

    function executeForceExit(
        LoopV1EIP712.ForceExit calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result) {
        if (action.identity.executor != address(this)) {
            revert LoopV1Errors.ExecutorMismatch();
        }
        bytes32 digest = LoopV1Hashing.hashForceExit(action, _forceExitDomainSeparator());
        if (uint8(action.executionKind) == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS)) {
            // Phase 1 I-67/PROTOCOL.md §6.3 has no stored force-exit policy, so one-shot keeper force-exits
            // intentionally share policyId 0 for failed-attempt throttling.
            throttleCounters[0].check(loopRegistry);
        }

        try this.executeForceExitAttempt(action, sig, evidence, eip1271PreimageDisplayProof, msg.sender) returns (
            LoopV1Types.LoopActionResult memory attemptResult
        ) {
            result = attemptResult;
            if (uint8(action.executionKind) == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS)) {
                throttleCounters[0].clear();
            }
            emit LoopForceExitedV2(
                digest,
                action.identity.owner,
                action.identity.market,
                action.bounds.minRepayment,
                action.bounds.maxCollateralSold,
                action.bounds.acknowledgedRisks
            );
            emit LoopActionCompleted(digest, 0);
        } catch (bytes memory reason) {
            if (uint8(action.executionKind) == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS)) {
                throttleCounters[0].recordFailure(loopRegistry);
            }
            emit AutomationFailed(0, digest, msg.sender, _selector(reason));
            result = LoopV1Types.LoopActionResult(0, 0, 0, false);
        }
    }

    function executeForceExitAttempt(
        LoopV1EIP712.ForceExit calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof,
        address executionCaller
    ) external returns (LoopV1Types.LoopActionResult memory result) {
        if (msg.sender != address(this)) revert LoopV1Errors.CallerNotAllowed();
        uint8 primaryType = uint8(LoopV1Types.PrimaryType.FORCE_EXIT);
        bytes32 digest = LoopV1Hashing.hashForceExit(action, _forceExitDomainSeparator());
        _enterReentrancyGuard(primaryType);
        loopAuthorization.validateForceExit(digest, sig, action, evidence, executionCaller, eip1271PreimageDisplayProof);
        FlashContext memory context =
            _baseContext(digest, sig, primaryType, WSTDIEM_ARM_FORCE_EXIT_SLOT, action.identity);
        context.params = loopRegistry.marketParams(action.identity.market);
        context.flashProvider = _canonicalFlashPool(action.identity.market);
        context.registryVersion = action.identity.registryVersion;
        context.quoteHash = action.hashes.quoteHash;
        context.nonceSlot = action.identity.nonceSlot;
        context.nonceBit = action.identity.nonceBit;
        context.deadline = action.freshness.deadline;
        context.maxSlippageBps = action.bounds.looseSlippageBps;
        context.maxCurvePositionShareBps = action.bounds.maxCurvePositionShareBps;
        context.flashFeeCap = action.bounds.looseFlashFeeCap;
        context.preState = _snapshotPosition(context);
        context.repayAssets = context.preState.debt;
        context.withdrawCollateralAssets = action.bounds.maxCollateralSold;
        context.flashAmount = context.repayAssets;
        context.useCurve = true;
        context.curveWstToDiem = true;
        context.dustInputAmount = context.withdrawCollateralAssets + context.flashAmount;
        context.contextHash = _contextHash(context);
        _arm(context.armSlot, context.contextHash);
        _startFlash(context);
        result = callbackResult;
        delete callbackResult;
        result.succeeded = true;
        _finish(digest, action.identity.owner, action.identity.market, context.params, context.dustInputAmount);
    }

    function _executeForceExitInCallback(FlashContext memory context, uint256 fee)
        internal
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        _safeTransfer(context.params.loanToken, address(loopAuthorization), context.repayAssets);
        loopAuthorization.executeMorpho(
            context.digest, context.sig, LoopV1MorphoCalldata.repay(context.params, context.repayAssets, context.owner)
        );
        loopAuthorization.executeMorpho(
            context.digest,
            context.sig,
            LoopV1MorphoCalldata.withdrawCollateral(
                context.params, context.withdrawCollateralAssets, context.owner, address(this)
            )
        );
        address curve = loopRegistry.curvePool(context.market);
        _approveExact(context.params.collateralToken, curve, context.withdrawCollateralAssets, context.primaryType);
        uint256 minDy = context.flashAmount + fee;
        uint256 diemReceived = ICurvePoolMinimal(curve).exchange(1, 0, context.withdrawCollateralAssets, minDy);
        if (diemReceived < minDy) revert LoopV1Errors.CurveSlippageExceeded();
        _enforceCurveBounds(context, diemReceived);
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }

    function _executeOpenInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        revert LoopV1Errors.DigestTypeMismatch();
    }

    function _executeRebalanceInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        revert LoopV1Errors.DigestTypeMismatch();
    }

    function _executeExitInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        revert LoopV1Errors.DigestTypeMismatch();
    }

    function _executeAutomationInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        revert LoopV1Errors.DigestTypeMismatch();
    }

    function _finish(
        bytes32 digest,
        address owner,
        bytes32 market,
        LoopV1Types.MorphoMarketParams memory params,
        uint256 dustInputAmount
    ) private {
        address curve = loopRegistry.curvePool(market);
        _zeroAllowance(params.loanToken, address(loopAuthorization));
        _zeroAllowance(params.collateralToken, address(loopAuthorization));
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

    function _forceExitDomainSeparator() private view returns (bytes32 separator) {
        address authorizer = loopRegistry.loopForceExitAuthorizer();
        (bool ok, bytes memory data) = authorizer.staticcall(abi.encodeWithSignature("domainSeparator()"));
        if (!ok || data.length != 32) revert LoopV1Errors.ConfigIntegrityFailure();
        separator = abi.decode(data, (bytes32));
    }

    function _selector(bytes memory reason) private pure returns (bytes4 selector) {
        if (reason.length < 4) return bytes4(0);
        assembly {
            selector := mload(add(reason, 0x20))
        }
    }
}
