// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {LoopV1Errors} from "../../../../contracts/v2/libraries/LoopV1Errors.sol";
import {ForkMockCurvePool} from "./helpers/ForkTokenMock.sol";
import {BaseMainnetForkSetup, IForkCurvePool} from "./BaseMainnetForkSetup.sol";

contract ForkCurveFingerprintTest is BaseMainnetForkSetup {
    function testCurveProxyReadsCoinsBalancesAAndFee() public view {
        IForkCurvePool curve = IForkCurvePool(venues.curvePool);
        assertEq(curve.coins(0), venues.params.loanToken);
        assertEq(curve.coins(1), venues.params.collateralToken);
        assertGt(curve.balances(0), 0);
        assertGt(curve.balances(1), 0);
        assertGt(curve.A(), 0);
        assertGt(curve.fee(), 0);
    }

    function testCurveProxyOracleReadable() public view {
        assertEq(IForkCurvePool(venues.curvePool).oracle(), 1e18);
    }

    function testCurveFingerprintHashMatchesRegistryPinned() public view {
        LoopV1Types.ExternalProtocolFingerprint memory loaded =
            registry.fingerprints_().externalFingerprint(_integrationId(LoopV1Types.SOURCE_CURVE_QUOTE));
        (bytes32 hard, bytes32 tolerance,) = _fingerprintHashes(LoopV1Types.SOURCE_CURVE_QUOTE, venues.curvePool);
        assertEq(loaded.hardEqualityHash, hard);
        assertEq(loaded.toleranceBandHash, tolerance);
    }

    function testCurveBalanceDriftBeyondToleranceRejected() public {
        ForkMockCurvePool(venues.curvePool).setBalances(1, 1);
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(2)));
        registry.validateExternalConfig(venues.market, uint8(LoopV1Types.PrimaryType.REBALANCE));
    }
}
