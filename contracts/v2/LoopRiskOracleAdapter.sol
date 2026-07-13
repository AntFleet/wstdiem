// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEmergencyGuardian} from "./interfaces/IEmergencyGuardian.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {ILoopRiskOracleAdapter} from "./interfaces/ILoopRiskOracleAdapter.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";

interface IMorphoRiskReader {
    function position(bytes32 market, address owner)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);
    function market(bytes32 market)
        external
        view
        returns (
            uint128 totalSupplyAssets,
            uint128 totalSupplyShares,
            uint128 totalBorrowAssets,
            uint128 totalBorrowShares,
            uint128 lastUpdate,
            uint128 fee
        );
}

interface IOraclePriceReader {
    function price() external view returns (uint256);
}

interface IChainlinkFeedReader {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface ICurveDepthReader {
    function balances(int128 i) external view returns (uint256);
}

interface IERC4626NavReader {
    function convertToAssets(uint256 shares) external view returns (uint256);
}

/// @notice Read-only sanity adapter for Morpho, Chainlink, sequencer, Curve, and vault state.
contract LoopRiskOracleAdapter is ILoopRiskOracleAdapter {
    ILoopRegistry public immutable registry;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant MIN_CURVE_DEPTH = 1e18;
    uint256 internal constant SEQUENCER_GRACE_SECONDS = 3_600;

    constructor(ILoopRegistry registry_) {
        registry = registry_;
    }

    function readPositionState(bytes32 market, address owner) public view returns (PositionState memory state) {
        LoopV1Types.MorphoMarketParams memory params = registry.marketParams(market);
        (uint256 borrowShares, uint256 collateral, bool positionOk) = _position(market, owner);
        (uint256 totalBorrowAssets, uint256 totalBorrowShares, bool marketOk) = _marketBorrowState(market);
        // Ceil shares→assets so HF/debt never understate the Morpho repay requirement.
        state.debt = totalBorrowShares == 0
            ? borrowShares
            : (borrowShares * totalBorrowAssets + totalBorrowShares - 1) / totalBorrowShares;
        state.collateral = collateral;
        state.curveDepth = _curveDepth(market);
        state.utilizationBps = _utilizationBps(market);
        (uint256 oraclePrice, bool oracleOk) = _morphoOraclePrice(params.oracle);
        if (!positionOk || !marketOk || !oracleOk) oraclePrice = 0;
        uint256 priceWad = _normalizeOraclePriceToWad(oraclePrice);
        uint256 collateralValue = collateral * priceWad / WAD;
        uint256 lltvWad = params.lltv <= 10_000 ? params.lltv * 1e14 : params.lltv;
        if (state.debt == 0) {
            state.healthFactor = type(uint256).max;
            state.liquidationDistanceBps = type(uint16).max;
        } else {
            state.healthFactor = collateralValue * lltvWad / state.debt;
            if (state.healthFactor <= WAD) {
                state.liquidationDistanceBps = 0;
            } else {
                uint256 distance = (state.healthFactor - WAD) / 1e14;
                state.liquidationDistanceBps = distance > type(uint16).max ? type(uint16).max : uint16(distance);
            }
        }
        // D-6: LTV-style leverage in bps of debt / collateralValue (price-adjusted), not raw units.
        if (collateralValue == 0) {
            state.leverageBps = state.debt == 0 ? 0 : type(uint16).max;
        } else {
            uint256 leverage = state.debt * 10_000 / collateralValue;
            state.leverageBps = leverage > type(uint16).max ? type(uint16).max : uint16(leverage);
        }
    }

    function computeStateBitmap(bytes32 market, address owner) public view returns (uint16 bitmap) {
        try registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN)) returns (bool valid) {
            if (!valid) bitmap |= _bit(LoopV1Types.StateBit.CONFIG_INTEGRITY_FAILURE);
        } catch {
            bitmap |= _bit(LoopV1Types.StateBit.CONFIG_INTEGRITY_FAILURE);
        }
        if (_chainlinkStale(market)) bitmap |= _bit(LoopV1Types.StateBit.ORACLE_DEGRADED);
        if (_sequencerDownOrGrace(market)) bitmap |= _bit(LoopV1Types.StateBit.SEQUENCER_DOWN_OR_GRACE);
        if (_curveDepth(market) < MIN_CURVE_DEPTH) bitmap |= _bit(LoopV1Types.StateBit.CURVE_LIQUIDITY_INSUFFICIENT);
        if (_navMissing(market)) bitmap |= _bit(LoopV1Types.StateBit.VAULT_EVIDENCE_MISSING);
        (uint256 debt, uint256 collateral, bool morphoOk) = _debtAndCollateral(market, owner);
        (, bool oracleOk) = _morphoOraclePrice(registry.marketParams(market).oracle);
        if (!morphoOk || !oracleOk) {
            bitmap |= _bit(LoopV1Types.StateBit.CONFIG_INTEGRITY_FAILURE);
            bitmap |= _bit(LoopV1Types.StateBit.MORPHO_OWNER_EVIDENCE_MISSING);
        } else if (debt != 0 && collateral == 0) {
            bitmap |= _bit(LoopV1Types.StateBit.MORPHO_OWNER_EVIDENCE_MISSING);
        }
        // High-tier: fold EmergencyGuardian pause/incident into the live §7.1 bitmap so risk-up
        // gates in validateLiveStateBitmap see the same surface as requireNotPaused.
        bitmap |= _guardianBits();
        _requireKnownStateBitmap(bitmap);
    }

    function _guardianBits() private view returns (uint16 bits) {
        address guardian = registry.emergencyGuardian();
        if (guardian == address(0)) return 0;
        try IEmergencyGuardian(guardian).isPaused(uint8(LoopV1Types.PrimaryType.OPEN)) returns (bool openPaused) {
            if (openPaused) bits |= _bit(LoopV1Types.StateBit.PAUSE_OPEN_INCREASE);
        } catch {}
        try IEmergencyGuardian(guardian).isPaused(uint8(LoopV1Types.PrimaryType.REBALANCE)) returns (bool rebalPaused)
        {
            if (rebalPaused) bits |= _bit(LoopV1Types.StateBit.PAUSE_OPEN_INCREASE);
        } catch {}
        try IEmergencyGuardian(guardian).incidentState() returns (LoopV1Types.IncidentState incident) {
            if (incident == LoopV1Types.IncidentState.INVESTIGATING) {
                bits |= _bit(LoopV1Types.StateBit.INCIDENT_INVESTIGATING);
            } else if (incident == LoopV1Types.IncidentState.MITIGATING) {
                bits |= _bit(LoopV1Types.StateBit.INCIDENT_MITIGATING);
            }
        } catch {}
    }

    function liquidationDistanceBps(bytes32 market, address owner) external view returns (uint16) {
        return readPositionState(market, owner).liquidationDistanceBps;
    }

    function healthFactor(bytes32 market, address owner) external view returns (uint256) {
        return readPositionState(market, owner).healthFactor;
    }

    function currentLiquidationDistanceBps(address owner, bytes32 market) external view returns (uint16) {
        return readPositionState(market, owner).liquidationDistanceBps;
    }

    function currentLeverageBps(address owner, bytes32 market) external view returns (uint16) {
        return readPositionState(market, owner).leverageBps;
    }

    function currentUtilizationBps(bytes32 market) external view returns (uint16) {
        return _utilizationBps(market);
    }

    function riskStatus(bytes32 market) external view returns (RiskStatus memory status) {
        status.market = market;
        status.blockNumber = block.number;
        status.stateBitmap = computeStateBitmap(market, address(0));
        (status.navPerShareWad,) = _navPerShare(market);
        (uint256 rawMorpho,) = _morphoOraclePrice(registry.marketParams(market).oracle);
        // D-6: both oracle surfaces expose WAD, not raw venue scales (Morpho 1e36 / Chainlink 1e8).
        status.morphoOraclePriceWad = _normalizeOraclePriceToWad(rawMorpho);
        status.externalPriceWad = _chainlinkAnswerWad(market);
        status.curveImpliedPriceWad = 0;
        status.sequencerStatus =
            _sequencerDownOrGrace(market) ? LoopV1Types.SourceStatus.DEGRADED : LoopV1Types.SourceStatus.FRESH;
    }

    function stateBitmap(bytes32 market) external view returns (uint16) {
        return computeStateBitmap(market, address(0));
    }

    function navStepExceeded(bytes32 market) external view returns (bool) {
        return _navMissing(market);
    }

    function lastHarvestBlock(bytes32 market) external view returns (uint256) {
        return registry.lastHarvestBlock(market);
    }

    function requireKnownStateBitmap(uint16 bitmap) external pure {
        _requireKnownStateBitmap(bitmap);
    }

    function _debtAndCollateral(bytes32 market, address owner)
        private
        view
        returns (uint256 debt, uint256 collateral, bool ok)
    {
        (uint256 borrowShares, uint256 collateral_, bool positionOk) = _position(market, owner);
        (uint256 totalBorrowAssets, uint256 totalBorrowShares, bool marketOk) = _marketBorrowState(market);
        debt = totalBorrowShares == 0
            ? borrowShares
            : (borrowShares * totalBorrowAssets + totalBorrowShares - 1) / totalBorrowShares;
        collateral = collateral_;
        ok = positionOk && marketOk;
    }

    /// @dev Morpho Blue 18/18 pairs quote ≈1e36; WAD mocks use 1e18. Threshold 1e30 separates them.
    ///      Phase-1 markets are 18/18; non-18 pairs need registry-pinned scale (follow-up if added).
    function _normalizeOraclePriceToWad(uint256 rawPrice) private pure returns (uint256) {
        if (rawPrice == 0) return 0;
        if (rawPrice >= 1e30) return rawPrice / 1e18;
        return rawPrice;
    }

    /// @dev Chainlink USD feeds are typically 8 decimals; convert answer → WAD.
    function _chainlinkAnswerWad(bytes32 market) private view returns (uint256) {
        address feed = registry.canonicalSource(market, LoopV1Types.SOURCE_CHAINLINK_FEED);
        if (feed == address(0)) return 0;
        try IChainlinkFeedReader(feed).latestRoundData() returns (
            uint80, int256 answer, uint256, uint256, uint80
        ) {
            if (answer <= 0) return 0;
            uint8 dec = 8;
            try IChainlinkFeedReader(feed).decimals() returns (uint8 d) {
                dec = d;
            } catch {}
            if (dec >= 18) return uint256(answer) / (10 ** (dec - 18));
            return uint256(answer) * (10 ** (18 - dec));
        } catch {
            return 0;
        }
    }

    function _position(bytes32 market, address owner)
        private
        view
        returns (uint256 borrowShares, uint256 collateral, bool ok)
    {
        address morpho = registry.morpho();
        if (morpho == address(0)) return (0, 0, false);
        try IMorphoRiskReader(morpho).position(market, owner) returns (
            uint256, uint128 borrowShares_, uint128 collateral_
        ) {
            return (uint256(borrowShares_), uint256(collateral_), true);
        } catch {
            return (0, 0, false);
        }
    }

    function _marketBorrowState(bytes32 market)
        private
        view
        returns (uint256 totalBorrowAssets, uint256 totalBorrowShares, bool ok)
    {
        address morpho = registry.morpho();
        if (morpho == address(0)) return (0, 0, false);
        try IMorphoRiskReader(morpho).market(market) returns (
            uint128, uint128, uint128 assets, uint128 shares, uint128, uint128
        ) {
            return (uint256(assets), uint256(shares), true);
        } catch {
            return (0, 0, false);
        }
    }

    function _utilizationBps(bytes32 market) private view returns (uint16) {
        address morpho = registry.morpho();
        if (morpho == address(0)) return 0;
        try IMorphoRiskReader(morpho).market(market) returns (
            uint128 totalSupplyAssets, uint128, uint128 totalBorrowAssets, uint128, uint128, uint128
        ) {
            if (totalSupplyAssets == 0) return 0;
            uint256 utilization = uint256(totalBorrowAssets) * 10_000 / uint256(totalSupplyAssets);
            return utilization > type(uint16).max ? type(uint16).max : uint16(utilization);
        } catch {
            return 0;
        }
    }

    function _morphoOraclePrice(address oracle) private view returns (uint256 price, bool ok) {
        if (oracle == address(0)) return (0, false);
        try IOraclePriceReader(oracle).price() returns (uint256 readPrice) {
            return (readPrice, readPrice != 0);
        } catch {
            return (0, false);
        }
    }

    function _chainlinkStale(bytes32 market) private view returns (bool) {
        address feed = registry.canonicalSource(market, LoopV1Types.SOURCE_CHAINLINK_FEED);
        if (feed == address(0)) return true;
        uint256 threshold = registry.sourceFreshnessThreshold(LoopV1Types.SOURCE_CHAINLINK_FEED);
        if (threshold == 0) return false;
        try IChainlinkFeedReader(feed).latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            return answer <= 0 || updatedAt == 0 || block.timestamp > updatedAt + threshold;
        } catch {
            return true;
        }
    }

    function _chainlinkAnswer(bytes32 market) private view returns (uint256) {
        address feed = registry.canonicalSource(market, LoopV1Types.SOURCE_CHAINLINK_FEED);
        if (feed == address(0)) return 0;
        try IChainlinkFeedReader(feed).latestRoundData() returns (uint80, int256 answer, uint256, uint256, uint80) {
            return answer <= 0 ? 0 : uint256(answer);
        } catch {
            return 0;
        }
    }

    function _sequencerDownOrGrace(bytes32 market) private view returns (bool) {
        address feed = registry.canonicalSource(market, LoopV1Types.SOURCE_SEQUENCER_UPTIME);
        if (feed == address(0)) return true;
        try IChainlinkFeedReader(feed).latestRoundData() returns (
            uint80, int256 answer, uint256 startedAt, uint256, uint80
        ) {
            return answer != 0 || block.timestamp < startedAt + SEQUENCER_GRACE_SECONDS;
        } catch {
            return true;
        }
    }

    function _curveDepth(bytes32 market) private view returns (uint256) {
        address curve = registry.curvePool(market);
        if (curve == address(0)) return 0;
        try ICurveDepthReader(curve).balances(1) returns (uint256 balance) {
            return balance;
        } catch {
            return 0;
        }
    }

    function _navMissing(bytes32 market) private view returns (bool) {
        (uint256 nav, bool ok) = _navPerShare(market);
        if (!ok || nav == 0) return true;
        uint256 baseline = registry.navBaseline(market);
        if (baseline == 0) return false;
        uint256 delta = baseline > nav ? baseline - nav : nav - baseline;
        return delta * 10_000 > baseline * 50;
    }

    function _navPerShare(bytes32 market) private view returns (uint256 assets, bool ok) {
        address vault = registry.wstDiemVault(market);
        if (vault == address(0)) return (0, false);
        try IERC4626NavReader(vault).convertToAssets(WAD) returns (uint256 readAssets) {
            return (readAssets, readAssets != 0);
        } catch {
            return (0, false);
        }
    }

    function _bit(LoopV1Types.StateBit bit_) private pure returns (uint16) {
        return uint16(1) << uint8(bit_);
    }

    function _requireKnownStateBitmap(uint16 bitmap) private pure {
        if ((bitmap & ~LoopV1Types.KNOWN_STATE_MASK) != 0) revert LoopV1Errors.StateBitmapUnknownBits();
    }
}
