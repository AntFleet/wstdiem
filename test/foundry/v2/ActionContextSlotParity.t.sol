// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopV1ActionContext} from "../../../contracts/v2/libraries/LoopV1ActionContext.sol";
import {LoopV1MorphoValidation} from "../../../contracts/v2/libraries/LoopV1MorphoValidation.sol";

/// @notice S1 safeguard for the Phase 2 EIP-170 extraction (THREAT-MODEL I-01..I-12).
/// @dev Proves two things about the extracted transient plumbing:
///      1. The slot constants keep their exact keccak256 string preimages. `armContext`
///         writes these SAME constants, so identical constant values guarantee arm/read parity.
///      2. `morphoContext()` reads, and `clearContext()` zeroes, exactly those canonical slots.
///      The library functions are public (delegatecalled), so invoking them from this test
///      reads/writes THIS contract's transient storage — a self-contained round trip. Full
///      arm->execute->clear behavior through the real contract is covered by the Authorization /
///      ForceExit / E2E suites.
contract ActionContextSlotParityTest is Test {
    function _write(bytes32 slot, bytes32 value) private {
        assembly ("memory-safe") {
            tstore(slot, value)
        }
    }

    function _read(bytes32 slot) private view returns (bytes32 v) {
        assembly ("memory-safe") {
            v := tload(slot)
        }
    }

    /// @dev Populate every armed slot (as armContext would), confirm morphoContext reads them,
    ///      then confirm clearContext zeroes them.
    function test_readClearRoundTripThroughCanonicalSlots() public {
        address owner = address(0xA11CE);
        address executor = address(0xE0EC);
        bytes32 market = keccak256("market-parity");

        _write(LoopV1ActionContext.CONTEXT_OWNER_SLOT, bytes32(uint256(uint160(owner))));
        _write(LoopV1ActionContext.CONTEXT_EXECUTOR_SLOT, bytes32(uint256(uint160(executor))));
        _write(LoopV1ActionContext.CONTEXT_MARKET_SLOT, market);
        _write(LoopV1ActionContext.CONTEXT_PRIMARY_TYPE_SLOT, bytes32(uint256(3)));
        _write(LoopV1ActionContext.CONTEXT_STEP_SLOT, bytes32(uint256(0)));
        _write(LoopV1ActionContext.CONTEXT_TERMINAL_SELECTOR_SLOT, bytes32(bytes4(0x11223344)));
        _write(LoopV1ActionContext.CONTEXT_MIN_BORROW_SLOT, bytes32(uint256(100)));
        _write(LoopV1ActionContext.CONTEXT_MAX_BORROW_SLOT, bytes32(uint256(200)));
        _write(LoopV1ActionContext.CONTEXT_MIN_REPAY_SLOT, bytes32(uint256(300)));
        _write(LoopV1ActionContext.CONTEXT_MAX_COLLATERAL_SLOT, bytes32(uint256(400)));
        _write(LoopV1ActionContext.CONTEXT_MAX_DEBT_INCREASE_SLOT, bytes32(uint256(500)));
        // Slots the Context struct does not surface but the nonce path reads directly.
        _write(LoopV1ActionContext.CONTEXT_POLICY_ID_SLOT, bytes32(uint256(42)));
        _write(LoopV1ActionContext.CONTEXT_NONCE_SLOT_SLOT, bytes32(uint256(123456)));
        _write(LoopV1ActionContext.CONTEXT_NONCE_BIT_SLOT, bytes32(uint256(9)));

        LoopV1MorphoValidation.Context memory c = LoopV1ActionContext.morphoContext();
        assertEq(c.owner, owner, "owner");
        assertEq(c.executor, executor, "executor");
        assertEq(c.market, market, "market");
        assertEq(c.primaryType, uint8(3), "primaryType");
        assertEq(c.step, 0, "step");
        assertEq(c.terminalSelector, bytes4(0x11223344), "terminalSelector");
        assertEq(c.minBorrow, 100, "minBorrow");
        assertEq(c.maxBorrow, 200, "maxBorrow");
        assertEq(c.minRepay, 300, "minRepay");
        assertEq(c.maxCollateral, 400, "maxCollateral");
        assertEq(c.maxDebtIncrease, 500, "maxDebtIncrease");

        LoopV1ActionContext.clearContext();

        LoopV1MorphoValidation.Context memory z = LoopV1ActionContext.morphoContext();
        assertEq(z.owner, address(0), "owner cleared");
        assertEq(z.executor, address(0), "executor cleared");
        assertEq(z.market, bytes32(0), "market cleared");
        assertEq(z.terminalSelector, bytes4(0), "terminalSelector cleared");
        assertEq(z.minBorrow, 0, "minBorrow cleared");
        assertEq(z.maxDebtIncrease, 0, "maxDebtIncrease cleared");
        assertEq(_read(LoopV1ActionContext.CONTEXT_DIGEST_SLOT), bytes32(0), "digest cleared");
        assertEq(_read(LoopV1ActionContext.CONTEXT_POLICY_ID_SLOT), bytes32(0), "policyId cleared");
        assertEq(_read(LoopV1ActionContext.CONTEXT_NONCE_SLOT_SLOT), bytes32(0), "nonceSlot cleared");
        assertEq(_read(LoopV1ActionContext.CONTEXT_NONCE_BIT_SLOT), bytes32(0), "nonceBit cleared");
    }

    /// @dev The extracted library must keep byte-for-byte identical slot values (canonical preimages).
    ///      armContext writes these exact constants, so this pins arm/read parity.
    function test_slotConstantsMatchCanonicalPreimages() public pure {
        assertEq(LoopV1ActionContext.CONTEXT_DIGEST_SLOT, keccak256("wstdiem.tx.action.digest"));
        assertEq(LoopV1ActionContext.CONTEXT_OWNER_SLOT, keccak256("wstdiem.tx.action.owner"));
        assertEq(LoopV1ActionContext.CONTEXT_MARKET_SLOT, keccak256("wstdiem.tx.action.market"));
        assertEq(LoopV1ActionContext.CONTEXT_EXECUTOR_SLOT, keccak256("wstdiem.tx.action.executor"));
        assertEq(LoopV1ActionContext.CONTEXT_POLICY_ID_SLOT, keccak256("wstdiem.tx.action.policyId"));
        assertEq(LoopV1ActionContext.CONTEXT_PRIMARY_TYPE_SLOT, keccak256("wstdiem.tx.action.primaryType"));
        assertEq(LoopV1ActionContext.CONTEXT_POLICY_CLASS_SLOT, keccak256("wstdiem.tx.action.policyClass"));
        assertEq(LoopV1ActionContext.CONTEXT_NONCE_SLOT_SLOT, keccak256("wstdiem.tx.action.nonceSlot"));
        assertEq(LoopV1ActionContext.CONTEXT_NONCE_BIT_SLOT, keccak256("wstdiem.tx.action.nonceBit"));
        assertEq(LoopV1ActionContext.CONTEXT_STEP_SLOT, keccak256("wstdiem.tx.action.step"));
        assertEq(LoopV1ActionContext.CONTEXT_TERMINAL_SELECTOR_SLOT, keccak256("wstdiem.tx.action.terminalSelector"));
        assertEq(LoopV1ActionContext.CONTEXT_MIN_BORROW_SLOT, keccak256("wstdiem.tx.action.minBorrow"));
        assertEq(LoopV1ActionContext.CONTEXT_MAX_BORROW_SLOT, keccak256("wstdiem.tx.action.maxBorrow"));
        assertEq(LoopV1ActionContext.CONTEXT_MIN_REPAY_SLOT, keccak256("wstdiem.tx.action.minRepay"));
        assertEq(LoopV1ActionContext.CONTEXT_MAX_COLLATERAL_SLOT, keccak256("wstdiem.tx.action.maxCollateral"));
        assertEq(LoopV1ActionContext.CONTEXT_MAX_DEBT_INCREASE_SLOT, keccak256("wstdiem.tx.action.maxDebtIncrease"));
    }
}
