// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopV1Events} from "../interfaces/ILoopV1Events.sol";
import {LoopV1EIP712} from "./LoopV1EIP712.sol";
import {LoopV1MorphoValidation} from "./LoopV1MorphoValidation.sol";

/// @notice Transient arming/clear/context plumbing for the Phase 1 action lifecycle.
/// @dev Extracted from LoopAuthorization for EIP-170 size (Phase 2). Public functions are
///      delegatecalled by LoopAuthorization, so `tstore`/`tload` here correctly hit the
///      CALLER's transient storage. THREAT-MODEL I-01..I-12: the transient slot constants
///      below are the SINGLE canonical definition (identical keccak256 string preimages to
///      the pre-extraction values); LoopAuthorization references them from here so arming
///      and reads share byte-for-byte identical slots.
library LoopV1ActionContext {
    bytes32 internal constant CONTEXT_DIGEST_SLOT = keccak256("wstdiem.tx.action.digest");
    bytes32 internal constant CONTEXT_OWNER_SLOT = keccak256("wstdiem.tx.action.owner");
    bytes32 internal constant CONTEXT_MARKET_SLOT = keccak256("wstdiem.tx.action.market");
    bytes32 internal constant CONTEXT_EXECUTOR_SLOT = keccak256("wstdiem.tx.action.executor");
    bytes32 internal constant CONTEXT_POLICY_ID_SLOT = keccak256("wstdiem.tx.action.policyId");
    bytes32 internal constant CONTEXT_PRIMARY_TYPE_SLOT = keccak256("wstdiem.tx.action.primaryType");
    bytes32 internal constant CONTEXT_POLICY_CLASS_SLOT = keccak256("wstdiem.tx.action.policyClass");
    bytes32 internal constant CONTEXT_NONCE_SLOT_SLOT = keccak256("wstdiem.tx.action.nonceSlot");
    bytes32 internal constant CONTEXT_NONCE_BIT_SLOT = keccak256("wstdiem.tx.action.nonceBit");
    bytes32 internal constant CONTEXT_STEP_SLOT = keccak256("wstdiem.tx.action.step");
    bytes32 internal constant CONTEXT_TERMINAL_SELECTOR_SLOT = keccak256("wstdiem.tx.action.terminalSelector");
    bytes32 internal constant CONTEXT_MIN_BORROW_SLOT = keccak256("wstdiem.tx.action.minBorrow");
    bytes32 internal constant CONTEXT_MAX_BORROW_SLOT = keccak256("wstdiem.tx.action.maxBorrow");
    bytes32 internal constant CONTEXT_MIN_REPAY_SLOT = keccak256("wstdiem.tx.action.minRepay");
    bytes32 internal constant CONTEXT_MAX_COLLATERAL_SLOT = keccak256("wstdiem.tx.action.maxCollateral");
    bytes32 internal constant CONTEXT_MAX_DEBT_INCREASE_SLOT = keccak256("wstdiem.tx.action.maxDebtIncrease");

    /// @notice Reads the armed transient context into a MorphoValidation.Context for executeMorpho.
    /// @dev Kept `internal` (inlined into executeMorpho) on purpose: returning this 11-field struct
    ///      across an external delegatecall would ABI-decode into the already stack-heavy
    ///      executeMorpho and exceed the via-IR stack budget. The bytecode-heavy arm/clear plumbing
    ///      (33 tstores) still lives out-of-line as external functions.
    function morphoContext() public view returns (LoopV1MorphoValidation.Context memory context) {
        context.owner = address(uint160(uint256(_tload(CONTEXT_OWNER_SLOT))));
        context.primaryType = uint8(uint256(_tload(CONTEXT_PRIMARY_TYPE_SLOT)));
        context.executor = address(uint160(uint256(_tload(CONTEXT_EXECUTOR_SLOT))));
        context.market = _tload(CONTEXT_MARKET_SLOT);
        context.step = uint256(_tload(CONTEXT_STEP_SLOT));
        context.terminalSelector = bytes4(_tload(CONTEXT_TERMINAL_SELECTOR_SLOT));
        _readBounds(context);
    }

    function _readBounds(LoopV1MorphoValidation.Context memory context) private view {
        context.minBorrow = uint256(_tload(CONTEXT_MIN_BORROW_SLOT));
        context.maxBorrow = uint256(_tload(CONTEXT_MAX_BORROW_SLOT));
        context.minRepay = uint256(_tload(CONTEXT_MIN_REPAY_SLOT));
        context.maxCollateral = uint256(_tload(CONTEXT_MAX_COLLATERAL_SLOT));
        context.maxDebtIncrease = uint256(_tload(CONTEXT_MAX_DEBT_INCREASE_SLOT));
    }

    /// @notice Arms the transient action context and emits LoopActionStarted.
    /// @dev External (delegatecalled) so the 16 tstores live out-of-line: keeping them inline in the
    ///      five validate* entrypoints is larger than the per-site delegatecall glue. The
    ///      deduplicating wrapper that would collapse that glue to one site triggers a solc 0.8.24
    ///      via-IR miscompilation (memory runaway), so the five sites call this directly.
    function armContext(
        bytes32 digest,
        LoopV1EIP712.ActionIdentity calldata identity,
        uint8 primaryType,
        uint8 policyClass,
        bytes4 terminalSelector,
        uint256 minBorrow,
        uint256 maxBorrow,
        uint256 minRepay,
        uint256 maxCollateral,
        uint256 maxDebtIncrease
    ) public {
        _tstore(CONTEXT_DIGEST_SLOT, digest);
        _tstore(CONTEXT_OWNER_SLOT, bytes32(uint256(uint160(identity.owner))));
        _tstore(CONTEXT_MARKET_SLOT, identity.market);
        _tstore(CONTEXT_EXECUTOR_SLOT, bytes32(uint256(uint160(identity.executor))));
        _tstore(CONTEXT_POLICY_ID_SLOT, bytes32(uint256(identity.policyId)));
        _tstore(CONTEXT_PRIMARY_TYPE_SLOT, bytes32(uint256(primaryType)));
        _tstore(CONTEXT_POLICY_CLASS_SLOT, bytes32(uint256(policyClass)));
        _tstore(CONTEXT_NONCE_SLOT_SLOT, bytes32(uint256(identity.nonceSlot)));
        _tstore(CONTEXT_NONCE_BIT_SLOT, bytes32(uint256(identity.nonceBit)));
        _tstore(CONTEXT_STEP_SLOT, bytes32(0));
        _tstore(CONTEXT_TERMINAL_SELECTOR_SLOT, bytes32(terminalSelector));
        _tstore(CONTEXT_MIN_BORROW_SLOT, bytes32(minBorrow));
        _tstore(CONTEXT_MAX_BORROW_SLOT, bytes32(maxBorrow));
        _tstore(CONTEXT_MIN_REPAY_SLOT, bytes32(minRepay));
        _tstore(CONTEXT_MAX_COLLATERAL_SLOT, bytes32(maxCollateral));
        _tstore(CONTEXT_MAX_DEBT_INCREASE_SLOT, bytes32(maxDebtIncrease));
        emit ILoopV1Events.LoopActionStarted(digest, primaryType, identity.owner, identity.market, block.number);
    }

    /// @notice Zeroes every transient context slot.
    function clearContext() public {
        _tstore(CONTEXT_DIGEST_SLOT, bytes32(0));
        _tstore(CONTEXT_OWNER_SLOT, bytes32(0));
        _tstore(CONTEXT_MARKET_SLOT, bytes32(0));
        _tstore(CONTEXT_EXECUTOR_SLOT, bytes32(0));
        _tstore(CONTEXT_POLICY_ID_SLOT, bytes32(0));
        _tstore(CONTEXT_PRIMARY_TYPE_SLOT, bytes32(0));
        _tstore(CONTEXT_POLICY_CLASS_SLOT, bytes32(0));
        _tstore(CONTEXT_NONCE_SLOT_SLOT, bytes32(0));
        _tstore(CONTEXT_NONCE_BIT_SLOT, bytes32(0));
        _tstore(CONTEXT_STEP_SLOT, bytes32(0));
        _tstore(CONTEXT_TERMINAL_SELECTOR_SLOT, bytes32(0));
        _tstore(CONTEXT_MIN_BORROW_SLOT, bytes32(0));
        _tstore(CONTEXT_MAX_BORROW_SLOT, bytes32(0));
        _tstore(CONTEXT_MIN_REPAY_SLOT, bytes32(0));
        _tstore(CONTEXT_MAX_COLLATERAL_SLOT, bytes32(0));
        _tstore(CONTEXT_MAX_DEBT_INCREASE_SLOT, bytes32(0));
    }

    function _tload(bytes32 slot) private view returns (bytes32 value) {
        assembly ("memory-safe") {
            value := tload(slot)
        }
    }

    function _tstore(bytes32 slot, bytes32 value) private {
        assembly ("memory-safe") {
            tstore(slot, value)
        }
    }
}
