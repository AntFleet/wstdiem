// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SignatureChecker} from "openzeppelin-contracts/contracts/utils/cryptography/SignatureChecker.sol";

import {LoopV1EIP712} from "./LoopV1EIP712.sol";

/// @notice Thin wrapper around OpenZeppelin SignatureChecker plus the NF-15 proof hash.
/// @dev Keeps all EOA/EIP-1271 signature validation routed through OZ per PROTOCOL.md §6.4 / I-66.
library SignatureCheckerLib {
    function isValidSignatureNow(address signer, bytes32 digest, bytes memory signature) internal view returns (bool) {
        return SignatureChecker.isValidSignatureNow(signer, digest, signature);
    }

    function preimageProofHash(
        address owner,
        uint8 primaryType,
        uint8 executionKind,
        uint8 mevProtectionMode,
        uint8 mevWaiverBits,
        uint8 acknowledgedRisks,
        uint8 policyClass,
        bytes32 market,
        uint256 registryVersion,
        uint248 nonceSlot,
        uint8 nonceBit,
        uint256 maxCollateralSold,
        uint256 maxDebtIncrease,
        uint256 deadline,
        address verifyingContract
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.PREIMAGE_PROOF_TYPEHASH,
                owner,
                primaryType,
                executionKind,
                mevProtectionMode,
                mevWaiverBits,
                acknowledgedRisks,
                policyClass,
                market,
                registryVersion,
                nonceSlot,
                nonceBit,
                maxCollateralSold,
                maxDebtIncrease,
                deadline,
                verifyingContract
            )
        );
    }
}
