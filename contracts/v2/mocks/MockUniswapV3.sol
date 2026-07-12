// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockFlashToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV3FlashCallback {
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
}

/// @notice Mock Uniswap V3 pool providing the flash-loan and fingerprint surfaces the executor uses.
/// @dev Faithful to:
///      - executor flash: `flash(address,uint256,uint256,bytes)` invoking
///        `uniswapV3FlashCallback(fee0,fee1,bytes)` and requiring principal+fee repayment.
///      - registry uniswap fingerprint: `factory`/`token0`/`token1`/`fee`/`tickSpacing`/`liquidity`/`slot0`.
///      Fees use the exact executor formula `((amount*feeTier)-1)/1e6 + 1`. token0/token1 must be
///      passed already sorted (token0 < token1) to match Uniswap ordering and the factory lookup.
///      The pool must be pre-funded with both tokens to satisfy flash draws.
contract MockUniswapV3FlashPool {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;

    uint128 public liquidity;
    int24 public tick;

    error FlashNotRepaid();

    constructor(address factory_, address token0_, address token1_, uint24 fee_, int24 tickSpacing_) {
        require(token0_ < token1_, "pool: token order");
        factory = factory_;
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
        tickSpacing = tickSpacing_;
        liquidity = 1_000_000 ether;
        tick = 0;
    }

    function slot0()
        external
        pure
        returns (
            uint160 sqrtPriceX96,
            int24 tick_,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        return (uint160(1) << 96, int24(0), 0, 1, 1, 0, true);
    }

    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external {
        uint256 fee0 = _flashFee(amount0);
        uint256 fee1 = _flashFee(amount1);
        uint256 balance0Before = IMockFlashToken(token0).balanceOf(address(this));
        uint256 balance1Before = IMockFlashToken(token1).balanceOf(address(this));

        if (amount0 > 0) require(IMockFlashToken(token0).transfer(recipient, amount0), "flash: token0");
        if (amount1 > 0) require(IMockFlashToken(token1).transfer(recipient, amount1), "flash: token1");

        IUniswapV3FlashCallback(recipient).uniswapV3FlashCallback(fee0, fee1, data);

        if (IMockFlashToken(token0).balanceOf(address(this)) < balance0Before + fee0) revert FlashNotRepaid();
        if (IMockFlashToken(token1).balanceOf(address(this)) < balance1Before + fee1) revert FlashNotRepaid();
    }

    function _flashFee(uint256 amount) private view returns (uint256) {
        if (amount == 0) return 0;
        return ((amount * uint256(fee)) - 1) / 1_000_000 + 1;
    }
}

/// @notice Mock Uniswap V3 factory implementing `getPool` for the canonical flash-pool lookup.
/// @dev The executor's `_canonicalFlashPool` requires
///      `factory.getPool(loanToken, collateralToken, feeTier) == registeredFlashPool`.
contract MockUniswapV3Factory {
    mapping(address token0 => mapping(address token1 => mapping(uint24 fee => address pool))) private pools;

    function registerPool(address tokenA, address tokenB, uint24 fee, address pool) external {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pools[t0][t1][fee] = pool;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool) {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return pools[t0][t1][fee];
    }
}
