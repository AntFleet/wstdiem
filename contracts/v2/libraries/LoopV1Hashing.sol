// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1EIP712} from "./LoopV1EIP712.sol";
import {LoopV1Types} from "./LoopV1Types.sol";

/// @notice Linked EIP-712 hashing helpers for Phase 1 action structs.
/// @dev Kept out of LoopAuthorization runtime to stay below EIP-170 while preserving PR-1 typehashes.
library LoopV1Hashing {
    function hashOpen(LoopV1EIP712.Open calldata action, bytes32 domainSeparator) public pure returns (bytes32) {
        return _toTyped(
            domainSeparator,
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

    function hashRebalance(LoopV1EIP712.Rebalance calldata action, bytes32 domainSeparator)
        public
        pure
        returns (bytes32)
    {
        return _toTyped(
            domainSeparator,
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

    function hashExit(LoopV1EIP712.Exit calldata action, bytes32 domainSeparator) public pure returns (bytes32) {
        return _toTyped(
            domainSeparator,
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

    function hashForceExit(LoopV1EIP712.ForceExit calldata action, bytes32 domainSeparator)
        public
        pure
        returns (bytes32)
    {
        return _toTyped(
            domainSeparator,
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

    function hashAutomationExec(LoopV1EIP712.AutomationExec calldata action, bytes32 domainSeparator)
        public
        pure
        returns (bytes32)
    {
        return _toTyped(
            domainSeparator,
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

    function hashRevoke(LoopV1EIP712.Revoke calldata action, bytes32 domainSeparator) public pure returns (bytes32) {
        return _toTyped(
            domainSeparator,
            keccak256(
                abi.encode(
                    LoopV1EIP712.REVOKE_TYPEHASH,
                    _hashIdentity(action.identity),
                    _hashFreshness(action.freshness),
                    action.executionKind,
                    _hashRevokeBounds(action.bounds),
                    _hashDigestHashes(action.hashes)
                )
            )
        );
    }

    function hashEvidence(LoopV1Types.ActionEvidence calldata evidence) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
                evidence.actionId,
                evidence.evidenceSetId,
                evidence.owner,
                evidence.market,
                evidence.blockNumber,
                evidence.stateBitmap,
                keccak256(abi.encode(evidence.sources))
            )
        );
    }

    function _toTyped(bytes32 domainSeparator, bytes32 structHash) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _hashIdentity(LoopV1EIP712.ActionIdentity calldata identity) private pure returns (bytes32) {
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

    function _hashFreshness(LoopV1EIP712.Freshness calldata freshness) private pure returns (bytes32) {
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

    function _hashFeeCaps(LoopV1Types.FeeCaps calldata caps) private pure returns (bytes32) {
        return keccak256(
            abi.encode(LoopV1EIP712.FEE_CAPS_TYPEHASH, caps.flashFeeCap, caps.protocolFeeCap, caps.automationFeeCap)
        );
    }

    function _hashDigestHashes(LoopV1EIP712.DigestHashes calldata hashes) private pure returns (bytes32) {
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

    function _hashMarketParams(LoopV1Types.MorphoMarketParams calldata params) private pure returns (bytes32) {
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

    function _hashOpenBounds(LoopV1EIP712.OpenBounds calldata bounds) private pure returns (bytes32) {
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

    function _hashRebalanceBounds(LoopV1EIP712.RebalanceBounds calldata bounds) private pure returns (bytes32) {
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

    function _hashExitBounds(LoopV1EIP712.ExitBounds calldata bounds) private pure returns (bytes32) {
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

    function _hashForceExitBounds(LoopV1EIP712.ForceExitBounds calldata bounds) private pure returns (bytes32) {
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

    function _hashRevokeBounds(LoopV1EIP712.RevokeBounds calldata bounds) private pure returns (bytes32) {
        return keccak256(
            abi.encode(LoopV1EIP712.REVOKE_BOUNDS_TYPEHASH, bounds.policyId, bounds.policyClass, bounds.effectiveBlock)
        );
    }

    function _hashAutomationBounds(LoopV1EIP712.AutomationBounds calldata bounds) private pure returns (bytes32) {
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
