// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deterministic typehash oracle used by Foundry snapshot tests.
/// @dev Recomputes keccak256(bytes(preimage)) from the committed snapshot preimages.
contract TypehashOracle {
    function hash(string memory preimage) external pure returns (bytes32) {
        return keccak256(bytes(preimage));
    }
}
