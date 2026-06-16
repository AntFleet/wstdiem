// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {LoopV1Errors} from "../../../../contracts/v2/libraries/LoopV1Errors.sol";
import {ForkMock4626Vault, ForkMockCurvePool} from "./helpers/ForkTokenMock.sol";
import {BaseMainnetForkSetup} from "./BaseMainnetForkSetup.sol";

contract ForkValidateExternalConfigTest is BaseMainnetForkSetup {
    function testValidateExternalConfigHappyPathAgainstLiveState() public view {
        assertTrue(registry.validateExternalConfig(venues.market, uint8(LoopV1Types.PrimaryType.OPEN)));
        assertTrue(registry.validateExternalConfig(venues.market, uint8(LoopV1Types.PrimaryType.REBALANCE)));
    }

    function testValidateExternalConfigRejectsStaleVaultBaseline() public {
        ForkMock4626Vault(venues.vault).setTotals(1_000_000 ether, 2_000_000 ether);
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(2)));
        registry.validateExternalConfig(venues.market, uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testValidateExternalConfigRejectsPerVenueReason() public {
        vm.mockCall(venues.chainlinkFeed, abi.encodeWithSignature("aggregator()"), abi.encode(address(0xBADC0DE)));
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(1)));
        registry.validateExternalConfig(venues.market, uint8(LoopV1Types.PrimaryType.OPEN));
    }
}

contract ForkValidateExternalConfigDegradedBootstrapTest is BaseMainnetForkSetup {
    function setUp() public override {
        string memory rpc = vm.envOr(BASE_RPC_ENV, string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc, FORK_BLOCK_NUMBER);
        forkActive = true;
        owner = vm.addr(OWNER_PK);
        _pickProxyVenues();
        _deployProtocol();
        ForkMockCurvePool(venues.curvePool).setBalances(1, 1);
        _bootstrapFingerprintsFromLive();
        registry.setPermissionlessCallerAllowed(address(this), true);
    }

    function testBootstrapPinsDegradedCurveSnapshotRatherThanRejectingHistoricalForkState() public view {
        assertEq(ForkMockCurvePool(venues.curvePool).balances(int128(0)), 1);
        assertEq(ForkMockCurvePool(venues.curvePool).balances(int128(1)), 1);
        assertTrue(registry.validateExternalConfig(venues.market, uint8(LoopV1Types.PrimaryType.REBALANCE)));
    }
}
