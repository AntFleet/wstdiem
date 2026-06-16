// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopAnchorRegistry} from "../../../contracts/v2/LoopAnchorRegistry.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";

contract LoopAnchorRegistryTest is Test {
    address private constant SUBMITTER = address(0xA11CE);
    address private constant NEXT_SUBMITTER = address(0xB0B);

    LoopRegistry private registry;
    LoopAnchorRegistry private anchors;

    event StateSnapshotAccepted(uint256 indexed blockNumber, bytes32 indexed manifestHash, address indexed submitter);

    function setUp() public {
        registry = new LoopRegistry(address(this));
        registry.setAnchorSubmitter(SUBMITTER);
        anchors = new LoopAnchorRegistry(registry);
    }

    function testSubmitByAnchorSubmitterEmitsAndUpdatesBlock() public {
        bytes32 manifest = bytes32(uint256(123));
        vm.prank(SUBMITTER);
        vm.expectEmit(true, true, true, true);
        emit StateSnapshotAccepted(block.number, manifest, SUBMITTER);
        anchors.submitStateSnapshot(block.number, manifest);
        assertEq(anchors.lastAnchorBlock(), block.number);
    }

    function testNonAnchorSubmitterReverts() public {
        vm.expectRevert(LoopV1Errors.AnchorSubmitterOnly.selector);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(1)));
    }

    function testSubmitTooSoonReverts() public {
        vm.prank(SUBMITTER);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(1)));

        vm.roll(block.number + 24);
        vm.prank(SUBMITTER);
        vm.expectRevert(LoopV1Errors.AnchorTooFrequent.selector);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(2)));
    }

    function testSubmitAfterCadenceQuarterSucceeds() public {
        vm.prank(SUBMITTER);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(1)));

        vm.roll(block.number + 25);
        vm.prank(SUBMITTER);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(2)));
        assertEq(anchors.lastAnchorBlock(), block.number);
    }

    function testFutureBlockReverts() public {
        vm.prank(SUBMITTER);
        vm.expectRevert(LoopV1Errors.AnchorInFuture.selector);
        anchors.submitStateSnapshot(block.number + 1, bytes32(uint256(1)));
    }

    function testRotationUsesCurrentRegistrySubmitter() public {
        registry.setAnchorSubmitter(NEXT_SUBMITTER);

        vm.prank(SUBMITTER);
        vm.expectRevert(LoopV1Errors.AnchorSubmitterOnly.selector);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(1)));

        vm.prank(NEXT_SUBMITTER);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(2)));
    }

    function testCadenceBelowFourStillAllowsOneBlockMinimumGap() public {
        registry.setAnchorCadenceBlocks(3);
        vm.prank(SUBMITTER);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(1)));
        vm.prank(SUBMITTER);
        vm.expectRevert(LoopV1Errors.AnchorTooFrequent.selector);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(2)));
        vm.roll(block.number + 1);
        vm.prank(SUBMITTER);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(3)));
    }
}
