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

    /// @notice Legacy no-hash path — tests only. Production anchor must use WithBlockHash.
    /// @dev Prefer `submitStateSnapshotWithBlockHash`. Kept so forge unit tests that do not
    ///      care about reorg safety can still exercise cadence / submitter gates.
    function submitStateSnapshot(uint256 blockNumber, bytes32 manifestHash) external {
        _submit(blockNumber, bytes32(0), manifestHash, false);
    }

    /// @notice Production submit path: blockhash cross-check when the block is still in the EVM window.
    /// @dev Audit B (2026-06-17 / 2026-07-13): closes blind notarization of stale/reorged indexer heads.
    ///      The off-chain anchor service always calls this entrypoint.
    function submitStateSnapshotWithBlockHash(uint256 blockNumber, bytes32 blockHash, bytes32 manifestHash)
        external
    {
        _submit(blockNumber, blockHash, manifestHash, true);
    }

    function _submit(uint256 blockNumber, bytes32 blockHash, bytes32 manifestHash, bool requireHash) private {
        if (msg.sender != registry.anchorSubmitter()) revert LoopV1Errors.AnchorSubmitterOnly();
        if (blockNumber > block.number) revert LoopV1Errors.AnchorInFuture();

        if (requireHash) {
            if (blockHash == bytes32(0)) revert LoopV1Errors.BlockInconsistent();
            // blockhash() is only non-zero for the most recent 256 blocks (excluding current).
            // When the block is still in the window, a missing or mismatched hash is fail-closed.
            if (block.number > blockNumber && block.number - blockNumber <= 256) {
                bytes32 live = blockhash(blockNumber);
                if (live == bytes32(0) || live != blockHash) revert LoopV1Errors.BlockInconsistent();
            }
        }

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
