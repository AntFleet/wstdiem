// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
import {LoopV1EIP712} from "./LoopV1EIP712.sol";
import {LoopV1Errors} from "./LoopV1Errors.sol";
import {LoopV1Hashing} from "./LoopV1Hashing.sol";
import {LoopV1Types} from "./LoopV1Types.sol";

/// @notice Linked validation helpers shared by Phase 1 authorization contracts.
/// @dev Keeps canonical evidence-set checks consistent while reducing deployable router size.
library LoopV1Validation {
    function validateEvidence(
        ILoopRegistry registry,
        LoopV1Types.ActionEvidence calldata evidence,
        LoopV1EIP712.ActionIdentity calldata identity,
        uint8 primaryType,
        bytes32 claimedBundleHash
    ) public view {
        if (LoopV1Hashing.hashEvidence(evidence) != claimedBundleHash) {
            revert LoopV1Errors.EvidenceBundleHashMismatch();
        }
        if (evidence.owner != identity.owner || evidence.market != identity.market) {
            revert LoopV1Errors.EvidenceSourceUnexpected();
        }
        if ((evidence.stateBitmap & ~LoopV1Types.KNOWN_STATE_MASK) != 0) {
            revert LoopV1Errors.StateBitmapUnknownBits();
        }
        if (evidence.blockNumber > block.number) revert LoopV1Errors.BlockInconsistent();
        bytes32[] memory required = registry.requiredEvidenceSourceSet(primaryType);
        if (evidence.sources.length != required.length) {
            if (evidence.sources.length < required.length) revert LoopV1Errors.EvidenceSourceMissing();
            revert LoopV1Errors.EvidenceSourceUnexpected();
        }
        bytes32 prevId;
        address prevAddress;
        for (uint256 i = 0; i < evidence.sources.length; i++) {
            LoopV1Types.EvidenceSource calldata source = evidence.sources[i];
            if (
                i > 0
                    && (source.sourceId < prevId || (source.sourceId == prevId && source.sourceAddress <= prevAddress))
            ) {
                revert LoopV1Errors.EvidenceUnsorted();
            }
            if (source.sourceId != required[i]) revert LoopV1Errors.EvidenceSourceUnexpected();
            address canonical = registry.canonicalSource(identity.market, source.sourceId);
            if (canonical != address(0) && source.sourceAddress != canonical) {
                revert LoopV1Errors.EvidenceSourceAddressMismatch();
            }
            // 2026-06-17 High: EvidenceSource.status was hashed but never asserted.
            // Non-force paths require FRESH. ForceExit may carry DEGRADED when the
            // live bitmap / acknowledgedRisks path has already authorized overrides.
            if (uint8(source.status) == uint8(LoopV1Types.SourceStatus.FRESH)) {
                // ok
            } else if (
                primaryType == uint8(LoopV1Types.PrimaryType.FORCE_EXIT)
                    && uint8(source.status) == uint8(LoopV1Types.SourceStatus.DEGRADED)
            ) {
                // ok
            } else {
                revert LoopV1Errors.EvidenceStale();
            }
            uint256 threshold = registry.sourceFreshnessThreshold(source.sourceId);
            if (threshold != 0 && block.number > source.lastUpdateBlock + threshold) {
                revert LoopV1Errors.EvidenceStale();
            }
            prevId = source.sourceId;
            prevAddress = source.sourceAddress;
        }
    }
}
