// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {LoopV1Errors} from "../../../../contracts/v2/libraries/LoopV1Errors.sol";
import {BaseMainnetForkSetup} from "./BaseMainnetForkSetup.sol";

contract ForkEmergencyGuardianIntegrationTest is BaseMainnetForkSetup {
    function testGuardianPauseBlocksOpenClass() public {
        vm.prank(guardian.guardianRole());
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));
        vm.expectRevert(LoopV1Errors.PausedAction.selector);
        guardian.requireNotPaused(uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testGuardianPauseDoesNotBlockForceExitClass() public view {
        guardian.requireNotPaused(uint8(LoopV1Types.PrimaryType.FORCE_EXIT));
    }
}
