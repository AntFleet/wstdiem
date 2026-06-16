// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopV1Types} from "../../contracts/v2/libraries/LoopV1Types.sol";

library DeploymentManifest {
    uint8 internal constant OP_SET_MARKET_PARAMS = 1;
    uint8 internal constant OP_SET_CANONICAL_SOURCE = 2;
    uint8 internal constant OP_SET_EXECUTOR_FOR = 4;
    uint8 internal constant OP_SET_LOOP_AUTHORIZATION = 5;
    uint8 internal constant OP_SET_LOOP_FORCE_EXIT_AUTHORIZER = 6;
    uint8 internal constant OP_SET_ALLOWED_SPENDER = 7;
    uint8 internal constant OP_SET_MORPHO = 8;
    uint8 internal constant OP_SET_CURVE_POOL = 9;
    uint8 internal constant OP_SET_UNISWAP_V3_FLASH_POOL = 10;
    uint8 internal constant OP_SET_WSTDIEM_VAULT = 11;
    uint8 internal constant OP_SET_UNISWAP_V3_FACTORY = 12;
    uint8 internal constant OP_SET_UNISWAP_V3_FLASH_FEE_TIER = 13;
    uint8 internal constant OP_SET_SUPPORTED_MARKET = 18;
    uint8 internal constant OP_SET_FORCE_EXIT_BUFFER_BPS = 19;

    struct MarketConfig {
        bytes32 id;
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
        address curvePool;
        address wstDiemVault;
        address uniswapV3Factory;
        address uniswapV3FlashPool;
        uint24 uniswapV3FlashFeeTier;
        address chainlinkFeed;
        address sequencerFeed;
        address morpho;
    }

    struct DeploymentConfig {
        uint256 chainId;
        address governanceMultisig;
        address initialGuardian;
        address anchorSubmitter;
        address indexerSigningKey;
        address protocolFeeReceiver;
        address automationFeeReceiver;
        uint64 anchorCadenceBlocks;
        uint256 harvestCoolingBlocks;
        uint256 forceExitMaxDeadlineSeconds;
        uint16 attemptThrottleWindowBlocks;
        uint8 maxFailedAttemptsPerWindow;
        MarketConfig market;
    }

    struct DeployedContracts {
        address registry;
        address forceExitAuthorizer;
        address authorization;
        address executorV2;
        address forceExitExecutor;
        address riskOracleAdapter;
        address feeRouter;
        address anchorRegistry;
        address emergencyGuardian;
    }

    function deploymentHash(DeploymentConfig memory config, DeployedContracts memory deployed)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(config, deployed));
    }

    function initialRoot(bytes32 deploymentHash_) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("wstdiem.phase1.initial-root", deploymentHash_));
    }

    function buildInitialOps(DeploymentConfig memory config, DeployedContracts memory deployed)
        internal
        pure
        returns (ILoopRegistry.BatchOp[] memory ops)
    {
        ops = new ILoopRegistry.BatchOp[](26);
        uint256 i;
        bytes32 market = config.market.id;
        LoopV1Types.MorphoMarketParams memory params = LoopV1Types.MorphoMarketParams({
            loanToken: config.market.loanToken,
            collateralToken: config.market.collateralToken,
            oracle: config.market.oracle,
            irm: config.market.irm,
            lltv: config.market.lltv
        });

        ops[i++] = _op(OP_SET_MORPHO, abi.encode(config.market.morpho));
        ops[i++] = _op(OP_SET_MARKET_PARAMS, abi.encode(market, params));
        ops[i++] = _op(OP_SET_SUPPORTED_MARKET, abi.encode(market, true));
        ops[i++] = _op(OP_SET_LOOP_AUTHORIZATION, abi.encode(deployed.authorization));
        ops[i++] = _op(OP_SET_LOOP_FORCE_EXIT_AUTHORIZER, abi.encode(deployed.forceExitAuthorizer));
        ops[i++] = _op(OP_SET_EXECUTOR_FOR, abi.encode(uint8(LoopV1Types.PrimaryType.OPEN), deployed.executorV2));
        ops[i++] = _op(OP_SET_EXECUTOR_FOR, abi.encode(uint8(LoopV1Types.PrimaryType.REBALANCE), deployed.executorV2));
        ops[i++] = _op(OP_SET_EXECUTOR_FOR, abi.encode(uint8(LoopV1Types.PrimaryType.EXIT), deployed.executorV2));
        ops[i++] =
            _op(OP_SET_EXECUTOR_FOR, abi.encode(uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC), deployed.executorV2));
        ops[i++] =
            _op(OP_SET_EXECUTOR_FOR, abi.encode(uint8(LoopV1Types.PrimaryType.FORCE_EXIT), deployed.forceExitExecutor));
        ops[i++] =
            _op(OP_SET_CANONICAL_SOURCE, abi.encode(market, LoopV1Types.SOURCE_MORPHO_POSITION, config.market.morpho));
        ops[i++] =
            _op(OP_SET_CANONICAL_SOURCE, abi.encode(market, LoopV1Types.SOURCE_VAULT_NAV, config.market.wstDiemVault));
        ops[i++] = _op(
            OP_SET_CANONICAL_SOURCE, abi.encode(market, LoopV1Types.SOURCE_CHAINLINK_FEED, config.market.chainlinkFeed)
        );
        ops[i++] =
            _op(OP_SET_CANONICAL_SOURCE, abi.encode(market, LoopV1Types.SOURCE_CURVE_QUOTE, config.market.curvePool));
        ops[i++] = _op(
            OP_SET_CANONICAL_SOURCE,
            abi.encode(market, LoopV1Types.SOURCE_SEQUENCER_UPTIME, config.market.sequencerFeed)
        );
        ops[i++] = _op(
            OP_SET_CANONICAL_SOURCE, abi.encode(market, LoopV1Types.SOURCE_HARVEST_EVENT, config.market.wstDiemVault)
        );
        ops[i++] = _op(
            OP_SET_CANONICAL_SOURCE,
            abi.encode(market, LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT, config.market.uniswapV3FlashPool)
        );
        ops[i++] = _op(OP_SET_CURVE_POOL, abi.encode(market, config.market.curvePool));
        ops[i++] = _op(OP_SET_WSTDIEM_VAULT, abi.encode(market, config.market.wstDiemVault));
        ops[i++] = _op(OP_SET_UNISWAP_V3_FACTORY, abi.encode(market, config.market.uniswapV3Factory));
        ops[i++] = _op(OP_SET_UNISWAP_V3_FLASH_POOL, abi.encode(market, config.market.uniswapV3FlashPool));
        ops[i++] = _op(OP_SET_UNISWAP_V3_FLASH_FEE_TIER, abi.encode(market, config.market.uniswapV3FlashFeeTier));
        ops[i++] = _op(OP_SET_FORCE_EXIT_BUFFER_BPS, abi.encode(uint256(0)));
        ops[i++] = _opSpender(uint8(LoopV1Types.PrimaryType.OPEN), config.market.loanToken, config.market.morpho);
        ops[i++] = _opSpender(
            uint8(LoopV1Types.PrimaryType.REBALANCE), config.market.collateralToken, config.market.curvePool
        );
        ops[i++] = _opSpender(uint8(LoopV1Types.PrimaryType.OPEN), config.market.loanToken, config.market.wstDiemVault);
    }

    function _op(uint8 code, bytes memory data) private pure returns (ILoopRegistry.BatchOp memory) {
        return ILoopRegistry.BatchOp({op: code, data: data});
    }

    function _opSpender(uint8 primaryType, address token, address spender)
        private
        pure
        returns (ILoopRegistry.BatchOp memory)
    {
        ILoopRegistry.SpenderCheck memory check = ILoopRegistry.SpenderCheck({
            spender: spender,
            runtimeCodeHash: bytes32(0),
            proxyKind: 0,
            implSelector: bytes4(0),
            expectedImpl: address(0)
        });
        return _op(OP_SET_ALLOWED_SPENDER, abi.encode(primaryType, token, spender, check));
    }
}
