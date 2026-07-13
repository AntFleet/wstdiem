// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice Canonical WSTDIEM Phase 1 event signatures.
/// @dev PROTOCOL.md section 11 and the protocol G12/G17 lock the event envelope and name-versioning.
interface ILoopV1Events {
    event LoopActionStarted(
        bytes32 indexed digest, uint8 indexed primaryType, address indexed owner, bytes32 marketId, uint256 blockNumber
    );
    event LoopActionStep(
        address indexed owner,
        bytes32 indexed market,
        bytes32 indexed actionId,
        uint8 stepIndex,
        uint8 primaryType,
        address target,
        bytes4 selector,
        bool terminal
    );
    event LoopActionCompleted(bytes32 indexed digest, uint16 statusCode);
    event LoopOpenedV2(
        bytes32 indexed digest,
        address indexed owner,
        bytes32 indexed marketId,
        uint256 collateralWstDiem,
        uint256 borrowedDiem,
        uint256 healthFactorWad
    );
    event LoopRebalancedV2(
        bytes32 indexed digest,
        address indexed owner,
        bytes32 indexed marketId,
        int256 debtDeltaDiem,
        int256 collateralDeltaWstDiem,
        uint256 healthFactorWad
    );
    event LoopExitedV2(
        bytes32 indexed digest,
        address indexed owner,
        bytes32 indexed marketId,
        uint256 repaidDiem,
        uint256 collateralSoldWstDiem,
        uint256 diemReturned
    );
    event LoopForceExitedV2(
        bytes32 indexed digest,
        address indexed owner,
        bytes32 indexed marketId,
        uint256 repaidDiem,
        uint256 collateralSoldWstDiem,
        uint8 acknowledgedRisks
    );
    event LoopRepayedV2(bytes32 indexed digest, address indexed owner, bytes32 indexed marketId, uint256 repaidDiem);
    event LoopRepayedByThirdParty(
        bytes32 indexed digest, address indexed owner, address indexed payer, bytes32 marketId, uint256 repaidDiem
    );
    event WstdiemAuthorizationSet(
        address indexed owner,
        uint64 indexed policyId,
        uint8 indexed primaryType,
        bytes32 policyHash,
        uint256 expiryBlock
    );
    event WstdiemAuthorizationRevoked(address indexed owner, uint64 indexed policyId, uint256 revocationBlock);
    event MorphoAuthorizationSet(address indexed owner, address indexed loopAuthorization);
    event MorphoAuthorizationRevoked(address indexed owner, address indexed loopAuthorization);
    event PolicyCreated(
        address indexed owner,
        uint64 indexed policyId,
        uint8 indexed primaryType,
        bytes32 policyHash,
        uint256 expiryBlock
    );
    event PolicyUpdated(
        address indexed owner,
        uint64 indexed policyId,
        bytes32 oldPolicyHash,
        bytes32 newPolicyHash,
        uint256 expiryBlock
    );
    event PolicyRevoking(address indexed owner, uint64 indexed policyId, uint256 revocationBlock);
    event PolicyRevoked(address indexed owner, uint64 indexed policyId);
    event IndexerSignerRotated(address indexed oldKey, address indexed newKey, uint256 effectiveBlock);
    event AnchorSubmitterRotated(address indexed oldSubmitter, address indexed newSubmitter, uint256 effectiveBlock);
    event AutomationProposed(
        uint64 indexed policyId,
        bytes32 indexed digest,
        address indexed owner,
        uint256 notBeforeBlock,
        uint256 notAfterBlock
    );
    event AutomationExecuted(uint64 indexed policyId, bytes32 indexed digest, address indexed caller);
    event AutomationFailed(
        uint64 indexed policyId, bytes32 indexed digest, address indexed caller, bytes4 errorSelector
    );
    event AutomationExpired(uint64 indexed policyId, bytes32 indexed digest);
    event AutomationAttemptRateLimited(uint64 indexed policyId, address indexed caller);
    event BuilderQuotaExceeded(uint8 indexed policyClass);
    event KeeperBuilderOutage(uint64 indexed policyId, bytes32 indexed digest, bytes32 builderId);
    event StateSnapshotAccepted(uint256 indexed blockNumber, bytes32 indexed manifestHash, address indexed submitter);
    event IncidentStateChanged(
        LoopV1Types.IncidentState indexed previousState, LoopV1Types.IncidentState indexed nextState
    );
    event EmergencyPaused(uint8 indexed primaryType, uint256 expiresAt);
    event EmergencyUnpaused(uint8 indexed primaryType);
    event PauseReaffirmed(uint8 indexed primaryType, uint256 expiresAt);
    event GuardianRoleRotated(address indexed oldGuardian, address indexed newGuardian);
    event GovernanceRoleChanged(address indexed oldGovernance, address indexed newGovernance);
    /// @notice Emitted when the registry's emergency-guardian metadata pointer is rotated.
    /// @dev This is the off-chain indexer/manifest pointer, NOT the on-chain pause authority. Executors
    ///   hold the guardian as IEmergencyGuardian immutable taken at constructor; rotating this pointer
    ///   does NOT change which contract pauses executors. Closes R0/Codex C-4 (R2-8) event-emission gap.
    event RegistryEmergencyGuardianChanged(
        address indexed oldGuardian, address indexed newGuardian, uint256 effectiveBlock
    );
    event FeePayoutFailed(bytes32 indexed digest, address indexed receiver, address indexed token, uint256 amount);
    event LargeDustRefund(
        bytes32 indexed digest, address indexed owner, address indexed token, uint256 amount, uint256 bound
    );
    event OperatorRecoveryNotice(
        address indexed owner, bytes32 indexed market, uint256 earliestExecutionTime, bytes32 reason
    );
    event RegistryConfigBatchCommitted(
        uint256 indexed version, bytes32 indexed root, address indexed committer, uint16 opsCount
    );
    event ExternalFingerprintUpdateQueued(
        bytes32 indexed integrationId, bytes32 fingerprintHash, uint256 effectiveBlock
    );
    event ExternalFingerprintUpdateApplied(bytes32 indexed integrationId, bytes32 fingerprintHash);
    /// @notice Critical role rotation queued (F22). roleId: 1=indexer, 2=anchor, 3=guardian, 4=governance, 5=harvest.
    event CriticalRoleUpdateQueued(uint8 indexed roleId, address indexed next, uint256 effectiveBlock);
    event CriticalRoleUpdateApplied(uint8 indexed roleId, address indexed previous, address indexed next);
    event SpendAllowlistEnforcementChanged(bool enforced);
    event ReclosedIntegration(bytes32 indexed integrationId);
    event OwnerActivityRecorded(address indexed owner, uint256 indexed blockNumber);
    event HarvestObserved(bytes32 indexed market, uint256 indexed blockNumber, bytes32 indexed topic0);
    event FeeRouted(address indexed receiver, address indexed token, uint256 amount, bytes32 indexed actionId);
    event FeeRouterConfigured(address indexed protocolReceiver, address indexed automationReceiver);
}
