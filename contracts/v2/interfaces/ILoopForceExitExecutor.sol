// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1EIP712} from "../libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice Distinct Phase 1 force-exit executor surface.
/// @dev PROTOCOL.md sections 4.1 and 6.3 require a separate verifyingContract boundary for ForceExit.
interface ILoopForceExitExecutor {
    function executeForceExit(
        LoopV1EIP712.ForceExit calldata action,
        bytes calldata sig,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.LoopActionResult memory result);

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
    function canonicalFlashPool(bytes32 market) external view returns (address pool);
    function expectedFlashFee(bytes32 market, uint256 amount) external view returns (uint256 fee);
    function failedAttemptState(uint64 policyId) external view returns (uint64 windowStartBlock, uint8 failedAttempts);
}
