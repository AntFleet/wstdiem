// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../libraries/LoopV1Types.sol";

interface IMockMintableToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Minimal Morpho Blue market mock covering exactly the surface the wstDIEM
///         executor, authorization router, and risk oracle adapter call.
/// @dev Faithful to the Morpho Blue ABI selectors pinned in `MorphoSelectors`:
///      supplyCollateral / borrow / repay / withdrawCollateral / setAuthorization, plus the
///      `position`, `market`, and `idToMarketParams` views. Market id derivation matches
///      Morpho (`keccak256(abi.encode(marketParams))`). Shares track assets 1:1 by default;
///      `accrueInterest` can raise totalBorrowAssets without minting shares so tests can prove
///      shares→assets conversion (2026-06-17 Critical F01).
///      Authorization is recorded but not enforced (a testnet mock lends permissively).
contract MockMorpho {
    struct Position {
        uint256 supplyShares;
        uint128 borrowShares;
        uint128 collateral;
    }

    struct Market {
        uint128 totalSupplyAssets;
        uint128 totalSupplyShares;
        uint128 totalBorrowAssets;
        uint128 totalBorrowShares;
        uint128 lastUpdate;
        uint128 fee;
    }

    mapping(bytes32 id => LoopV1Types.MorphoMarketParams params) private marketParamsById;
    mapping(bytes32 id => Market market) private markets;
    mapping(bytes32 id => mapping(address user => Position position)) private positions;
    mapping(address authorizer => mapping(address authorized => bool)) public isAuthorized;

    event MarketCreated(bytes32 indexed id);

    /// @notice Registers a market and seeds ample supply liquidity so utilization stays low.
    /// @return id The Morpho market id (`keccak256(abi.encode(marketParams))`).
    function createMarket(LoopV1Types.MorphoMarketParams calldata marketParams, uint128 supplyLiquidity)
        external
        returns (bytes32 id)
    {
        id = keccak256(abi.encode(marketParams));
        marketParamsById[id] = marketParams;
        markets[id] = Market({
            totalSupplyAssets: supplyLiquidity,
            totalSupplyShares: supplyLiquidity,
            totalBorrowAssets: 0,
            totalBorrowShares: 0,
            lastUpdate: uint128(block.timestamp),
            fee: 0
        });
        emit MarketCreated(id);
    }

    function setAuthorization(address authorized, bool newIsAuthorized) external {
        isAuthorized[msg.sender][authorized] = newIsAuthorized;
    }

    function supplyCollateral(
        LoopV1Types.MorphoMarketParams calldata marketParams,
        uint256 assets,
        address onBehalf,
        bytes calldata
    ) external {
        bytes32 id = keccak256(abi.encode(marketParams));
        require(IMockMintableToken(marketParams.collateralToken).transferFrom(msg.sender, address(this), assets), "pull");
        positions[id][onBehalf].collateral += uint128(assets);
    }

    function borrow(
        LoopV1Types.MorphoMarketParams calldata marketParams,
        uint256 assets,
        uint256,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed) {
        bytes32 id = keccak256(abi.encode(marketParams));
        positions[id][onBehalf].borrowShares += uint128(assets);
        markets[id].totalBorrowAssets += uint128(assets);
        markets[id].totalBorrowShares += uint128(assets);
        require(IMockMintableToken(marketParams.loanToken).transfer(receiver, assets), "lend");
        return (assets, assets);
    }

    function repay(
        LoopV1Types.MorphoMarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid) {
        bytes32 id = keccak256(abi.encode(marketParams));
        require(IMockMintableToken(marketParams.loanToken).transferFrom(msg.sender, address(this), assets), "repay");
        Position storage position = positions[id][onBehalf];
        Market storage market_ = markets[id];

        // Morpho Blue: repay by assets converts to shares via market totals (supports interest accrual).
        if (shares != 0) {
            sharesRepaid = shares;
        } else if (market_.totalBorrowAssets == 0 || market_.totalBorrowShares == 0) {
            sharesRepaid = assets;
        } else {
            // Ceil shares burned so a full-asset repay clears residual share dust after accrual.
            sharesRepaid =
                (assets * uint256(market_.totalBorrowShares) + uint256(market_.totalBorrowAssets) - 1)
                    / uint256(market_.totalBorrowAssets);
        }
        if (sharesRepaid > position.borrowShares) sharesRepaid = position.borrowShares;
        position.borrowShares -= uint128(sharesRepaid);

        uint256 assetsBurned = assets;
        if (assetsBurned > market_.totalBorrowAssets) assetsBurned = market_.totalBorrowAssets;
        market_.totalBorrowAssets -= uint128(assetsBurned);
        market_.totalBorrowShares = uint128(uint256(market_.totalBorrowShares) - sharesRepaid);
        return (assets, sharesRepaid);
    }

    function withdrawCollateral(
        LoopV1Types.MorphoMarketParams calldata marketParams,
        uint256 assets,
        address onBehalf,
        address receiver
    ) external {
        bytes32 id = keccak256(abi.encode(marketParams));
        Position storage position = positions[id][onBehalf];
        require(position.collateral >= assets, "collateral");
        position.collateral -= uint128(assets);
        require(IMockMintableToken(marketParams.collateralToken).transfer(receiver, assets), "withdraw");
    }

    function position(bytes32 id, address user)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)
    {
        Position storage p = positions[id][user];
        return (p.supplyShares, p.borrowShares, p.collateral);
    }

    function market(bytes32 id)
        external
        view
        returns (
            uint128 totalSupplyAssets,
            uint128 totalSupplyShares,
            uint128 totalBorrowAssets,
            uint128 totalBorrowShares,
            uint128 lastUpdate,
            uint128 fee
        )
    {
        Market storage m = markets[id];
        return (m.totalSupplyAssets, m.totalSupplyShares, m.totalBorrowAssets, m.totalBorrowShares, m.lastUpdate, m.fee);
    }

    function idToMarketParams(bytes32 id)
        external
        view
        returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)
    {
        LoopV1Types.MorphoMarketParams storage p = marketParamsById[id];
        return (p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv);
    }

    /// @notice Increase market totalBorrowAssets without changing share supply (simulates accrual).
    /// @dev Leaves position.borrowShares unchanged so true debt assets > shares (F01 regression).
    function accrueInterest(bytes32 id, uint128 assets) external {
        markets[id].totalBorrowAssets += assets;
        markets[id].lastUpdate = uint128(block.timestamp);
    }
}

/// @notice Mock Morpho oracle returning a fixed WAD-scaled price (`price()`), matching the
///         `IOraclePriceMinimal` surface read by the executor and risk oracle adapter.
contract MockMorphoOracle {
    uint256 public price;

    constructor(uint256 price_) {
        price = price_;
    }

    function setPrice(uint256 price_) external {
        price = price_;
    }
}

/// @notice Placeholder Morpho IRM. Never called by the wstDIEM contracts; it exists only so the
///         market params reference a real, distinct address that matches the pinned fingerprint.
contract MockMorphoIrm {
    function borrowRateView(bytes calldata, bytes calldata) external pure returns (uint256) {
        return 0;
    }
}
