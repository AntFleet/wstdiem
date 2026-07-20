// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopAuthorization} from "./interfaces/ILoopAuthorization.sol";
import {ILoopForceExitAuthorizer} from "./interfaces/ILoopForceExitAuthorizer.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {ILoopV1Events} from "./interfaces/ILoopV1Events.sol";
import {LoopV1ActionContext} from "./libraries/LoopV1ActionContext.sol";
import {LoopV1ActionValidation} from "./libraries/LoopV1ActionValidation.sol";
import {LoopV1EIP712} from "./libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Hashing} from "./libraries/LoopV1Hashing.sol";
import {LoopV1HighRisk} from "./libraries/LoopV1HighRisk.sol";
import {LoopV1MorphoValidation} from "./libraries/LoopV1MorphoValidation.sol";
import {LoopV1TokenApproval} from "./libraries/LoopV1TokenApproval.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";
import {LoopV1Validation} from "./libraries/LoopV1Validation.sol";
import {MorphoSelectors} from "./libraries/MorphoSelectors.sol";
import {SignatureCheckerLib} from "./libraries/SignatureCheckerLib.sol";

/// @notice Central Phase 1 authorization router for WSTDIEM Morpho operations.
/// @dev Implements PROTOCOL.md §6.4, the SDK type definitions §A6, THREAT-MODEL I-01..I-12 and I-51..I-72.
contract LoopAuthorization is ILoopAuthorization, ILoopV1Events {
    using SignatureCheckerLib for address;

    error OwnableUnauthorizedAccount(address account);

    string public constant EIP712_NAME = "WSTDIEM Loop";
    string public constant EIP712_VERSION = "1";
    uint8 internal constant POLICY_REPAY_ONLY = 3;
    uint8 internal constant POLICY_DELEVERAGE_ONLY = 4;
    uint8 internal constant POLICY_FORCE_EXIT = 5;

    ILoopRegistry public immutable registry;
    bytes32 public immutable domainSeparator;

    struct Policy {
        address owner;
        uint8 primaryType;
        uint8 executionKind;
        uint8 policyClass;
        bytes32 hash;
        uint64 revocationBlock;
        uint256 expiryBlock;
        uint256 minRepay;
        uint256 maxCollateralSold;
        uint256 maxDebtIncrease;
    }

    mapping(address owner => uint64 nextPolicyId) private nextPolicyIds;
    mapping(address owner => mapping(uint64 policyId => Policy policy)) private policies;
    mapping(
        address owner
            => mapping(uint64 policyId => mapping(uint8 primaryType => mapping(uint248 nonceSlot => uint256 word)))
    ) private nonceWords;
    mapping(address owner => uint256 blockNumber) public ownerLastSignedActionBlock;

    /// @notice Deploys the authorization router against a PR-1 registry.
    /// @dev PROTOCOL.md §5.1 pins registry-owned executor, Morpho, and evidence configuration.
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

    /// @notice Validates and forwards one allowed Morpho Blue call.
    /// @dev the SDK type definitions §A6 and THREAT-MODEL I-51/I-52/I-53/I-54.
    function executeMorpho(bytes32 digest, bytes calldata sig, bytes calldata morphoCalldata)
        external
        returns (bytes memory morphoReturnData)
    {
        _enterReentryGuard();
        bytes32 contextDigest = _tload(LoopV1ActionContext.CONTEXT_DIGEST_SLOT);
        if (contextDigest == bytes32(0)) revert LoopV1Errors.ActionContextMissing();
        if (contextDigest != digest) revert LoopV1Errors.ActionContextDigestMismatch();

        sig;

        LoopV1MorphoValidation.Context memory morphoContext = LoopV1ActionContext.morphoContext();
        address owner = morphoContext.owner;
        uint8 primaryType = morphoContext.primaryType;
        if (msg.sender != morphoContext.executor) {
            revert LoopV1Errors.ExecutorMismatch();
        }

        (bytes4 selector, address tokenIn, uint256 tokenAmount) =
            LoopV1MorphoValidation.validate(registry, morphoCalldata, morphoContext);

        address morpho = registry.morpho();
        bool terminal = selector == morphoContext.terminalSelector;
        uint256 stepIndex = morphoContext.step;
        emit LoopActionStep(
            owner, morphoContext.market, digest, uint8(stepIndex), primaryType, morpho, selector, terminal
        );
        if (terminal) {
            // NF-8 activity records only terminal Morpho actions. If the terminal call reverts,
            // the nonce/activity writes revert too; Revoke has no Morpho terminal and remains
            // recoverable by the existing activity-absence predicate without extra bytecode.
            _consumeTerminalNonce(owner, primaryType);
        } else {
            _tstore(LoopV1ActionContext.CONTEXT_STEP_SLOT, bytes32(morphoContext.step + 1));
        }

        if (tokenIn != address(0) && tokenAmount != 0) {
            _requireAllowedSpender(primaryType, tokenIn, morpho);
            LoopV1TokenApproval.approve(tokenIn, morpho, tokenAmount);
        }
        (bool ok, bytes memory data) = morpho.call(morphoCalldata);
        if (tokenIn != address(0)) LoopV1TokenApproval.approve(tokenIn, morpho, 0);
        if (!ok) {
            _exitReentryGuard();
            assembly {
                revert(add(data, 0x20), mload(data))
            }
        }
        if (terminal) {
            LoopV1ActionContext.clearContext();
        }
        _exitReentryGuard();
        return data;
    }

    /// @notice Validates an Open digest and arms the Open Morpho sequence.
    /// @dev PROTOCOL.md §6.1/§6.4, A6.4 Open row, THREAT-MODEL I-01..I-12.
    function validateOpen(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Open calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory) {
        _validateCommon(
            digest,
            sig,
            action.identity,
            action.freshness,
            uint8(LoopV1Types.PrimaryType.OPEN),
            uint8(action.executionKind),
            uint8(action.mevProtectionMode),
            action.mevWaiverBits,
            evidence,
            LoopV1Hashing.hashOpen(action, domainSeparator),
            uint8(LoopV1Types.PrimaryType.OPEN),
            action.hashes.evidenceBundleHash,
            msg.sender
        );
        LoopV1ActionValidation.requireMarketParams(registry, action.identity.market, action.marketParams);
        LoopV1ActionValidation.validateLiveStateBitmap(
            registry, action.identity.market, action.identity.owner, uint8(LoopV1Types.PrimaryType.OPEN), 1, 0
        );
        _requireHighRisk(
            action.identity.owner,
            digest,
            uint8(LoopV1Types.PrimaryType.OPEN),
            uint8(action.executionKind),
            uint8(action.mevProtectionMode),
            action.mevWaiverBits,
            0,
            uint8(LoopV1Types.PrimaryType.OPEN),
            action.identity,
            0,
            0,
            action.freshness.deadline,
            eip1271PreimageDisplayProof
        );
        LoopV1ActionContext.armContext(
            digest,
            action.identity,
            uint8(LoopV1Types.PrimaryType.OPEN),
            uint8(LoopV1Types.PrimaryType.OPEN),
            MorphoSelectors.BORROW,
            action.bounds.minBorrowedDiem,
            action.bounds.maxBorrowedDiem,
            0,
            0,
            0
        );
        return _result(action.identity, uint8(LoopV1Types.PrimaryType.OPEN), evidence.stateBitmap, true);
    }

    /// @notice Validates a Rebalance digest and arms the bounds-derived Morpho sequence.
    /// @dev PB1.5 §A6.4 derives mode from maxDebtIncrease/maxCollateralSold without a typehash change.
    function validateRebalance(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Rebalance calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory) {
        bool debtIncrease = action.bounds.maxDebtIncrease > 0;
        bool collateralSold = action.bounds.maxCollateralSold > 0;
        if (debtIncrease && collateralSold) revert LoopV1Errors.RebalanceModeAmbiguous();
        bool highRisk = debtIncrease;
        _validateCommon(
            digest,
            sig,
            action.identity,
            action.freshness,
            uint8(LoopV1Types.PrimaryType.REBALANCE),
            uint8(action.executionKind),
            uint8(action.mevProtectionMode),
            action.mevWaiverBits,
            evidence,
            LoopV1Hashing.hashRebalance(action, domainSeparator),
            uint8(LoopV1Types.PrimaryType.REBALANCE),
            action.hashes.evidenceBundleHash,
            msg.sender
        );
        LoopV1ActionValidation.requireMarketParams(registry, action.identity.market, action.marketParams);
        LoopV1ActionValidation.validateHarvest(
            registry, action.identity.market, uint8(LoopV1Types.PrimaryType.REBALANCE), action.bounds.maxDebtIncrease
        );
        LoopV1ActionValidation.validateLiveStateBitmap(
            registry,
            action.identity.market,
            action.identity.owner,
            uint8(LoopV1Types.PrimaryType.REBALANCE),
            action.bounds.maxDebtIncrease,
            0
        );
        if (highRisk) {
            _requireHighRisk(
                action.identity.owner,
                digest,
                uint8(LoopV1Types.PrimaryType.REBALANCE),
                uint8(action.executionKind),
                uint8(action.mevProtectionMode),
                action.mevWaiverBits,
                0,
                uint8(LoopV1Types.PrimaryType.REBALANCE),
                action.identity,
                action.bounds.maxCollateralSold,
                action.bounds.maxDebtIncrease,
                action.freshness.deadline,
                eip1271PreimageDisplayProof
            );
        }
        bytes4 terminal = debtIncrease
            ? MorphoSelectors.BORROW
            : (collateralSold ? MorphoSelectors.WITHDRAW_COLLATERAL : MorphoSelectors.REPAY);
        LoopV1ActionContext.armContext(
            digest,
            action.identity,
            uint8(LoopV1Types.PrimaryType.REBALANCE),
            uint8(LoopV1Types.PrimaryType.REBALANCE),
            terminal,
            0,
            0,
            0,
            action.bounds.maxCollateralSold,
            action.bounds.maxDebtIncrease
        );
        return _result(action.identity, uint8(LoopV1Types.PrimaryType.REBALANCE), evidence.stateBitmap, highRisk);
    }

    /// @notice Validates an Exit digest and arms repay or repay-withdraw Morpho sequence.
    /// @dev PROTOCOL.md §6.3/§6.4, the SDK type definitions §A6.4 Exit rows.
    function validateExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Exit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory) {
        eip1271PreimageDisplayProof;
        if (action.bounds.acceptsThirdPartyRepay) revert LoopV1Errors.ThirdPartyRepayNotAccepted();
        _validateCommon(
            digest,
            sig,
            action.identity,
            action.freshness,
            uint8(LoopV1Types.PrimaryType.EXIT),
            uint8(action.executionKind),
            uint8(action.mevProtectionMode),
            action.mevWaiverBits,
            evidence,
            LoopV1Hashing.hashExit(action, domainSeparator),
            action.bounds.repayOnly ? POLICY_REPAY_ONLY : uint8(LoopV1Types.PrimaryType.EXIT),
            action.hashes.evidenceBundleHash,
            msg.sender
        );
        LoopV1ActionValidation.requireMarketParams(registry, action.identity.market, action.marketParams);
        LoopV1ActionContext.armContext(
            digest,
            action.identity,
            uint8(LoopV1Types.PrimaryType.EXIT),
            action.bounds.repayOnly ? POLICY_REPAY_ONLY : uint8(LoopV1Types.PrimaryType.EXIT),
            action.bounds.repayOnly ? MorphoSelectors.REPAY : MorphoSelectors.WITHDRAW_COLLATERAL,
            0,
            0,
            action.bounds.minRepayment,
            action.bounds.repayOnly ? 0 : action.bounds.maxCollateralSold,
            0
        );
        return _result(action.identity, uint8(LoopV1Types.PrimaryType.EXIT), evidence.stateBitmap, false);
    }

    /// @notice Validates an AutomationExec digest and arms the Phase 1 repay/deleverage subset.
    /// @dev PROTOCOL.md §8 AC-17, PHASE-B-PR5-LOCKS Lock G, THREAT-MODEL I-72.
    function validateAutomationExec(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.AutomationExec calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory) {
        bool countedAttempt = uint8(action.executionKind) == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS);
        if (countedAttempt) _checkAttemptThrottle(action.identity.policyId);
        uint8 policyClass = action.bounds.underlyingPrimaryType;
        if (!_isPhase1PermissionlessPolicyClass(policyClass)) revert LoopV1Errors.Phase1AutomationScopeViolation();
        _validateCommon(
            digest,
            sig,
            action.identity,
            action.freshness,
            uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC),
            uint8(action.executionKind),
            uint8(action.mevProtectionMode),
            action.mevWaiverBits,
            evidence,
            LoopV1Hashing.hashAutomationExec(action, domainSeparator),
            policyClass,
            action.hashes.evidenceBundleHash,
            msg.sender
        );
        Policy storage policy = policies[action.identity.owner][action.identity.policyId];
        if (action.bounds.policyHash != policy.hash) revert LoopV1Errors.PolicyHashMismatch();
        if (block.number < action.bounds.notBeforeBlock || block.number > action.bounds.notAfterBlock) {
            revert LoopV1Errors.AutomationProposalWindow();
        }
        eip1271PreimageDisplayProof;
        bytes4 terminal = policyClass == POLICY_REPAY_ONLY ? MorphoSelectors.REPAY : MorphoSelectors.WITHDRAW_COLLATERAL;
        LoopV1ActionContext.armContext(
            digest,
            action.identity,
            uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC),
            policyClass,
            terminal,
            0,
            0,
            policy.minRepay,
            policyClass == POLICY_REPAY_ONLY ? 0 : policy.maxCollateralSold,
            0
        );
        return _result(action.identity, uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC), evidence.stateBitmap, false);
    }

    /// @notice Validates a ForceExit digest through the distinct authorizer and arms the ForceExit sequence.
    /// @dev the SDK type definitions §A6.2.1: LoopAuthorization owns caller class, context, and nonce state.
    function validateForceExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.ForceExit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        address executionCaller,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory result) {
        if (msg.sender != registry.executorFor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT))) {
            revert LoopV1Errors.ExecutorMismatch();
        }
        if (action.identity.executor != msg.sender) revert LoopV1Errors.ExecutorMismatch();
        if (!_contextClear()) revert LoopV1Errors.ActionContextAlreadyArmed();
        bool countedAttempt = uint8(action.executionKind) == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS);
        if (countedAttempt) _checkAttemptThrottle(0);
        result = ILoopForceExitAuthorizer(registry.loopForceExitAuthorizer())
            .validateForceExitDigest(digest, sig, action, evidence, eip1271PreimageDisplayProof);
        LoopV1ActionValidation.validateExecutionKind(
            registry,
            action.identity.owner,
            uint8(action.executionKind),
            action.identity.market,
            executionCaller,
            ownerLastSignedActionBlock[action.identity.owner]
        );
        LoopV1ActionContext.armContext(
            digest,
            action.identity,
            uint8(LoopV1Types.PrimaryType.FORCE_EXIT),
            POLICY_FORCE_EXIT,
            MorphoSelectors.WITHDRAW_COLLATERAL,
            0,
            0,
            action.bounds.minRepayment,
            action.bounds.maxCollateralSold,
            0
        );
    }

    /// @notice Validates a Revoke digest without arming Morpho execution.
    /// @dev the SDK type definitions §A6.10: Revoke never calls executeMorpho.
    function validateRevoke(bytes32 digest, bytes calldata sig, LoopV1EIP712.Revoke calldata action)
        external
        view
        returns (LoopV1Types.ValidationResult memory)
    {
        _validateRevokeDigest(digest, sig, action);
        return _result(action.identity, uint8(LoopV1Types.PrimaryType.REVOKE), 0, false);
    }

    /// @notice D-5: signed revoke entrypoint (authorization direct — no Morpho executor).
    /// @dev Validates the EIP-712 Revoke digest then starts revocation grace for `bounds.policyId`.
    ///      Anyone may submit; the signature must be the policy owner (EOA or EIP-1271).
    function executeRevoke(bytes32 digest, bytes calldata sig, LoopV1EIP712.Revoke calldata action) external {
        _validateRevokeDigest(digest, sig, action);
        address owner = action.identity.owner;
        uint64 policyId = action.bounds.policyId;
        Policy storage policy = policies[owner][policyId];
        if (policy.owner != owner) revert OwnableUnauthorizedAccount(owner);
        if (policy.revocationBlock != 0) {
            // Already revoking / revoked — idempotent success for the same digest path.
            return;
        }
        policy.revocationBlock = uint64(block.number);
        emit PolicyRevoking(owner, policyId, block.number);
        emit WstdiemAuthorizationRevoked(owner, policyId, block.number);
    }

    function _validateRevokeDigest(bytes32 digest, bytes calldata sig, LoopV1EIP712.Revoke calldata action)
        private
        view
    {
        LoopV1ActionValidation.validateIdentity(
            registry, action.identity, uint8(LoopV1Types.PrimaryType.REVOKE), address(this)
        );
        LoopV1ActionValidation.validateFreshness(registry, action.freshness, uint8(LoopV1Types.PrimaryType.REVOKE));
        if (LoopV1Hashing.hashRevoke(action, domainSeparator) != digest) revert LoopV1Errors.DigestTypeMismatch();
        if (!action.identity.owner.isValidSignatureNow(digest, sig)) revert LoopV1Errors.InvalidSignature();
    }

    /// @notice Validates NF-15 EIP-1271 preimage-display attestation for high-risk policies.
    /// @dev PROTOCOL.md §6.4, the SDK type definitions §A4 NF-15, THREAT-MODEL I-66.
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
    ) external view returns (bool attested) {
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
                policyClass,
                market,
                registryVersion,
                nonceSlot,
                nonceBit,
                maxCollateralSold,
                maxDebtIncrease,
                deadline,
                eip1271PreimageDisplayProof,
                address(this)
            )
        );
    }

    /// @notice Passes through to registry external-protocol-fingerprint validation.
    /// @dev PHASE-B-PR5-LOCKS Lock E / THREAT-MODEL I-71 wiring point.
    function validateExternalConfig(bytes32 market, uint8 primaryType) external view returns (bool valid) {
        return registry.validateExternalConfig(market, primaryType);
    }

    /// @notice Creates an owner-scoped Phase 1 policy.
    /// @dev PROTOCOL.md §8 AC-17 and PHASE-B-PR5-LOCKS Lock G.
    function createPolicy(
        address owner,
        uint8 primaryType,
        uint8 executionKind,
        uint8 policyClass,
        bytes32 newPolicyHash,
        uint256 expiryBlock
    ) external returns (uint64 policyId) {
        if (msg.sender != owner) revert OwnableUnauthorizedAccount(msg.sender);
        if (primaryType == uint8(LoopV1Types.PrimaryType.FORCE_EXIT)) {
            revert LoopV1Errors.ForceExitPolicyNotAllowedInPhase1();
        }
        if (executionKind == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS)) {
            if (!_isPhase1PermissionlessPolicyClass(policyClass)) revert LoopV1Errors.Phase1AutomationScopeViolation();
        }
        if (expiryBlock > block.number + registry.maxPolicyExpiryBlocks(policyClass)) {
            revert LoopV1Errors.PolicyExpiryExceedsBound();
        }
        policyId = ++nextPolicyIds[owner];
        policies[owner][policyId] =
            Policy(owner, primaryType, executionKind, policyClass, newPolicyHash, 0, expiryBlock, 0, 0, 0);
        emit PolicyCreated(owner, policyId, primaryType, newPolicyHash, expiryBlock);
        emit WstdiemAuthorizationSet(owner, policyId, primaryType, newPolicyHash, expiryBlock);
    }

    /// @notice Updates a live policy owned by msg.sender.
    /// @dev PROTOCOL.md §8 policy editability.
    function updatePolicy(uint64 policyId, bytes32 newPolicyHash, uint256 newExpiryBlock) external {
        Policy storage policy = policies[msg.sender][policyId];
        if (policy.owner != msg.sender) revert OwnableUnauthorizedAccount(msg.sender);
        if (newExpiryBlock > block.number + registry.maxPolicyExpiryBlocks(policy.policyClass)) {
            revert LoopV1Errors.PolicyExpiryExceedsBound();
        }
        bytes32 oldHash = policy.hash;
        policy.hash = newPolicyHash;
        policy.expiryBlock = newExpiryBlock;
        emit PolicyUpdated(msg.sender, policyId, oldHash, newPolicyHash, newExpiryBlock);
    }

    /// @notice Starts revocation grace for a policy owned by msg.sender.
    /// @dev PROTOCOL.md §6.4 revocation grace / THREAT-MODEL I-36.
    function revoke(uint64 policyId) external {
        Policy storage policy = policies[msg.sender][policyId];
        if (policy.owner != msg.sender) revert OwnableUnauthorizedAccount(msg.sender);
        policy.revocationBlock = uint64(block.number);
        emit PolicyRevoking(msg.sender, policyId, block.number);
        emit WstdiemAuthorizationRevoked(msg.sender, policyId, block.number);
    }

    /// @notice Cancels an owner one-shot nonce bit.
    /// @dev PHASE-B-PR5-LOCKS Lock F / AC-23.
    function cancelNonce(uint8 primaryType, uint248 nonceSlot, uint8 nonceBit) external {
        _consumeNonce(msg.sender, 0, primaryType, nonceSlot, nonceBit);
        emit WstdiemAuthorizationRevoked(msg.sender, 0, block.number);
    }

    /// @notice Returns the Permit2-style nonce bitmap word.
    /// @dev PROTOCOL.md §6.4 / THREAT-MODEL I-07 and I-08.
    function nonceBitmap(address owner, uint64 policyId, uint8 primaryType, uint248 nonceSlot)
        external
        view
        returns (uint256 word)
    {
        return nonceWords[owner][policyId][primaryType][nonceSlot];
    }

    /// @notice Returns the stored policy hash.
    /// @dev PROTOCOL.md §8 automation policy introspection.
    function policyHash(address owner, uint64 policyId) external view returns (bytes32) {
        return policies[owner][policyId].hash;
    }

    /// @notice Returns the policy revocation block.
    /// @dev PROTOCOL.md §6.4 revocation grace.
    function policyRevocationBlock(address owner, uint64 policyId) external view returns (uint64) {
        return policies[owner][policyId].revocationBlock;
    }

    /// @notice Phase 1 defaults third-party repay opt-in to false.
    /// @dev Exit policy opt-in storage is deferred to PR-3/PR-5 policy bodies.
    function acceptsThirdPartyRepay(address, uint64) external pure returns (bool) {
        return false;
    }

    function _validateCommon(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.ActionIdentity calldata identity,
        LoopV1EIP712.Freshness calldata freshness,
        uint8 primaryType,
        uint8 executionKind,
        uint8 mevProtectionMode,
        uint8 mevWaiverBits,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 computedDigest,
        uint8 policyClass,
        bytes32 evidenceBundleHash,
        address executionCaller
    ) private {
        if (!_contextClear()) revert LoopV1Errors.ActionContextAlreadyArmed();
        if (!registry.validateExternalConfig(identity.market, primaryType)) {
            revert LoopV1Errors.ConfigIntegrityFailure();
        }
        LoopV1ActionValidation.validateIdentity(registry, identity, primaryType, address(this));
        LoopV1ActionValidation.validateFreshness(registry, freshness, primaryType);
        _validatePolicy(identity, primaryType, executionKind, policyClass);
        LoopV1ActionValidation.validateExecutionKind(
            registry,
            identity.owner,
            executionKind,
            identity.market,
            executionCaller,
            ownerLastSignedActionBlock[identity.owner]
        );
        LoopV1ActionValidation.validateMev(mevProtectionMode, mevWaiverBits);
        LoopV1Validation.validateEvidence(registry, evidence, identity, primaryType, evidenceBundleHash);
        uint256 harvestDebtIncrease = primaryType == uint8(LoopV1Types.PrimaryType.OPEN) ? uint256(1) : uint256(0);
        LoopV1ActionValidation.validateHarvest(registry, identity.market, primaryType, harvestDebtIncrease);
        if (computedDigest != digest) revert LoopV1Errors.DigestTypeMismatch();
        if (!identity.owner.isValidSignatureNow(digest, sig)) revert LoopV1Errors.InvalidSignature();
    }

    function _validatePolicy(
        LoopV1EIP712.ActionIdentity calldata identity,
        uint8 primaryType,
        uint8 executionKind,
        uint8 policyClass
    ) private view {
        if (identity.policyId == 0) return;
        Policy storage policy = policies[identity.owner][identity.policyId];
        if (policy.owner != identity.owner) revert LoopV1Errors.PolicyExpired();
        if (policy.primaryType != primaryType) revert LoopV1Errors.PolicyClassMismatch();
        if (policy.executionKind != executionKind || policy.policyClass != policyClass) {
            revert LoopV1Errors.PolicyClassMismatch();
        }
        if (policy.expiryBlock != 0 && block.number > policy.expiryBlock) revert LoopV1Errors.PolicyExpired();
        if (policy.revocationBlock != 0) {
            uint256 grace = registry.revocationGraceBlocks();
            if (block.number <= uint256(policy.revocationBlock) + grace) revert LoopV1Errors.PolicyRevoking();
            revert LoopV1Errors.RevokedAuthorization();
        }
        if (executionKind == uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS)) {
            if (!_isPhase1PermissionlessPolicyClass(policyClass)) revert LoopV1Errors.Phase1AutomationScopeViolation();
        }
    }

    function _checkAttemptThrottle(uint64 policyId) private pure {
        policyId;
        // TODO(PB2-fix-followup): Failed validation attempts that revert cannot persist
        // accounting in the same transaction. Executor-level non-reverting accounting is
        // needed to fully implement I-72 failed-attempt semantics.
    }

    function _requireHighRisk(
        address owner,
        bytes32 digest,
        uint8 primaryType,
        uint8 executionKind,
        uint8 mevProtectionMode,
        uint8 mevWaiverBits,
        uint8 acknowledgedRisks,
        uint8 policyClass,
        LoopV1EIP712.ActionIdentity calldata identity,
        uint256 maxCollateralSold,
        uint256 maxDebtIncrease,
        uint256 deadline,
        bytes32 proof
    ) private view {
        digest;
        bool attested = LoopV1HighRisk.attested(
            registry,
            LoopV1HighRisk.Params(
                owner,
                primaryType,
                executionKind,
                mevProtectionMode,
                mevWaiverBits,
                acknowledgedRisks,
                policyClass,
                identity.market,
                identity.registryVersion,
                identity.nonceSlot,
                identity.nonceBit,
                maxCollateralSold,
                maxDebtIncrease,
                deadline,
                proof,
                address(this)
            )
        );
        if (!attested) revert LoopV1Errors.Eip1271PreimageNotAttested();
    }

    function _contextClear() private view returns (bool) {
        return _tload(LoopV1ActionContext.CONTEXT_DIGEST_SLOT) == bytes32(0);
    }

    /// @dev NF-8 terminal-step nonce consumption + owner activity. Extracted from executeMorpho so
    ///      the three transient nonce reads do not add to that function's via-IR stack budget.
    function _consumeTerminalNonce(address owner, uint8 primaryType) private {
        _consumeNonce(
            owner,
            uint64(uint256(_tload(LoopV1ActionContext.CONTEXT_POLICY_ID_SLOT))),
            primaryType,
            uint248(uint256(_tload(LoopV1ActionContext.CONTEXT_NONCE_SLOT_SLOT))),
            uint8(uint256(_tload(LoopV1ActionContext.CONTEXT_NONCE_BIT_SLOT)))
        );
        ownerLastSignedActionBlock[owner] = block.number;
        registry.recordOwnerActivity(owner);
    }

    function _consumeNonce(address owner, uint64 policyId, uint8 primaryType, uint248 nonceSlot, uint8 nonceBit)
        private
    {
        uint256 mask = uint256(1) << nonceBit;
        uint256 word = nonceWords[owner][policyId][primaryType][nonceSlot];
        if (word & mask != 0) revert LoopV1Errors.NonceAlreadyUsed();
        nonceWords[owner][policyId][primaryType][nonceSlot] = word | mask;
    }

    function _isPhase1PermissionlessPolicyClass(uint8 policyClass) private pure returns (bool) {
        return policyClass == POLICY_REPAY_ONLY || policyClass == POLICY_DELEVERAGE_ONLY;
    }

    function _result(
        LoopV1EIP712.ActionIdentity calldata identity,
        uint8 primaryType,
        uint16 stateBitmap,
        bool highRisk
    ) private pure returns (LoopV1Types.ValidationResult memory) {
        return LoopV1Types.ValidationResult(
            identity.owner, identity.market, identity.policyId, primaryType, stateBitmap, highRisk
        );
    }

    function _enterReentryGuard() private {
        bytes32 slot = LoopV1Types.TX_REENTRY_GUARD_SLOT;
        uint256 active;
        assembly {
            active := tload(slot)
        }
        if (active != 0) revert LoopV1Errors.ReentrantCallback();
        assembly {
            tstore(slot, 1)
        }
    }

    function _exitReentryGuard() private {
        bytes32 slot = LoopV1Types.TX_REENTRY_GUARD_SLOT;
        assembly {
            tstore(slot, 0)
        }
    }

    function _tload(bytes32 slot) private view returns (bytes32 value) {
        assembly {
            value := tload(slot)
        }
    }

    function _tstore(bytes32 slot, bytes32 value) private {
        assembly {
            tstore(slot, value)
        }
    }

    /// @dev F31/D-3: after bootstrap or when enforced, Morpho must be registered for the action type.
    function _requireAllowedSpender(uint8 primaryType, address token, address spender) private view {
        if (spender == address(0)) revert LoopV1Errors.SpenderNotRegistered();
        ILoopRegistry.SpenderCheck memory check = registry.allowedSpender(primaryType, token, spender);
        if (check.spender == address(0)) {
            if (registry.spendAllowlistEnforced() || registry.bootstrapClosed()) {
                revert LoopV1Errors.SpenderNotRegistered();
            }
            return;
        }
        if (check.spender != spender) revert LoopV1Errors.SpenderNotRegistered();
        if (check.runtimeCodeHash != bytes32(0)) {
            bytes32 codehash;
            assembly {
                codehash := extcodehash(spender)
            }
            if (codehash != check.runtimeCodeHash) revert LoopV1Errors.BytecodeMismatch();
        }
    }
}
