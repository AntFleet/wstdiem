// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1EIP712} from "../libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice Phase 1 executor surface for Open, Rebalance, and Exit primary types.
/// @dev PROTOCOL.md section 5.1 locks the two-executor topology; PR-1 declares the ABI only.
interface ILoopExecutorV2 {
    function executeOpen(
        LoopV1EIP712.Open calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result);

    function executeRebalance(
        LoopV1EIP712.Rebalance calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result);

    function executeExit(
        LoopV1EIP712.Exit calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result);

    function executeAutomationExec(
        LoopV1EIP712.AutomationExec calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result);

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
    function canonicalFlashPool(bytes32 market) external view returns (address pool);
    function expectedFlashFee(bytes32 market, uint256 amount) external view returns (uint256 fee);
    function failedAttemptState(uint64 policyId) external view returns (uint64 windowStartBlock, uint8 failedAttempts);
}
