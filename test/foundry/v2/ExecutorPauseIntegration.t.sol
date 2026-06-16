// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {EmergencyGuardian} from "../../../contracts/v2/EmergencyGuardian.sol";
import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorV2} from "../../../contracts/v2/LoopExecutorV2.sol";
import {LoopForceExitExecutor} from "../../../contracts/v2/LoopForceExitExecutor.sol";
import {IEmergencyGuardian} from "../../../contracts/v2/interfaces/IEmergencyGuardian.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {RegistryBatchHelpers} from "./helpers/RegistryBatchHelpers.sol";

contract ExecutorPauseIntegrationTest is RegistryBatchHelpers, Test {
    address private constant GOVERNANCE = address(0xA11CE);
    address private constant GUARDIAN = address(0xB0B);

    LoopRegistry private registry;
    LoopAuthorization private auth;
    EmergencyGuardian private guardian;
    LoopExecutorV2 private executor;
    LoopForceExitExecutor private forceExecutor;

    function setUp() public {
        registry = new LoopRegistry(address(this));
        auth = new LoopAuthorization(registry);
        guardian = new EmergencyGuardian(GOVERNANCE, GUARDIAN);
        executor = new LoopExecutorV2(auth, registry, guardian);
        forceExecutor = new LoopForceExitExecutor(auth, registry, guardian);

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](3);
        ops[0] = _opLoopAuthorization(address(auth));
        ops[1] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(executor));
        ops[2] = _opExecutor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT), address(forceExecutor));
        _commit(registry, ops, bytes32(uint256(1)));
    }

    function testExecuteOpenRevertsPausedActionWhenOpenPaused() public {
        _pause(uint8(LoopV1Types.PrimaryType.OPEN));
        LoopV1EIP712.Open memory action;
        vm.expectRevert(LoopV1Errors.PausedAction.selector);
        executor.executeOpen(action, "", _emptyEvidence(), bytes32(0));
    }

    function testExecuteRebalanceDebtIncreaseRevertsWhenRebalancePaused() public {
        _pause(uint8(LoopV1Types.PrimaryType.REBALANCE));
        LoopV1EIP712.Rebalance memory action;
        action.bounds.maxDebtIncrease = 1;
        vm.expectRevert(LoopV1Errors.PausedAction.selector);
        executor.executeRebalance(action, "", _emptyEvidence(), bytes32(0));
    }

    function testExecuteRebalanceDeleverageBypassesPauseHook() public {
        _pause(uint8(LoopV1Types.PrimaryType.REBALANCE));
        LoopV1EIP712.Rebalance memory action;
        action.bounds.maxCollateralSold = 1;
        bytes4 selector = _callRebalance(action);
        assertTrue(selector != LoopV1Errors.PausedAction.selector);
    }

    function testExecuteRebalanceHealthRecoveryBypassesPauseHook() public {
        _pause(uint8(LoopV1Types.PrimaryType.REBALANCE));
        LoopV1EIP712.Rebalance memory action;
        bytes4 selector = _callRebalance(action);
        assertTrue(selector != LoopV1Errors.PausedAction.selector);
    }

    function testExecuteExitBypassesPauseHook() public {
        _pause(uint8(LoopV1Types.PrimaryType.OPEN));
        LoopV1EIP712.Exit memory action;
        bytes4 selector = _callExit(action);
        assertTrue(selector != LoopV1Errors.PausedAction.selector);
    }

    function testExecuteForceExitBypassesPauseHook() public {
        _pause(uint8(LoopV1Types.PrimaryType.OPEN));
        LoopV1EIP712.ForceExit memory action;
        bytes4 selector = _callForceExit(action);
        assertTrue(selector != LoopV1Errors.PausedAction.selector);
    }

    function testAutomationRepayOnlyBypassesPauseHook() public {
        _pause(uint8(LoopV1Types.PrimaryType.REBALANCE));
        LoopV1EIP712.AutomationExec memory action;
        action.bounds.underlyingPrimaryType = 3;
        bytes4 selector = _callAutomation(action);
        assertTrue(selector != LoopV1Errors.PausedAction.selector);
    }

    function testZeroGuardianExecutorDoesNotPauseGate() public {
        LoopExecutorV2 zeroGuardianExecutor = new LoopExecutorV2(auth, registry, IEmergencyGuardian(address(0)));
        _pause(uint8(LoopV1Types.PrimaryType.OPEN));
        LoopV1EIP712.Open memory action;
        bytes4 selector = _callOpen(zeroGuardianExecutor, action);
        assertTrue(selector != LoopV1Errors.PausedAction.selector);
    }

    function _pause(uint8 primaryType) private {
        vm.prank(GUARDIAN);
        guardian.pause(primaryType);
    }

    function _emptyEvidence() private view returns (LoopV1Types.ActionEvidence memory evidence) {
        evidence.blockNumber = block.number;
    }

    function _callOpen(LoopExecutorV2 target, LoopV1EIP712.Open memory action) private returns (bytes4) {
        try target.executeOpen(action, "", _emptyEvidence(), bytes32(0)) returns (LoopV1Types.LoopActionResult memory) {
            return bytes4(0);
        } catch (bytes memory reason) {
            return _selector(reason);
        }
    }

    function _callRebalance(LoopV1EIP712.Rebalance memory action) private returns (bytes4) {
        try executor.executeRebalance(action, "", _emptyEvidence(), bytes32(0)) returns (
            LoopV1Types.LoopActionResult memory
        ) {
            return bytes4(0);
        } catch (bytes memory reason) {
            return _selector(reason);
        }
    }

    function _callExit(LoopV1EIP712.Exit memory action) private returns (bytes4) {
        try executor.executeExit(action, "", _emptyEvidence(), bytes32(0)) returns (
            LoopV1Types.LoopActionResult memory
        ) {
            return bytes4(0);
        } catch (bytes memory reason) {
            return _selector(reason);
        }
    }

    function _callAutomation(LoopV1EIP712.AutomationExec memory action) private returns (bytes4) {
        try executor.executeAutomationExec(action, "", _emptyEvidence(), bytes32(0)) returns (
            LoopV1Types.LoopActionResult memory
        ) {
            return bytes4(0);
        } catch (bytes memory reason) {
            return _selector(reason);
        }
    }

    function _callForceExit(LoopV1EIP712.ForceExit memory action) private returns (bytes4) {
        try forceExecutor.executeForceExit(action, "", _emptyEvidence(), bytes32(0)) returns (
            LoopV1Types.LoopActionResult memory
        ) {
            return bytes4(0);
        } catch (bytes memory reason) {
            return _selector(reason);
        }
    }

    function _selector(bytes memory reason) private pure returns (bytes4 selector) {
        if (reason.length < 4) return bytes4(0);
        assembly {
            selector := mload(add(reason, 0x20))
        }
    }
}
