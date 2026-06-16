// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ForkMock4626Vault {
    address public immutable asset;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    uint256 public totalAssets;

    constructor(address asset_, uint8 decimals_) {
        asset = asset_;
        decimals = decimals_;
        totalSupply = 1_000_000 ether;
        totalAssets = 1_000_500 ether;
    }

    function setTotals(uint256 nextSupply, uint256 nextAssets) external {
        totalSupply = nextSupply;
        totalAssets = nextAssets;
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        return shares * totalAssets / totalSupply;
    }
}

contract ForkMockCurvePool {
    address private immutable coin0;
    address private immutable coin1;
    uint256 private balance0;
    uint256 private balance1;
    uint256 private amplification;
    uint256 private feeValue;

    constructor(address coin0_, address coin1_) {
        coin0 = coin0_;
        coin1 = coin1_;
        balance0 = 50_000_000 * 1e6;
        balance1 = 15_000 ether;
        amplification = 200;
        feeValue = 4_000_000;
    }

    function setBalances(uint256 next0, uint256 next1) external {
        balance0 = next0;
        balance1 = next1;
    }

    function coins(uint256 i) external view returns (address) {
        return i == 0 ? coin0 : coin1;
    }

    function balances(uint256 i) external view returns (uint256) {
        return i == 0 ? balance0 : balance1;
    }

    function balances(int128 i) external view returns (uint256) {
        return i == 0 ? balance0 : balance1;
    }

    function A() external view returns (uint256) {
        return amplification;
    }

    function fee() external view returns (uint256) {
        return feeValue;
    }

    function oracle() external pure returns (uint256) {
        return 1e18;
    }

    function liquidity() external view returns (uint256) {
        return balance0 + balance1;
    }
}
