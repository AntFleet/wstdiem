// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopForceExitAuthorizer} from "./interfaces/ILoopForceExitAuthorizer.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {LoopV1EIP712} from "./libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Hashing} from "./libraries/LoopV1Hashing.sol";
import {LoopV1HighRisk} from "./libraries/LoopV1HighRisk.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";
import {LoopV1Validation} from "./libraries/LoopV1Validation.sol";
import {SignatureCheckerLib} from "./libraries/SignatureCheckerLib.sol";

/// @notice Distinct EIP-712 verifier for one-shot Phase 1 ForceExit authorizations.
/// @dev PROTOCOL.md §6.3 AC-1 and THREAT-MODEL I-67. This contract validates the decision;
///   Morpho routing remains exclusively in LoopAuthorization.
contract LoopForceExitAuthorizer is ILoopForceExitAuthorizer {
    using SignatureCheckerLib for address;

    string public constant EIP712_NAME = "WSTDIEM ForceExit";
    string public constant EIP712_VERSION = "1";
    uint8 internal constant POLICY_FORCE_EXIT = 5;

    ILoopRegistry public immutable registry;
    bytes32 public immutable domainSeparator;

    /// @notice Deploys a distinct force-exit verifying contract.
    /// @dev The domain separator intentionally differs from LoopAuthorization.
    constructor(ILoopRegistry registry_) {
        registry = registry_;
        domainSeparator = keccak256(
            abi.encode(
                LoopV1EIP712.DOMAIN_SEPARATOR_TYPEHASH,
                keccak256(bytes(EIP712_NAME)),
                keccak256(bytes(EIP712_VERSION)),
                block.chainid,
                address(this),
                bytes32(0)
            )
        );
    }

    /// @notice Validates a one-shot ForceExit digest.
    /// @dev Enforces PROTOCOL.md §6.3 Phase 1 limits: policyId==0, 24h deadline cap, waiver minimality.
    function validateForceExitDigest(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.ForceExit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external view returns (LoopV1Types.ValidationResult memory) {
        if (action.identity.chainId != block.chainid) {
            revert LoopV1Errors.WrongChain();
        }
        if (action.identity.verifyingContract != address(this)) revert LoopV1Errors.InvalidSignature();
        if (action.identity.executor != registry.executorFor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT))) {
            revert LoopV1Errors.ExecutorMismatch();
        }
        if (action.identity.registryVersion != registry.registryVersion()) {
            revert LoopV1Errors.RegistryVersionMismatch();
        }
        if (action.identity.registryMerkleRoot != registry.registryMerkleRoot()) {
            revert LoopV1Errors.RegistryMerkleRootMismatch();
        }
        if (action.identity.policyId != 0) revert LoopV1Errors.ForceExitPolicyNotAllowedInPhase1();
        if (block.timestamp > action.freshness.deadline) revert LoopV1Errors.DeadlineExceeded();
        if (action.freshness.deadline > block.timestamp + registry.forceExitMaxDeadlineSeconds()) {
            revert LoopV1Errors.ForceExitDeadlineExceedsBound();
        }
        if (!registry.validateExternalConfig(action.identity.market, uint8(LoopV1Types.PrimaryType.FORCE_EXIT))) {
            revert LoopV1Errors.ConfigIntegrityFailure();
        }
        _validateWaiverMinimality(action.bounds.acknowledgedRisks);
        LoopV1Validation.validateEvidence(
            registry,
            evidence,
            action.identity,
            uint8(LoopV1Types.PrimaryType.FORCE_EXIT),
            action.hashes.evidenceBundleHash
        );
        _requireMarketParams(action.identity.market, action.marketParams);
        if (LoopV1Hashing.hashForceExit(action, domainSeparator) != digest) revert LoopV1Errors.DigestTypeMismatch();
        if (!action.identity.owner.isValidSignatureNow(digest, sig)) revert LoopV1Errors.InvalidSignature();
        if (!validateHighRiskPolicy(
                action.identity.owner,
                digest,
                uint8(LoopV1Types.PrimaryType.FORCE_EXIT),
                uint8(action.executionKind),
                uint8(action.mevProtectionMode),
                action.mevWaiverBits,
                action.bounds.acknowledgedRisks,
                action.identity.market,
                action.identity.registryVersion,
                action.identity.nonceSlot,
                action.identity.nonceBit,
                eip1271PreimageDisplayProof
            )) {
            revert LoopV1Errors.Eip1271PreimageNotAttested();
        }
        return LoopV1Types.ValidationResult(
            action.identity.owner,
            action.identity.market,
            action.identity.policyId,
            uint8(LoopV1Types.PrimaryType.FORCE_EXIT),
            evidence.stateBitmap,
            true
        );
    }

    /// @notice Validates ForceExit EIP-1271 preimage display attestation.
    /// @dev Interface keeps the PR-1 shorter argument list; policyClass/max fields are ForceExit constants here.
    function validateHighRiskPolicy(
        address owner,
        bytes32 digest,
        uint8 primaryType,
        uint8 executionKind,
        uint8 mevProtectionMode,
        uint8 mevWaiverBits,
        uint8 acknowledgedRisks,
        bytes32 market,
        uint256 registryVersion,
        uint248 nonceSlot,
        uint8 nonceBit,
        bytes32 eip1271PreimageDisplayProof
    ) public view returns (bool attested) {
        digest;
        return LoopV1HighRisk.attested(
            registry,
            LoopV1HighRisk.Params(
                owner,
                primaryType,
                executionKind,
                mevProtectionMode,
                mevWaiverBits,
                acknowledgedRisks,
                POLICY_FORCE_EXIT,
                market,
                registryVersion,
                nonceSlot,
                nonceBit,
                0,
                0,
                0,
                eip1271PreimageDisplayProof,
                address(this)
            )
        );
    }

    function _validateWaiverMinimality(uint8 acknowledgedRisks) private pure {
        uint8 critical = acknowledgedRisks & LoopV1Types.RISK_CRITICAL_OVERRIDE_MASK;
        if (critical != 0 && critical & (critical - 1) != 0) revert LoopV1Errors.ForceExitWaiverOverbroad();
    }

    function _requireMarketParams(bytes32 market, LoopV1Types.MorphoMarketParams calldata signedParams) private view {
        LoopV1Types.MorphoMarketParams memory canonical = registry.marketParams(market);
        if (
            signedParams.loanToken != canonical.loanToken || signedParams.collateralToken != canonical.collateralToken
                || signedParams.oracle != canonical.oracle || signedParams.irm != canonical.irm
                || signedParams.lltv != canonical.lltv
        ) {
            revert LoopV1Errors.MorphoParamsMismatch(3);
        }
        if (keccak256(abi.encode(signedParams)) != market) revert LoopV1Errors.MorphoParamsMismatch(4);
    }
}
