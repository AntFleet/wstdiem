// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice Read-only risk oracle adapter surface.
/// @dev PROTOCOL.md section 5.1: sanity checker only, never an execution price source.
interface ILoopRiskOracleAdapter {
    struct PositionState {
        uint256 debt;
        uint256 collateral;
        uint256 healthFactor;
        uint16 leverageBps;
        uint16 liquidationDistanceBps;
        uint16 utilizationBps;
        uint256 curveDepth;
    }

    struct RiskStatus {
        bytes32 market;
        uint256 blockNumber;
        uint16 stateBitmap;
        LoopV1Types.EvidenceSource[] sources;
        uint256 navPerShareWad;
        uint256 morphoOraclePriceWad;
        uint256 externalPriceWad;
        uint256 curveImpliedPriceWad;
        LoopV1Types.SourceStatus sequencerStatus;
    }

    function readPositionState(bytes32 market, address owner) external view returns (PositionState memory);
    function computeStateBitmap(bytes32 market, address owner) external view returns (uint16);
    function liquidationDistanceBps(bytes32 market, address owner) external view returns (uint16);
    function healthFactor(bytes32 market, address owner) external view returns (uint256);
    function currentLiquidationDistanceBps(address owner, bytes32 market) external view returns (uint16);
    function currentLeverageBps(address owner, bytes32 market) external view returns (uint16);
    function currentUtilizationBps(bytes32 market) external view returns (uint16);
    function riskStatus(bytes32 market) external view returns (RiskStatus memory);
    function stateBitmap(bytes32 market) external view returns (uint16);
    function navStepExceeded(bytes32 market) external view returns (bool);
    function lastHarvestBlock(bytes32 market) external view returns (uint256);
}
