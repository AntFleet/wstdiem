// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1EIP712} from "../libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice ForceExit validation surface at the distinct force-exit verifying contract.
/// @dev PR-4 implements this interface; PR-1 only fixes the ABI shape.
interface ILoopForceExitAuthorizer {
    function validateForceExitDigest(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.ForceExit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external view returns (LoopV1Types.ValidationResult memory);

    function validateHighRiskPolicy(
        address owner,
        bytes32 digest,
        uint8 primaryType,
        uint8 executionKind,
        uint8 mevProtectionMode,
        uint8 mevWaiverBits,
        uint8 acknowledgedRisks,
        bytes32 market,
        uint256 registryVersion,
        uint248 nonceSlot,
        uint8 nonceBit,
        bytes32 eip1271PreimageDisplayProof
    ) external view returns (bool attested);
}
