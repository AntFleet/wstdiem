// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {EmergencyGuardian} from "../../../contracts/v2/EmergencyGuardian.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";

contract EmergencyGuardianTest is Test {
    address private constant GOVERNANCE = address(0xA11CE);
    address private constant GUARDIAN = address(0xB0B);
    address private constant NEXT_GUARDIAN = address(0xC0DE);

    EmergencyGuardian private guardian;

    function setUp() public {
        guardian = new EmergencyGuardian(GOVERNANCE, GUARDIAN);
    }

    function testInitialStateIsUnpausedAndIncidentNone() public view {
        assertFalse(guardian.isPaused(uint8(LoopV1Types.PrimaryType.OPEN)));
        assertFalse(guardian.isPaused(uint8(LoopV1Types.PrimaryType.REBALANCE)));
        assertEq(uint8(guardian.incidentState()), uint8(LoopV1Types.IncidentState.NONE));
        assertEq(guardian.governanceRole(), GOVERNANCE);
        assertEq(guardian.guardianRole(), GUARDIAN);
    }

    function testPauseOpenBlocksAndUnpauseClearsAfterRateLimit() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        assertTrue(guardian.isPaused(uint8(LoopV1Types.PrimaryType.OPEN)));
        assertEq(guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN)), block.number + 302_400);

        vm.roll(block.number + 901);
        vm.prank(GUARDIAN);
        guardian.unpause(uint8(LoopV1Types.PrimaryType.OPEN));
        assertFalse(guardian.isPaused(uint8(LoopV1Types.PrimaryType.OPEN)));
    }

    function testPauseActionClassAlias() public {
        vm.prank(GUARDIAN);
        guardian.pauseActionClass(uint8(LoopV1Types.PrimaryType.OPEN));
        assertTrue(guardian.paused(uint8(LoopV1Types.PrimaryType.OPEN)));
    }

    function testFirstPauseExemptFromRateLimit() public {
        vm.roll(1);
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        assertEq(guardian.lastToggleBlock(uint8(LoopV1Types.PrimaryType.OPEN)), 1);
    }

    function testSecondToggleRateLimited() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        vm.prank(GUARDIAN);
        vm.expectRevert(LoopV1Errors.PauseRateLimited.selector);
        guardian.unpause(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testSecondPauseRateLimited() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        vm.prank(GUARDIAN);
        vm.expectRevert(LoopV1Errors.PauseRateLimited.selector);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testActivePauseCannotBeRefreshedAfterRateLimit() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        uint256 originalExpiry = guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN));

        vm.roll(block.number + 901);
        vm.prank(GUARDIAN);
        vm.expectRevert(LoopV1Errors.AlreadyPaused.selector);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        assertEq(guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN)), originalExpiry);
    }

    function testIndependentPauseTypesDoNotRefreshEachOther() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        uint256 openExpiry = guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN));

        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.REBALANCE));

        assertEq(guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN)), openExpiry);
        assertTrue(guardian.isPaused(uint8(LoopV1Types.PrimaryType.REBALANCE)));
    }

    function testCannotPauseExitForceExitRevokeOrAutomation() public {
        uint8[4] memory blocked = [
            uint8(LoopV1Types.PrimaryType.EXIT),
            uint8(LoopV1Types.PrimaryType.FORCE_EXIT),
            uint8(LoopV1Types.PrimaryType.REVOKE),
            uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)
        ];
        for (uint256 i = 0; i < blocked.length; i++) {
            vm.prank(GUARDIAN);
            vm.expectRevert(LoopV1Errors.PauseScopeViolation.selector);
            guardian.pause(blocked[i]);
        }
    }

    function testRequireNotPausedRevertsOnlyWhileActive() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));

        vm.expectRevert(LoopV1Errors.PausedAction.selector);
        guardian.requireNotPaused(uint8(LoopV1Types.PrimaryType.OPEN));

        vm.roll(block.number + 302_400);
        guardian.requireNotPaused(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testPauseAutoExpiresAfterSevenDays() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.REBALANCE));
        vm.roll(block.number + 302_399);
        assertTrue(guardian.isPaused(uint8(LoopV1Types.PrimaryType.REBALANCE)));
        vm.roll(block.number + 1);
        assertFalse(guardian.isPaused(uint8(LoopV1Types.PrimaryType.REBALANCE)));
    }

    function testGovernanceReaffirmExtendsWindow() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        vm.roll(block.number + 100);
        vm.prank(GOVERNANCE);
        guardian.reaffirmPause(uint8(LoopV1Types.PrimaryType.OPEN));
        assertEq(guardian.pauseExpiresAt(uint8(LoopV1Types.PrimaryType.OPEN)), block.number + 302_400);
    }

    function testNonGovernanceCannotReaffirmOrClearOrRotate() public {
        vm.expectRevert(LoopV1Errors.GovernanceRoleOnly.selector);
        guardian.reaffirmPause(uint8(LoopV1Types.PrimaryType.OPEN));
        vm.expectRevert(LoopV1Errors.GovernanceRoleOnly.selector);
        guardian.clearIncidentState();
        vm.expectRevert(LoopV1Errors.GovernanceRoleOnly.selector);
        guardian.rotateGuardianRole(NEXT_GUARDIAN);
    }

    function testReaffirmExpiredPauseReverts() public {
        vm.prank(GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        vm.roll(block.number + 302_400);
        vm.prank(GOVERNANCE);
        vm.expectRevert(LoopV1Errors.NotPaused.selector);
        guardian.reaffirmPause(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testReaffirmNeverPausedRevertsNotPaused() public {
        vm.prank(GOVERNANCE);
        vm.expectRevert(LoopV1Errors.NotPaused.selector);
        guardian.reaffirmPause(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testIncidentStateSetByGuardianAndClearByGovernance() public {
        vm.prank(GUARDIAN);
        guardian.setIncidentState(LoopV1Types.IncidentState.INVESTIGATING);
        assertEq(uint8(guardian.incidentState()), uint8(LoopV1Types.IncidentState.INVESTIGATING));

        vm.prank(GOVERNANCE);
        guardian.clearIncidentState();
        assertEq(uint8(guardian.incidentState()), uint8(LoopV1Types.IncidentState.NONE));
    }

    function testNonGuardianCannotPauseOrSetIncident() public {
        vm.expectRevert(LoopV1Errors.PauseAuthorityOnly.selector);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        vm.expectRevert(LoopV1Errors.PauseAuthorityOnly.selector);
        guardian.setIncidentState(LoopV1Types.IncidentState.MITIGATING);
    }

    function testGovernanceRotatesGuardian() public {
        vm.prank(GOVERNANCE);
        guardian.rotateGuardianRole(NEXT_GUARDIAN);
        assertEq(guardian.guardianRole(), NEXT_GUARDIAN);

        vm.prank(NEXT_GUARDIAN);
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        assertTrue(guardian.isPaused(uint8(LoopV1Types.PrimaryType.OPEN)));
    }

    function testConstructorRejectsOverlappingRoles() public {
        vm.expectRevert(LoopV1Errors.RolesMustDiffer.selector);
        new EmergencyGuardian(GOVERNANCE, GOVERNANCE);
    }

    function testGovernanceCannotRotateGuardianOntoGovernance() public {
        vm.prank(GOVERNANCE);
        vm.expectRevert(LoopV1Errors.RolesMustDiffer.selector);
        guardian.rotateGuardianRole(GOVERNANCE);
    }

    function testConstantsMatchSpec() public view {
        assertEq(guardian.PAUSE_RATE_LIMIT_BLOCKS(), 900);
        assertEq(guardian.PAUSE_AUTO_EXPIRE_BLOCKS(), 302_400);
    }
}
