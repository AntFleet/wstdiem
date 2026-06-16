// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Errors} from "./LoopV1Errors.sol";

interface IERC20ApprovalMinimal {
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Linked helper for LoopAuthorization token-in approvals.
library LoopV1TokenApproval {
    function approve(address token, address spender, uint256 amount) public {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20ApprovalMinimal.approve, (spender, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert LoopV1Errors.Erc20ApproveFailed();
        }
    }
}
