// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical Morpho Blue selectors used by LoopAuthorization.
/// @dev PB1.3 closes the SDK type definitions §A6.11 item 1 by deriving selectors from
///   the Morpho Blue ABI signatures directly in Solidity.
library MorphoSelectors {
    bytes4 internal constant SUPPLY_COLLATERAL =
        bytes4(keccak256("supplyCollateral((address,address,address,address,uint256),uint256,address,bytes)"));
    bytes4 internal constant BORROW =
        bytes4(keccak256("borrow((address,address,address,address,uint256),uint256,uint256,address,address)"));
    bytes4 internal constant REPAY =
        bytes4(keccak256("repay((address,address,address,address,uint256),uint256,uint256,address,bytes)"));
    bytes4 internal constant WITHDRAW_COLLATERAL =
        bytes4(keccak256("withdrawCollateral((address,address,address,address,uint256),uint256,address,address)"));
    bytes4 internal constant SET_AUTHORIZATION = bytes4(keccak256("setAuthorization(address,bool)"));
    bytes4 internal constant ACCRUE_INTEREST =
        bytes4(keccak256("accrueInterest((address,address,address,address,uint256))"));
    bytes4 internal constant LIQUIDATE =
        bytes4(keccak256("liquidate((address,address,address,address,uint256),address,uint256,uint256,bytes)"));
}
