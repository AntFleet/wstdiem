// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice Emergency guardian pause and incident-state surface.
interface IEmergencyGuardian {
    function PAUSE_RATE_LIMIT_BLOCKS() external view returns (uint64);
    function PAUSE_AUTO_EXPIRE_BLOCKS() external view returns (uint64);
    function PAUSEABLE_PRIMARY_TYPE_MASK() external view returns (uint8);
    function governanceRole() external view returns (address);
    function guardianRole() external view returns (address);
    function pauseBitmap() external view returns (uint8);
    function lastToggleBlock(uint8 primaryType) external view returns (uint64);

    function pause(uint8 primaryType) external;
    function unpause(uint8 primaryType) external;
    function pauseActionClass(uint8 primaryType) external;
    function unpauseActionClass(uint8 primaryType) external;
    function isPaused(uint8 primaryType) external view returns (bool);
    function paused(uint8 primaryType) external view returns (bool);
    function requireNotPaused(uint8 primaryType) external view;
    function reaffirmPause(uint8 primaryType) external;
    function clearIncidentState() external;
    function rotateGuardianRole(address nextGuardian) external;
    function setIncidentState(LoopV1Types.IncidentState next) external;
    function incidentState() external view returns (LoopV1Types.IncidentState);
    function pauseExpiresAt(uint8 primaryType) external view returns (uint256);
}
