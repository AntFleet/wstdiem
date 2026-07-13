// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopV1EIP712} from "../../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";

/// @notice Builds registry-compliant ActionEvidence for foundry tests after
///         requiredEvidenceSourceSet is pinned in DeploymentManifest.
library EvidenceBuilder {
    function build(
        ILoopRegistry registry,
        uint8 primaryType,
        address owner,
        bytes32 market
    ) internal view returns (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) {
        bytes32[] memory required = registry.requiredEvidenceSourceSet(primaryType);
        evidence.actionId = bytes32(0);
        evidence.evidenceSetId = bytes32(0);
        evidence.owner = owner;
        evidence.market = market;
        evidence.blockNumber = block.number;
        evidence.stateBitmap = 0;
        evidence.sources = new LoopV1Types.EvidenceSource[](required.length);
        for (uint256 i = 0; i < required.length; i++) {
            bytes32 sourceId = required[i];
            address canonical = registry.canonicalSource(market, sourceId);
            evidence.sources[i] = LoopV1Types.EvidenceSource({
                sourceId: sourceId,
                sourceAddress: canonical,
                status: LoopV1Types.SourceStatus.FRESH,
                lastUpdateBlock: block.number,
                valueHash: keccak256(abi.encodePacked(sourceId, canonical, block.number))
            });
        }
        bundleHash = hashBundle(evidence);
    }

    function hashBundle(LoopV1Types.ActionEvidence memory evidence) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
                evidence.actionId,
                evidence.evidenceSetId,
                evidence.owner,
                evidence.market,
                evidence.blockNumber,
                evidence.stateBitmap,
                keccak256(abi.encode(evidence.sources))
            )
        );
    }
}
