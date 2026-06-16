// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopRegistry} from "../../../../contracts/v2/LoopRegistry.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";

abstract contract RegistryBatchHelpers {
    uint8 internal constant OP_SET_MARKET_PARAMS = 1;
    uint8 internal constant OP_SET_CANONICAL_SOURCE = 2;
    uint8 internal constant OP_SET_REQUIRED_EVIDENCE_SOURCE_SET = 3;
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
    uint8 internal constant OP_APPLY_EXTERNAL_FINGERPRINT = 14;
    uint8 internal constant OP_SET_DUST_BPS = 15;
    uint8 internal constant OP_SET_DUST_ABSOLUTE_CAP = 16;
    uint8 internal constant OP_SET_DUST_FLOOR = 17;
    uint8 internal constant OP_SET_SUPPORTED_MARKET = 18;
    uint8 internal constant OP_SET_FORCE_EXIT_BUFFER_BPS = 19;

    function _commit(LoopRegistry registry, ILoopRegistry.BatchOp[] memory ops, bytes32 nextRoot) internal {
        registry.batchUpdate(ops, registry.registryVersion() + 1, nextRoot);
    }

    function _op(uint8 code, bytes memory data) internal pure returns (ILoopRegistry.BatchOp memory) {
        return ILoopRegistry.BatchOp({op: code, data: data});
    }

    function _opMarket(bytes32 market, LoopV1Types.MorphoMarketParams memory params)
        internal
        pure
        returns (ILoopRegistry.BatchOp memory)
    {
        return _op(OP_SET_MARKET_PARAMS, abi.encode(market, params));
    }

    function _opCanonical(bytes32 market, bytes32 sourceId, address sourceAddress)
        internal
        pure
        returns (ILoopRegistry.BatchOp memory)
    {
        return _op(OP_SET_CANONICAL_SOURCE, abi.encode(market, sourceId, sourceAddress));
    }

    function _opRequired(uint8 primaryType, bytes32[] memory sources)
        internal
        pure
        returns (ILoopRegistry.BatchOp memory)
    {
        return _op(OP_SET_REQUIRED_EVIDENCE_SOURCE_SET, abi.encode(primaryType, sources));
    }

    function _opExecutor(uint8 primaryType, address executor) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_EXECUTOR_FOR, abi.encode(primaryType, executor));
    }

    function _opLoopAuthorization(address authorization) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_LOOP_AUTHORIZATION, abi.encode(authorization));
    }

    function _opForceAuthorizer(address authorizer) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_LOOP_FORCE_EXIT_AUTHORIZER, abi.encode(authorizer));
    }

    function _opSpender(uint8 primaryType, address token, address spender, ILoopRegistry.SpenderCheck memory check)
        internal
        pure
        returns (ILoopRegistry.BatchOp memory)
    {
        return _op(OP_SET_ALLOWED_SPENDER, abi.encode(primaryType, token, spender, check));
    }

    function _opMorpho(address morpho) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_MORPHO, abi.encode(morpho));
    }

    function _opCurve(bytes32 market, address pool) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_CURVE_POOL, abi.encode(market, pool));
    }

    function _opFlashPool(bytes32 market, address pool) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_UNISWAP_V3_FLASH_POOL, abi.encode(market, pool));
    }

    function _opVault(bytes32 market, address vault) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_WSTDIEM_VAULT, abi.encode(market, vault));
    }

    function _opFactory(bytes32 market, address factory) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_UNISWAP_V3_FACTORY, abi.encode(market, factory));
    }

    function _opFeeTier(bytes32 market, uint24 feeTier) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_UNISWAP_V3_FLASH_FEE_TIER, abi.encode(market, feeTier));
    }

    function _opApplyFingerprint(bytes32 integrationId) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_APPLY_EXTERNAL_FINGERPRINT, abi.encode(integrationId));
    }

    function _opSupportedMarket(bytes32 market, bool supported) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_SUPPORTED_MARKET, abi.encode(market, supported));
    }

    function _opDustBps(uint16 nextBps) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_DUST_BPS, abi.encode(nextBps));
    }

    function _opDustAbsoluteCap(uint256 nextCap) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_DUST_ABSOLUTE_CAP, abi.encode(nextCap));
    }

    function _opDustFloor(uint256 nextFloor) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_DUST_FLOOR, abi.encode(nextFloor));
    }

    function _opForceExitBufferBps(uint16 nextBps) internal pure returns (ILoopRegistry.BatchOp memory) {
        return _op(OP_SET_FORCE_EXIT_BUFFER_BPS, abi.encode(uint256(nextBps)));
    }

    function _sortedOpenSources() internal pure returns (bytes32[] memory sources) {
        sources = new bytes32[](5);
        sources[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        sources[1] = LoopV1Types.SOURCE_VAULT_NAV;
        sources[2] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        sources[3] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        sources[4] = LoopV1Types.SOURCE_CHAINLINK_FEED;
    }
}
