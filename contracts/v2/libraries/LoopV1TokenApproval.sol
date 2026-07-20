// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
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

    /// @notice Registry spender allowlist + bytecode-integrity gate (D-3 always-on).
    /// @dev The registry immutable cannot be read inside a delegatecall library, so it is
    ///      passed in by the caller. `extcodehash(spender)` reads the passed spender's codehash
    ///      and is delegatecall-safe. Logic is byte-for-byte identical to the prior inline gate.
    function requireAllowedSpender(ILoopRegistry loopRegistry, uint8 primaryType, address token, address spender)
        public
        view
    {
        if (spender == address(0)) revert LoopV1Errors.SpenderNotRegistered();
        ILoopRegistry.SpenderCheck memory check = loopRegistry.allowedSpender(primaryType, token, spender);
        // D-3: enforced flag OR post-bootstrap always requires a registered row.
        // Pre-bootstrap unit harnesses may leave the flag false and omit rows.
        if (check.spender == address(0)) {
            if (loopRegistry.spendAllowlistEnforced() || loopRegistry.bootstrapClosed()) {
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
