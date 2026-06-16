// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
import {LoopV1EIP712} from "./LoopV1EIP712.sol";
import {LoopV1Errors} from "./LoopV1Errors.sol";
import {LoopV1Types} from "./LoopV1Types.sol";

library LoopV1ActionValidation {
    function validateIdentity(
        ILoopRegistry registry,
        LoopV1EIP712.ActionIdentity calldata identity,
        uint8 primaryType,
        address verifyingContract
    ) public view {
        if (identity.chainId != block.chainid) revert LoopV1Errors.WrongChain();
        if (identity.verifyingContract != verifyingContract) revert LoopV1Errors.InvalidSignature();
        if (identity.executor != registry.executorFor(primaryType)) revert LoopV1Errors.ExecutorMismatch();
        if (identity.registryVersion != registry.registryVersion()) revert LoopV1Errors.RegistryVersionMismatch();
        if (identity.registryMerkleRoot != registry.registryMerkleRoot()) {
            revert LoopV1Errors.RegistryMerkleRootMismatch();
        }
        if (!registry.supportedMarket(identity.market)) revert LoopV1Errors.MorphoParamsMismatch(4);
    }

    function validateFreshness(ILoopRegistry registry, LoopV1EIP712.Freshness calldata freshness, uint8 primaryType)
        public
        view
    {
        if (freshness.deadline > block.timestamp + registry.maxDigestDeadline(primaryType)) {
            revert LoopV1Errors.DeadlineExceedsBound();
        }
        if (block.timestamp > freshness.deadline) revert LoopV1Errors.DeadlineExceeded();
        if (block.number > freshness.quoteBlockNumber + freshness.maxQuoteAgeBlocks) revert LoopV1Errors.QuoteStale();
    }

    function validateMev(uint8 mevProtectionMode, uint8 mevWaiverBits) public pure {
        if (mevProtectionMode == uint8(LoopV1Types.MevProtectionMode.PUBLIC)) {
            if (mevWaiverBits & LoopV1Types.MEV_PUBLIC_MEMPOOL_OPT_IN == 0) {
                revert LoopV1Errors.MevWaiverMissing();
            }
        }
        if (mevProtectionMode == uint8(LoopV1Types.MevProtectionMode.SEQUENCER_DIRECT_FAILOPEN)) {
            if (mevWaiverBits & LoopV1Types.MEV_SEQUENCER_DIRECT_FALLBACK_OPT_IN == 0) {
                revert LoopV1Errors.MevWaiverMissing();
            }
        }
    }

    function validateExecutionKind(
        ILoopRegistry registry,
        address owner,
        uint8 executionKind,
        bytes32 market,
        address executionCaller,
        uint256 localLastSigned
    ) public view {
        if (executionKind == uint8(LoopV1Types.ExecutionKind.OWNER_DIRECT)) {
            if (executionCaller != owner) revert LoopV1Errors.ExecutionKindMismatch();
            return;
        }
        if (executionKind == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS)) {
            if (!registry.permissionlessCallerAllowed(executionCaller)) revert LoopV1Errors.CallerNotAllowed();
            return;
        }
        if (executionKind == uint8(LoopV1Types.ExecutionKind.OPERATOR_RECOVERY)) {
            if (!registry.operatorRecoveryRole(executionCaller)) revert LoopV1Errors.ExecutionKindMismatch();
            uint256 lastSigned = localLastSigned;
            if (lastSigned == 0) lastSigned = registry.ownerLastSignedActionBlock(owner);
            if (lastSigned == 0) revert LoopV1Errors.OperatorRecoveryActivityUnknown();
            bool inactive = block.number >= lastSigned + registry.operatorRecoveryNBlocks();
            bool nearLiquidation = registry.forceExitBufferBps() > 0
                && _liquidationDistanceBps(registry, owner, market) <= registry.forceExitBufferBps();
            if (!inactive && !nearLiquidation) revert LoopV1Errors.ExecutionKindMismatch();
            return;
        }
        revert LoopV1Errors.ExecutionKindMismatch();
    }

    function validateHarvest(ILoopRegistry registry, bytes32 market, uint8 primaryType, uint256 maxDebtIncrease)
        public
        view
    {
        if (primaryType == uint8(LoopV1Types.PrimaryType.FORCE_EXIT)) return;
        if (primaryType == uint8(LoopV1Types.PrimaryType.REBALANCE) && maxDebtIncrease == 0) return;
        if (
            primaryType != uint8(LoopV1Types.PrimaryType.OPEN)
                && primaryType != uint8(LoopV1Types.PrimaryType.REBALANCE)
        ) {
            return;
        }
        uint256 lastHarvest = registry.lastHarvestBlock(market);
        uint256 cooling = registry.harvestCoolingBlocks();
        if (lastHarvest != 0 && block.number <= lastHarvest + cooling) revert LoopV1Errors.HarvestConvergencePending();
    }

    function requireMarketParams(
        ILoopRegistry registry,
        bytes32 market,
        LoopV1Types.MorphoMarketParams calldata signedParams
    ) public view {
        if (!_paramsEqualCalldata(signedParams, registry.marketParams(market))) {
            revert LoopV1Errors.MorphoParamsMismatch(3);
        }
        if (keccak256(abi.encode(signedParams)) != market) revert LoopV1Errors.MorphoParamsMismatch(4);
    }

    function _paramsEqualCalldata(LoopV1Types.MorphoMarketParams calldata a, LoopV1Types.MorphoMarketParams memory b)
        private
        pure
        returns (bool)
    {
        return a.loanToken == b.loanToken && a.collateralToken == b.collateralToken && a.oracle == b.oracle
            && a.irm == b.irm && a.lltv == b.lltv;
    }

    function _liquidationDistanceBps(ILoopRegistry registry, address owner, bytes32 market)
        private
        view
        returns (uint16 distanceBps)
    {
        address adapter = registry.loopRiskOracleAdapter();
        if (adapter == address(0)) return type(uint16).max;
        (bool ok, bytes memory data) =
            adapter.staticcall(abi.encodeWithSignature("currentLiquidationDistanceBps(address,bytes32)", owner, market));
        if (!ok || data.length < 32) return type(uint16).max;
        return abi.decode(data, (uint16));
    }
}
