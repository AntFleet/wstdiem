// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopAnchorRegistry} from "./interfaces/ILoopAnchorRegistry.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {ILoopV1Events} from "./interfaces/ILoopV1Events.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";

/// @notice Dedicated state-snapshot anchor event surface for Phase 1 indexer reconciliation.
/// @dev PR-6 keeps this out of LoopAuthorization to preserve its EIP-170 margin.
contract LoopAnchorRegistry is ILoopAnchorRegistry, ILoopV1Events {
    ILoopRegistry public immutable registry;
    uint64 public lastAnchorBlock;

    constructor(ILoopRegistry registry_) {
        registry = registry_;
    }

    function submitStateSnapshot(uint256 blockNumber, bytes32 manifestHash) external {
        if (msg.sender != registry.anchorSubmitter()) revert LoopV1Errors.AnchorSubmitterOnly();
        if (blockNumber > block.number) revert LoopV1Errors.AnchorInFuture();

        uint64 last = lastAnchorBlock;
        if (last != 0) {
            uint64 minGap = registry.anchorCadenceBlocks() / 4;
            if (minGap == 0) minGap = 1;
            if (block.number < uint256(last) + minGap) revert LoopV1Errors.AnchorTooFrequent();
        }

        lastAnchorBlock = uint64(block.number);
        emit StateSnapshotAccepted(blockNumber, manifestHash, msg.sender);
    }
}
