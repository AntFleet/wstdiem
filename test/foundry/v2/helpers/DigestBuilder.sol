// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopAuthorization} from "../../../../contracts/v2/LoopAuthorization.sol";
import {LoopForceExitAuthorizer} from "../../../../contracts/v2/LoopForceExitAuthorizer.sol";
import {LoopV1EIP712} from "../../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";

library DigestBuilder {
    function openDigest(LoopAuthorization auth, LoopV1EIP712.Open memory action) internal view returns (bytes32) {
        return _toTyped(
            auth.domainSeparator(),
            keccak256(
                abi.encode(
                    LoopV1EIP712.OPEN_TYPEHASH,
                    _hashIdentity(action.identity),
                    _hashFreshness(action.freshness),
                    action.executionKind,
                    action.mevProtectionMode,
                    action.mevWaiverBits,
                    _hashMarketParams(action.marketParams),
                    _hashOpenBounds(action.bounds),
                    _hashDigestHashes(action.hashes)
                )
            )
        );
    }

    function exitDigest(LoopAuthorization auth, LoopV1EIP712.Exit memory action) internal view returns (bytes32) {
        return _toTyped(
            auth.domainSeparator(),
            keccak256(
                abi.encode(
                    LoopV1EIP712.EXIT_TYPEHASH,
                    _hashIdentity(action.identity),
                    _hashFreshness(action.freshness),
                    action.executionKind,
                    action.mevProtectionMode,
                    action.mevWaiverBits,
                    _hashMarketParams(action.marketParams),
                    _hashExitBounds(action.bounds),
                    _hashDigestHashes(action.hashes)
                )
            )
        );
    }

    function rebalanceDigest(LoopAuthorization auth, LoopV1EIP712.Rebalance memory action)
        internal
        view
        returns (bytes32)
    {
        return _toTyped(
            auth.domainSeparator(),
            keccak256(
                abi.encode(
                    LoopV1EIP712.REBALANCE_TYPEHASH,
                    _hashIdentity(action.identity),
                    _hashFreshness(action.freshness),
                    action.executionKind,
                    action.mevProtectionMode,
                    action.mevWaiverBits,
                    _hashMarketParams(action.marketParams),
                    _hashRebalanceBounds(action.bounds),
                    _hashDigestHashes(action.hashes)
                )
            )
        );
    }

    function forceExitDigest(LoopForceExitAuthorizer authorizer, LoopV1EIP712.ForceExit memory action)
        internal
        view
        returns (bytes32)
    {
        return _toTyped(
            authorizer.domainSeparator(),
            keccak256(
                abi.encode(
                    LoopV1EIP712.FORCE_EXIT_TYPEHASH,
                    _hashIdentity(action.identity),
                    _hashFreshness(action.freshness),
                    action.executionKind,
                    action.mevProtectionMode,
                    action.mevWaiverBits,
                    _hashMarketParams(action.marketParams),
                    _hashForceExitBounds(action.bounds),
                    _hashDigestHashes(action.hashes)
                )
            )
        );
    }

    function automationDigest(LoopAuthorization auth, LoopV1EIP712.AutomationExec memory action)
        internal
        view
        returns (bytes32)
    {
        return _toTyped(
            auth.domainSeparator(),
            keccak256(
                abi.encode(
                    LoopV1EIP712.AUTOMATION_EXEC_TYPEHASH,
                    _hashIdentity(action.identity),
                    _hashFreshness(action.freshness),
                    action.executionKind,
                    action.mevProtectionMode,
                    action.mevWaiverBits,
                    _hashAutomationBounds(action.bounds),
                    _hashDigestHashes(action.hashes)
                )
            )
        );
    }

    function _toTyped(bytes32 domainSeparator, bytes32 structHash) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _hashIdentity(LoopV1EIP712.ActionIdentity memory identity) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.ACTION_IDENTITY_TYPEHASH,
                identity.owner,
                identity.chainId,
                identity.verifyingContract,
                identity.market,
                identity.executor,
                identity.registryVersion,
                identity.registryMerkleRoot,
                identity.policyId,
                identity.nonceSlot,
                identity.nonceBit
            )
        );
    }

    function _hashFreshness(LoopV1EIP712.Freshness memory freshness) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.FRESHNESS_TYPEHASH,
                freshness.deadline,
                freshness.quoteBlockNumber,
                freshness.maxQuoteAgeBlocks,
                freshness.maxQuoteDeviationBps
            )
        );
    }

    function _hashFeeCaps(LoopV1Types.FeeCaps memory caps) private pure returns (bytes32) {
        return keccak256(
            abi.encode(LoopV1EIP712.FEE_CAPS_TYPEHASH, caps.flashFeeCap, caps.protocolFeeCap, caps.automationFeeCap)
        );
    }

    function _hashDigestHashes(LoopV1EIP712.DigestHashes memory hashes) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.DIGEST_HASHES_TYPEHASH,
                hashes.quoteHash,
                hashes.spenderListHash,
                hashes.allowanceScheduleHash,
                hashes.feeCapHash,
                hashes.evidenceBundleHash
            )
        );
    }

    function _hashMarketParams(LoopV1Types.MorphoMarketParams memory params) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.MORPHO_MARKET_PARAMS_TYPEHASH,
                params.loanToken,
                params.collateralToken,
                params.oracle,
                params.irm,
                params.lltv
            )
        );
    }

    function _hashOpenBounds(LoopV1EIP712.OpenBounds memory bounds) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.OPEN_BOUNDS_TYPEHASH,
                bounds.minWstDiemReceived,
                bounds.minBorrowedDiem,
                bounds.maxBorrowedDiem,
                bounds.maxSlippageBps,
                bounds.maxPriceImpactBps,
                bounds.maxLeverageBps,
                bounds.minHealthFactor,
                bounds.minLiquidationDistanceBps,
                bounds.maxMorphoUtilizationImpactBps,
                _hashFeeCaps(bounds.feeCaps)
            )
        );
    }

    function _hashExitBounds(LoopV1EIP712.ExitBounds memory bounds) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.EXIT_BOUNDS_TYPEHASH,
                bounds.minRepayment,
                bounds.maxCollateralSold,
                bounds.maxSlippageBps,
                bounds.maxCurvePositionShareBps,
                bounds.maxMorphoUtilizationImpactBps,
                _hashFeeCaps(bounds.feeCaps),
                bounds.repayOnly,
                bounds.acceptsThirdPartyRepay
            )
        );
    }

    function _hashRebalanceBounds(LoopV1EIP712.RebalanceBounds memory bounds) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.REBALANCE_BOUNDS_TYPEHASH,
                bounds.targetLeverageBps,
                bounds.targetLeverageToleranceBps,
                bounds.minPostHealthFactor,
                bounds.minLiquidationDistanceBps,
                bounds.maxDebtIncrease,
                bounds.maxCollateralSold,
                bounds.maxSlippageBps,
                bounds.maxCurvePositionShareBps,
                bounds.maxMorphoUtilizationImpactBps,
                _hashFeeCaps(bounds.feeCaps)
            )
        );
    }

    function _hashForceExitBounds(LoopV1EIP712.ForceExitBounds memory bounds) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.FORCE_EXIT_BOUNDS_TYPEHASH,
                bounds.minRepayment,
                bounds.maxCollateralSold,
                bounds.looseSlippageBps,
                bounds.looseFlashFeeCap,
                bounds.maxCurvePositionShareBps,
                bounds.acknowledgedRisks
            )
        );
    }

    function _hashAutomationBounds(LoopV1EIP712.AutomationBounds memory bounds) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.AUTOMATION_BOUNDS_TYPEHASH,
                bounds.triggerConditionHash,
                bounds.underlyingPrimaryType,
                bounds.underlyingActionHash,
                bounds.policyHash,
                bounds.boundSubsetHash,
                bounds.notBeforeBlock,
                bounds.notAfterBlock
            )
        );
    }
}
