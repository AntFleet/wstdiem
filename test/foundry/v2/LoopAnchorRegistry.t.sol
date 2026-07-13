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
        // F22: rotation after bootstrap must queue + apply after REGISTRY_TIMELOCK_BLOCKS.
        registry.setAnchorSubmitter(NEXT_SUBMITTER);
        (address pending,) = registry.pendingCriticalRole(registry.ROLE_ANCHOR_SUBMITTER());
        assertEq(pending, NEXT_SUBMITTER);
        vm.roll(block.number + 130_000);
        registry.applyAnchorSubmitter();

        vm.prank(SUBMITTER);
        vm.expectRevert(LoopV1Errors.AnchorSubmitterOnly.selector);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(1)));

        vm.prank(NEXT_SUBMITTER);
        anchors.submitStateSnapshot(block.number, bytes32(uint256(2)));
    }

    function testSubmitWithBlockHashMismatchReverts() public {
        // Produce a finalized prior block so blockhash(prior) is non-zero and checkable.
        vm.roll(10);
        uint256 prior = 9;
        bytes32 live = blockhash(prior);
        assertTrue(live != bytes32(0), "foundry must expose prior blockhash");

        vm.prank(SUBMITTER);
        vm.expectRevert(LoopV1Errors.BlockInconsistent.selector);
        anchors.submitStateSnapshotWithBlockHash(prior, keccak256("bad-hash"), bytes32(uint256(1)));

        vm.prank(SUBMITTER);
        anchors.submitStateSnapshotWithBlockHash(prior, live, bytes32(uint256(1)));
        assertEq(anchors.lastAnchorBlock(), block.number);
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
