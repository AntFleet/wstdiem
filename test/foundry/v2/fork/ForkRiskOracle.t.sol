// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRiskOracleAdapter} from "../../../../contracts/v2/interfaces/ILoopRiskOracleAdapter.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {ForkMockCurvePool, ForkMock4626Vault} from "./helpers/ForkTokenMock.sol";
import {BaseMainnetForkSetup} from "./BaseMainnetForkSetup.sol";

contract ForkRiskOracleTest is BaseMainnetForkSetup {
    function testReadPositionStateAgainstRealMorphoPosition() public view {
        ILoopRiskOracleAdapter.PositionState memory state = riskOracle.readPositionState(venues.market, owner);
        assertEq(state.debt, 0);
        assertEq(state.collateral, 0);
        assertEq(state.healthFactor, type(uint256).max);
        assertGt(state.curveDepth, 0);
    }

    function testStateBitmapHealthyPositionHasNoAdapterRiskBits() public view {
        assertEq(riskOracle.computeStateBitmap(venues.market, owner), 0);
    }

    function testStateBitmapSetsConfigIntegrityFailureWhenRegistryRejects() public {
        vm.mockCall(
            address(registry),
            abi.encodeWithSignature(
                "validateExternalConfig(bytes32,uint8)", venues.market, uint8(LoopV1Types.PrimaryType.OPEN)
            ),
            abi.encode(false)
        );
        uint16 bitmap = riskOracle.computeStateBitmap(venues.market, owner);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.CONFIG_INTEGRITY_FAILURE) != 0);
    }

    function testStateBitmapSetsOracleDegradedUnderMockedStaleFeed() public {
        registry.setSourceFreshnessThreshold(LoopV1Types.SOURCE_CHAINLINK_FEED, 600);
        vm.mockCall(
            venues.chainlinkFeed,
            abi.encodeWithSignature("latestRoundData()"),
            abi.encode(uint80(1), int256(1), block.timestamp - 1 hours, block.timestamp - 1 hours, uint80(1))
        );
        uint16 bitmap = riskOracle.computeStateBitmap(venues.market, owner);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.ORACLE_DEGRADED) != 0);
    }

    function testStateBitmapSetsSequencerDownUnderMockedFeed() public {
        vm.mockCall(
            venues.sequencerFeed,
            abi.encodeWithSignature("latestRoundData()"),
            abi.encode(uint80(1), int256(1), block.timestamp, block.timestamp, uint80(1))
        );
        uint16 bitmap = riskOracle.computeStateBitmap(venues.market, owner);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.SEQUENCER_DOWN_OR_GRACE) != 0);
    }

    function testStateBitmapSetsCurveDepthInsufficient() public {
        ForkMockCurvePool(venues.curvePool).setBalances(1, 1);
        uint16 bitmap = riskOracle.computeStateBitmap(venues.market, owner);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.CURVE_LIQUIDITY_INSUFFICIENT) != 0);
    }

    function testStateBitmapSetsMorphoOwnerEvidenceMissingForDebtWithoutCollateral() public {
        vm.mockCall(
            venues.morpho,
            abi.encodeWithSignature("position(bytes32,address)", venues.market, owner),
            abi.encode(uint256(0), uint128(1e18), uint128(0))
        );
        uint16 bitmap = riskOracle.computeStateBitmap(venues.market, owner);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.MORPHO_OWNER_EVIDENCE_MISSING) != 0);
    }

    function testStateBitmapSetsVaultEvidenceMissing() public {
        ForkMock4626Vault(venues.vault).setTotals(1_000_000 ether, 0);
        uint16 bitmap = riskOracle.computeStateBitmap(venues.market, owner);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.VAULT_EVIDENCE_MISSING) != 0);
    }

    function testStateBitmapDoesNotSynthesizeAuditGateClosed() public view {
        assertEq(riskOracle.computeStateBitmap(venues.market, owner) & _bit(LoopV1Types.StateBit.AUDIT_GATE_CLOSED), 0);
    }

    function testStateBitmapDoesNotSynthesizePauseOpenIncrease() public view {
        assertEq(
            riskOracle.computeStateBitmap(venues.market, owner) & _bit(LoopV1Types.StateBit.PAUSE_OPEN_INCREASE), 0
        );
    }

    function testStateBitmapDoesNotSynthesizeFlashLiquidityUnavailable() public view {
        assertEq(
            riskOracle.computeStateBitmap(venues.market, owner)
                & _bit(LoopV1Types.StateBit.FLASH_LIQUIDITY_UNAVAILABLE),
            0
        );
    }

    function testStateBitmapDoesNotSynthesizeIncidentInvestigating() public view {
        assertEq(
            riskOracle.computeStateBitmap(venues.market, owner) & _bit(LoopV1Types.StateBit.INCIDENT_INVESTIGATING), 0
        );
    }

    function testStateBitmapDoesNotSynthesizeIncidentMitigating() public view {
        assertEq(
            riskOracle.computeStateBitmap(venues.market, owner) & _bit(LoopV1Types.StateBit.INCIDENT_MITIGATING), 0
        );
    }

    function _bit(LoopV1Types.StateBit bit_) private pure returns (uint16) {
        return uint16(1) << uint8(bit_);
    }
}
