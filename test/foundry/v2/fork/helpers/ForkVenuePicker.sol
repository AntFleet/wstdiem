// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../../../../../contracts/v2/libraries/LoopV1Types.sol";

library ForkVenuePicker {
    address internal constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address internal constant BASE_SEQUENCER_FEED = 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433;
    address internal constant UNISWAP_V3_FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant ETH_USD_CHAINLINK_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    address internal constant USDC_WETH_500_POOL = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address internal constant MORPHO_ORACLE = 0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4;
    address internal constant MORPHO_IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    bytes32 internal constant USDC_WETH_MARKET = 0x8793cf302b8ffd655ab97bd1c695dbd967807e8367a65cb2f4edaf1380ba1bda;
    uint256 internal constant LLTV = 860000000000000000;
    uint24 internal constant UNISWAP_FEE_TIER = 500;

    struct Venues {
        bytes32 market;
        LoopV1Types.MorphoMarketParams params;
        address morpho;
        address curvePool;
        address vault;
        address uniswapFactory;
        address uniswapPool;
        uint24 uniswapFeeTier;
        address chainlinkFeed;
        address sequencerFeed;
    }
}
