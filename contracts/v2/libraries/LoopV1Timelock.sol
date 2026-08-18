// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared registry/fingerprint queue delay. Mainnet stays at 130_000 (~3d on Base);
///         Base Sepolia is shortened so a testnet Phase C apply can land the same day.
library LoopV1Timelock {
    uint256 internal constant MAINNET_BLOCKS = 130_000;
    uint256 internal constant SEPOLIA_BLOCKS = 300;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    function blocks() internal view returns (uint256) {
        return block.chainid == BASE_SEPOLIA_CHAIN_ID ? SEPOLIA_BLOCKS : MAINNET_BLOCKS;
    }
}
