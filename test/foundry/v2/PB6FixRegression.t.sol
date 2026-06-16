// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {EmergencyGuardian} from "../../../contracts/v2/EmergencyGuardian.sol";
import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";

contract PB6FixRegressionTest is Test {
    address private constant GOVERNANCE = address(0xA11CE);
    address private constant GUARDIAN = address(0xB0B);
    address private constant NEXT_GUARDIAN = address(0xC0DE);

    function testLowLevelAuthorizationSnapshotSelectorIsAbsent() public {
        LoopAuthorization auth = _authorization();

        (bool ok, bytes memory data) = address(auth)
            .call(
                abi.encodeWithSignature("submitStateSnapshot(uint256,bytes32,bytes)", uint256(1), bytes32(0), bytes(""))
            );
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function testLowLevelAuthorizationLastAnchoredBlockGetterIsAbsent() public {
        LoopAuthorization auth = _authorization();

        (bool ok, bytes memory data) = address(auth).staticcall(abi.encodeWithSignature("lastAnchoredBlock()"));
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function testAuthorizationDomainSeparatorStillReachableAfterAnchorRemoval() public {
        LoopAuthorization auth = _authorization();

        assertTrue(auth.domainSeparator() != bytes32(0));
    }

    function testNotPausedSelectorReachable() public pure {
        assertTrue(LoopV1Errors.NotPaused.selector != bytes4(0));
    }

    function testAlreadyPausedSelectorReachable() public pure {
        assertTrue(LoopV1Errors.AlreadyPaused.selector != bytes4(0));
    }

    function testRolesMustDifferSelectorReachable() public pure {
        assertTrue(LoopV1Errors.RolesMustDiffer.selector != bytes4(0));
    }

    function testPB6FixSelectorsDoNotCollideWithPauseSelectors() public pure {
        assertTrue(LoopV1Errors.NotPaused.selector != LoopV1Errors.PausedAction.selector);
        assertTrue(LoopV1Errors.AlreadyPaused.selector != LoopV1Errors.PauseRateLimited.selector);
        assertTrue(LoopV1Errors.RolesMustDiffer.selector != LoopV1Errors.GovernanceRoleOnly.selector);
        assertTrue(LoopV1Errors.RolesMustDiffer.selector != LoopV1Errors.PauseAuthorityOnly.selector);
    }

    function testActivePauseRefreshRevertsAlreadyPausedAfterRateWindow() public {
        EmergencyGuardian guardian = _guardian();
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));

        vm.roll(block.number + 901);
        vm.prank(GUARDIAN);
        vm.expectRevert(LoopV1Errors.AlreadyPaused.selector);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testActivePauseRefreshDoesNotMoveExpiry() public {
        EmergencyGuardian guardian = _guardian();
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.REBALANCE));
        uint256 expiry = guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.REBALANCE));

        vm.roll(block.number + 901);
        vm.prank(GUARDIAN);
        vm.expectRevert(LoopV1Errors.AlreadyPaused.selector);
        guardian.pause(uint8(LoopV1Types.PrimaryType.REBALANCE));

        assertEq(guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.REBALANCE)), expiry);
    }

    function testExpiredPauseReaffirmRevertsNotPaused() public {
        EmergencyGuardian guardian = _guardian();
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));

        vm.roll(block.number + 302_400);
        vm.prank(GOVERNANCE);
        vm.expectRevert(LoopV1Errors.NotPaused.selector);
        guardian.reaffirmPause(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testNeverPausedReaffirmRevertsNotPaused() public {
        EmergencyGuardian guardian = _guardian();

        vm.prank(GOVERNANCE);
        vm.expectRevert(LoopV1Errors.NotPaused.selector);
        guardian.reaffirmPause(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testConstructorRejectsRoleOverlap() public {
        vm.expectRevert(LoopV1Errors.RolesMustDiffer.selector);
        new EmergencyGuardian(GOVERNANCE, GOVERNANCE);
    }

    function testRotationRejectsRoleOverlap() public {
        EmergencyGuardian guardian = _guardian();

        vm.prank(GOVERNANCE);
        vm.expectRevert(LoopV1Errors.RolesMustDiffer.selector);
        guardian.rotateGuardianRole(GOVERNANCE);
    }

    function testOpenAndRebalancePauseBitsCanCoexistWithoutRefresh() public {
        EmergencyGuardian guardian = _guardian();
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        uint256 openExpiry = guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN));

        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.REBALANCE));

        assertTrue(guardian.isPaused(uint8(LoopV1Types.PrimaryType.OPEN)));
        assertTrue(guardian.isPaused(uint8(LoopV1Types.PrimaryType.REBALANCE)));
        assertEq(guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN)), openExpiry);
    }

    function testOutOfRangePauseStillRevertsScopeViolationAfterErrorChanges() public {
        EmergencyGuardian guardian = _guardian();

        vm.prank(GUARDIAN);
        vm.expectRevert(LoopV1Errors.PauseScopeViolation.selector);
        guardian.pause(uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC) + 1);
    }

    function _guardian() private returns (EmergencyGuardian) {
        return new EmergencyGuardian(GOVERNANCE, GUARDIAN);
    }

    function _authorization() private returns (LoopAuthorization) {
        LoopRegistry registry = new LoopRegistry(address(this));
        return new LoopAuthorization(registry);
    }
}
