// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEmergencyGuardian} from "./interfaces/IEmergencyGuardian.sol";
import {ILoopV1Events} from "./interfaces/ILoopV1Events.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";

/// @notice Operational emergency perimeter for Phase 1 risk-increasing actions.
/// @dev The guardian can only block Open and leverage-increasing Rebalance. Exit,
///      ForceExit, Revoke, repay-only, deleverage, and health-factor recovery paths
///      are deliberately outside the pause scope.
contract EmergencyGuardian is IEmergencyGuardian, ILoopV1Events {
    address public immutable governanceRole;
    address public guardianRole;

    uint8 public pauseBitmap;
    mapping(uint8 primaryType => uint64 expiresAt) private pauseExpiryBlocks;
    mapping(uint8 primaryType => uint64 blockNumber) public lastToggleBlock;

    LoopV1Types.IncidentState public incidentState;

    uint64 public constant PAUSE_RATE_LIMIT_BLOCKS = 900;
    uint64 public constant PAUSE_AUTO_EXPIRE_BLOCKS = 302_400;
    uint8 public constant PAUSEABLE_PRIMARY_TYPE_MASK =
        uint8(2 ** uint8(LoopV1Types.PrimaryType.OPEN)) | uint8(2 ** uint8(LoopV1Types.PrimaryType.REBALANCE));

    constructor(address governanceRole_, address initialGuardian) {
        if (governanceRole_ == address(0)) revert LoopV1Errors.GovernanceRoleOnly();
        if (initialGuardian == address(0)) revert LoopV1Errors.PauseAuthorityOnly();
        if (governanceRole_ == initialGuardian) revert LoopV1Errors.RolesMustDiffer();
        governanceRole = governanceRole_;
        guardianRole = initialGuardian;
        emit GovernanceRoleChanged(address(0), governanceRole_);
        emit GuardianRoleRotated(address(0), initialGuardian);
    }

    modifier onlyGuardian() {
        if (msg.sender != guardianRole) revert LoopV1Errors.PauseAuthorityOnly();
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != governanceRole) revert LoopV1Errors.GovernanceRoleOnly();
        _;
    }

    function pause(uint8 primaryType) public onlyGuardian {
        _requirePauseable(primaryType);
        uint64 last = lastToggleBlock[primaryType];
        if (last != 0 && block.number < uint256(last) + PAUSE_RATE_LIMIT_BLOCKS) {
            revert LoopV1Errors.PauseRateLimited();
        }
        if (isPaused(primaryType)) revert LoopV1Errors.AlreadyPaused();
        lastToggleBlock[primaryType] = uint64(block.number);
        pauseBitmap |= _bit(primaryType);
        uint64 expiresAt = uint64(block.number) + PAUSE_AUTO_EXPIRE_BLOCKS;
        pauseExpiryBlocks[primaryType] = expiresAt;
        emit EmergencyPaused(primaryType, expiresAt);
    }

    function unpause(uint8 primaryType) public onlyGuardian {
        _requirePauseable(primaryType);
        if ((pauseBitmap & _bit(primaryType)) == 0) return;
        uint64 last = lastToggleBlock[primaryType];
        if (block.number < uint256(last) + PAUSE_RATE_LIMIT_BLOCKS) revert LoopV1Errors.PauseRateLimited();
        lastToggleBlock[primaryType] = uint64(block.number);
        pauseBitmap &= ~_bit(primaryType);
        pauseExpiryBlocks[primaryType] = 0;
        emit EmergencyUnpaused(primaryType);
    }

    function pauseActionClass(uint8 primaryType) external {
        pause(primaryType);
    }

    function unpauseActionClass(uint8 primaryType) external {
        unpause(primaryType);
    }

    function reaffirmPause(uint8 primaryType) external onlyGovernance {
        _requirePauseable(primaryType);
        if (!isPaused(primaryType)) revert LoopV1Errors.NotPaused();
        uint64 expiresAt = uint64(block.number) + PAUSE_AUTO_EXPIRE_BLOCKS;
        pauseExpiryBlocks[primaryType] = expiresAt;
        emit PauseReaffirmed(primaryType, expiresAt);
    }

    function isPaused(uint8 primaryType) public view returns (bool) {
        if (primaryType > uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)) return false;
        if ((pauseBitmap & _bit(primaryType)) == 0) return false;
        return block.number < pauseExpiryBlocks[primaryType];
    }

    function paused(uint8 primaryType) external view returns (bool) {
        return isPaused(primaryType);
    }

    function requireNotPaused(uint8 primaryType) external view {
        if (isPaused(primaryType)) revert LoopV1Errors.PausedAction();
    }

    function pauseExpiresAt(uint8 primaryType) external view returns (uint256) {
        return pauseExpiryBlocks[primaryType];
    }

    function setIncidentState(LoopV1Types.IncidentState next) external onlyGuardian {
        LoopV1Types.IncidentState previous = incidentState;
        if (previous == next) return;
        incidentState = next;
        emit IncidentStateChanged(previous, next);
    }

    function clearIncidentState() external onlyGovernance {
        LoopV1Types.IncidentState previous = incidentState;
        if (previous == LoopV1Types.IncidentState.NONE) return;
        incidentState = LoopV1Types.IncidentState.NONE;
        emit IncidentStateChanged(previous, LoopV1Types.IncidentState.NONE);
    }

    function rotateGuardianRole(address nextGuardian) external onlyGovernance {
        if (nextGuardian == address(0)) revert LoopV1Errors.PauseAuthorityOnly();
        if (nextGuardian == governanceRole) revert LoopV1Errors.RolesMustDiffer();
        address previous = guardianRole;
        guardianRole = nextGuardian;
        emit GuardianRoleRotated(previous, nextGuardian);
    }

    function _requirePauseable(uint8 primaryType) private pure {
        if (primaryType > uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)) revert LoopV1Errors.PauseScopeViolation();
        if ((PAUSEABLE_PRIMARY_TYPE_MASK & _bit(primaryType)) == 0) {
            revert LoopV1Errors.PauseScopeViolation();
        }
    }

    function _bit(uint8 primaryType) private pure returns (uint8) {
        return uint8(2 ** primaryType);
    }
}
