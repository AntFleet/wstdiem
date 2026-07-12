// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockCurveToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Mock Curve-style stableswap pool for the wstDIEM <-> DIEM leg.
/// @dev Faithful to the surfaces the protocol reads:
///      - executor exit/rebalance: `exchange(int128,int128,uint256,uint256)` and `balances(int128)`
///      - risk oracle adapter depth: `balances(int128)`
///      - registry curve fingerprint: `coins(uint256)`, `A()`, `fee()`, `balances(uint256)`
///      coin0 is the loan/DIEM token, coin1 the wstDIEM collateral (matching the executor's
///      `exchange(1, 0, ...)` collateral->loan swap). `exchange` fills at the caller's `min_dy`
///      limit so the executor's flash repayment nets exactly (no residual dust); `get_dy`
///      exposes the configurable spot rate for quoting. The `balances()` fingerprint snapshot is
///      static and independent of settled token flow, matching the pinned tolerance band.
contract MockCurvePool {
    address public immutable coin0;
    address public immutable coin1;

    uint256 private balance0;
    uint256 private balance1;
    uint256 private amplification;
    uint256 private feeValue;
    uint256 public rate; // WAD: DIEM out per wstDIEM in, for get_dy quoting.

    constructor(address coin0_, address coin1_) {
        coin0 = coin0_;
        coin1 = coin1_;
        balance0 = 50_000_000 ether;
        balance1 = 50_000_000 ether;
        amplification = 200;
        feeValue = 4_000_000;
        rate = 1e18;
    }

    function setBalances(uint256 next0, uint256 next1) external {
        balance0 = next0;
        balance1 = next1;
    }

    function setRate(uint256 nextRate) external {
        rate = nextRate;
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

    function get_dy(int128 i, int128, uint256 dx) external view returns (uint256) {
        // Spot quote using the configurable rate; wstDIEM(coin1) -> DIEM(coin0) uses `rate`.
        return i == 1 ? dx * rate / 1e18 : dx * 1e18 / rate;
    }

    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256 dy) {
        address tokenIn = i == 0 ? coin0 : coin1;
        address tokenOut = j == 0 ? coin0 : coin1;
        require(IMockCurveToken(tokenIn).transferFrom(msg.sender, address(this), dx), "curve: pull");
        // Fill at the caller's limit price so the leveraged flash repayment nets exactly.
        dy = min_dy;
        require(IMockCurveToken(tokenOut).transfer(msg.sender, dy), "curve: liquidity");
    }
}
