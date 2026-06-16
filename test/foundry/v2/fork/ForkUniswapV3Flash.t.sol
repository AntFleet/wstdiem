// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseMainnetForkSetup, IForkUniswapV3Pool} from "./BaseMainnetForkSetup.sol";

interface IFlashErc20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IForkUniswapV3FlashPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

contract ForkFlashRecipient {
    bytes32 internal constant WSTDIEM_REENTRANCY_SLOT = keccak256("wstdiem.loop.executor.base.reentrancy.v1");

    address public immutable pool;
    address public immutable token0;
    address public immutable token1;
    bool public callbackFired;
    bool public guardSetDuringCallback;
    bool public guardClearedAfterFlash;
    uint256 public callbackFee0;
    uint256 public callbackFee1;

    constructor(address pool_) {
        pool = pool_;
        token0 = IForkUniswapV3FlashPool(pool_).token0();
        token1 = IForkUniswapV3FlashPool(pool_).token1();
    }

    function runFlash(uint256 amount0, uint256 amount1) external {
        bytes32 slot = WSTDIEM_REENTRANCY_SLOT;
        assembly {
            tstore(slot, 1)
        }
        IForkUniswapV3FlashPool(pool).flash(address(this), amount0, amount1, abi.encode(amount0, amount1));
        assembly {
            tstore(slot, 0)
        }
        guardClearedAfterFlash = _guardValue() == 0;
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        require(msg.sender == pool, "pool");
        (uint256 amount0, uint256 amount1) = abi.decode(data, (uint256, uint256));
        callbackFired = true;
        callbackFee0 = fee0;
        callbackFee1 = fee1;
        guardSetDuringCallback = _guardValue() == 1;
        if (amount0 != 0 || fee0 != 0) require(IFlashErc20(token0).transfer(pool, amount0 + fee0), "fee0");
        if (amount1 != 0 || fee1 != 0) require(IFlashErc20(token1).transfer(pool, amount1 + fee1), "fee1");
    }

    function _guardValue() private view returns (uint256 value) {
        bytes32 slot = WSTDIEM_REENTRANCY_SLOT;
        assembly {
            value := tload(slot)
        }
    }
}

contract ForkUniswapV3FlashTest is BaseMainnetForkSetup {
    function testRealPoolIdentityAndLiquidity() public view {
        IForkUniswapV3Pool pool = IForkUniswapV3Pool(venues.uniswapPool);
        assertEq(pool.factory(), venues.uniswapFactory);
        assertEq(pool.fee(), venues.uniswapFeeTier);
        assertGt(pool.liquidity(), 0);
    }

    function testRealPoolSlot0TickReadable() public view {
        (, int24 tick,,,,, bool unlocked) = IForkUniswapV3Pool(venues.uniswapPool).slot0();
        assertTrue(unlocked);
        assertTrue(tick != 0);
    }

    function testFlashFeeFormulaMatchesCeilTierMath() public pure {
        uint256 amount = 1_000_000e6;
        uint24 feeTier = 500;
        uint256 expected = ((amount * feeTier) - 1) / 1_000_000 + 1;
        assertEq(expected, 500_000_000);
    }

    function testRealPoolFlashInvokesCallbackRepaysAndClearsGuard() public {
        IForkUniswapV3FlashPool pool = IForkUniswapV3FlashPool(venues.uniswapPool);
        ForkFlashRecipient recipient = new ForkFlashRecipient(venues.uniswapPool);
        uint256 amount0 = pool.token0() == venues.params.loanToken ? 1_000_000 : 0;
        uint256 amount1 = pool.token1() == venues.params.loanToken ? 1_000_000 : 0;
        uint256 expectedFee = ((1_000_000 * uint256(venues.uniswapFeeTier)) - 1) / 1_000_000 + 1;
        deal(venues.params.loanToken, address(recipient), 10_000_000);
        assertGe(IFlashErc20(venues.params.loanToken).balanceOf(address(recipient)), 1_000_000 + expectedFee);

        recipient.runFlash(amount0, amount1);

        assertTrue(recipient.callbackFired());
        assertTrue(recipient.guardSetDuringCallback());
        assertTrue(recipient.guardClearedAfterFlash());
        assertEq(recipient.callbackFee0(), amount0 == 0 ? 0 : expectedFee);
        assertEq(recipient.callbackFee1(), amount1 == 0 ? 0 : expectedFee);
    }
}
