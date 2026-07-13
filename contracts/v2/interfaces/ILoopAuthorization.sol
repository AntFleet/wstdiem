// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1EIP712} from "../libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice Phase 1 authorization and validation surface.
/// @dev PR-1 declares this ABI only; PR-2 implements policy, signature, and nonce logic.
interface ILoopAuthorization {
    function domainSeparator() external view returns (bytes32);

    function executeMorpho(bytes32 digest, bytes calldata sig, bytes calldata morphoCalldata)
        external
        returns (bytes memory morphoReturnData);

    function validateOpen(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Open calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);

    function validateRebalance(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Rebalance calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);

    function validateExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Exit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);

    function validateAutomationExec(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.AutomationExec calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);

    function validateForceExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.ForceExit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        address executionCaller,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);

    function validateRevoke(bytes32 digest, bytes calldata sig, LoopV1EIP712.Revoke calldata action)
        external
        view
        returns (LoopV1Types.ValidationResult memory);

    /// @notice NF-15 expanded attestation field list (PB1.1 patch after PR-2 build surfaced
    ///   the gap). Adds policyClass, maxCollateralSold, maxDebtIncrease, and deadline so the
    ///   preimage proof covers the full I-66 high-risk digest identity.
    function validateHighRiskPolicy(
        address owner,
        bytes32 digest,
        uint8 primaryType,
        uint8 executionKind,
        uint8 mevProtectionMode,
        uint8 mevWaiverBits,
        uint8 acknowledgedRisks,
        uint8 policyClass,
        bytes32 market,
        uint256 registryVersion,
        uint248 nonceSlot,
        uint8 nonceBit,
        uint256 maxCollateralSold,
        uint256 maxDebtIncrease,
        uint256 deadline,
        bytes32 eip1271PreimageDisplayProof
    ) external view returns (bool attested);

    function validateExternalConfig(bytes32 market, uint8 primaryType) external view returns (bool valid);

    /// @notice PB1.1 patch: createPolicy now carries executionKind + policyClass so PR-2 can
    ///   reject KEEPER_PERMISSIONLESS policies whose policyClass is not in
    ///   {REPAY_ONLY, DELEVERAGE_ONLY, FORCE_EXIT} per AC-17 / R2F-7 / PHASE-B-PR5-LOCKS Lock G.
    function createPolicy(
        address owner,
        uint8 primaryType,
        uint8 executionKind,
        uint8 policyClass,
        bytes32 policyHash,
        uint256 expiryBlock
    ) external returns (uint64 policyId);
    function updatePolicy(uint64 policyId, bytes32 newPolicyHash, uint256 newExpiryBlock) external;
    function revoke(uint64 policyId) external;
    /// @notice Signed Revoke digest entrypoint (no Morpho executor — auth-direct).
    function executeRevoke(bytes32 digest, bytes calldata sig, LoopV1EIP712.Revoke calldata action) external;
    function cancelNonce(uint8 primaryType, uint248 nonceSlot, uint8 nonceBit) external;
    function nonceBitmap(address owner, uint64 policyId, uint8 primaryType, uint248 nonceSlot)
        external
        view
        returns (uint256 word);
    function policyHash(address owner, uint64 policyId) external view returns (bytes32);
    function policyRevocationBlock(address owner, uint64 policyId) external view returns (uint64);
    function acceptsThirdPartyRepay(address owner, uint64 policyId) external view returns (bool);
}
