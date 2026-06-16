// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "./LoopV1Types.sol";
import {MorphoSelectors} from "./MorphoSelectors.sol";

/// @notice Canonical single-call Morpho calldata encoders accepted by LoopAuthorization.
library LoopV1MorphoCalldata {
    function supplyCollateral(LoopV1Types.MorphoMarketParams memory params, uint256 assets, address owner)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(MorphoSelectors.SUPPLY_COLLATERAL, params, assets, owner, bytes(""));
    }

    function borrow(LoopV1Types.MorphoMarketParams memory params, uint256 assets, address owner, address executor)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(MorphoSelectors.BORROW, params, assets, uint256(0), owner, executor);
    }

    function repay(LoopV1Types.MorphoMarketParams memory params, uint256 assets, address owner)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(MorphoSelectors.REPAY, params, assets, uint256(0), owner, bytes(""));
    }

    function withdrawCollateral(
        LoopV1Types.MorphoMarketParams memory params,
        uint256 assets,
        address owner,
        address executor
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MorphoSelectors.WITHDRAW_COLLATERAL, params, assets, owner, executor);
    }
}
