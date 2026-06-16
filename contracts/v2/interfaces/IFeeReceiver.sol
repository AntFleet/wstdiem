// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Fee receiver probe interface.
/// @dev the protocol G18 requires receivers to disclose acceptance and schema version.
interface IFeeReceiver {
    function acceptsFees() external view returns (bool);
    function feeSchemaVersion() external view returns (uint256);
}
