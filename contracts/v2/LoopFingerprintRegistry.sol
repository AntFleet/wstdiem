// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {ILoopV1Events} from "./interfaces/ILoopV1Events.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";

interface IMorphoFingerprintReader {
    function idToMarketParams(bytes32 market)
        external
        view
        returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv);
}

interface IChainlinkFingerprintReader {
    function aggregator() external view returns (address);
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface ICurveFingerprintReader {
    function coins(uint256 i) external view returns (address);
    function balances(uint256 i) external view returns (uint256);
    function A() external view returns (uint256);
    function fee() external view returns (uint256);
}

interface IERC4626FingerprintReader {
    function asset() external view returns (address);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

interface IUniswapV3PoolFingerprintReader {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

/// @notice EIP-170 Phase 3 split-out of the config-integrity fingerprint subsystem (Lock E / threat
///         surface I-71) formerly inlined in `LoopRegistry`. Owns the fingerprint storage + venue
///         reader interfaces + the full validation/venue-read logic, reading all core config through
///         the `ILoopRegistry` getters on the immutably-bound core registry — no shared storage.
/// @dev SECURITY (S3 — new trust anchor): the core⇄fingerprint pairing is bound immutably (`core` is
///      set once in the constructor by the core registry, which deploys this contract as `new
///      LoopFingerprintRegistry(this)`). Mutating hooks are access-controlled: `rememberFingerprint`
///      and `applyExternalFingerprint` are callable ONLY by the bound core (they run inside the core's
///      timelocked batch `_dispatch`), and `queueExternalFingerprintUpdate` mirrors the core's owner
///      model exactly by gating on `core.owner()` — no weaker owner is introduced and fingerprints
///      cannot be mutated outside the core's existing timelock/bootstrap flow. All revert paths, the
///      `_fingerprintValidationEnabled` short-circuit, and the tolerance math are preserved byte-for-byte.
contract LoopFingerprintRegistry is ILoopV1Events {
    error OnlyCore();
    error OnlyCoreOwner();

    uint256 internal constant WAD = 1e18;
    uint16 internal constant MAX_TOLERANCE_STEP_BPS = 50;
    uint256 internal constant SEQUENCER_GRACE_SECONDS = 3_600;
    uint256 internal constant REGISTRY_TIMELOCK_BLOCKS = 130_000;

    struct PendingFingerprint {
        LoopV1Types.ExternalProtocolFingerprint fingerprint;
        uint256 effectiveBlock;
        FingerprintBaseline baseline;
    }

    struct FingerprintBaseline {
        uint256 value0;
        uint256 value1;
        int256 signedValue;
        uint256 updatedAt;
    }

    /// @notice The core registry this fingerprint subsystem is permanently bound to. Set once, by the
    ///         core registry itself (which deploys this contract in its constructor). Immutable.
    ILoopRegistry public immutable core;

    mapping(bytes32 integrationId => LoopV1Types.ExternalProtocolFingerprint fingerprint) private fingerprints;
    mapping(bytes32 integrationId => PendingFingerprint pending) private pendingFingerprints;
    mapping(bytes32 integrationId => bytes32 market) private fingerprintMarkets;
    mapping(bytes32 integrationId => bytes32 sourceId) private fingerprintSources;
    mapping(bytes32 integrationId => FingerprintBaseline baseline) private fingerprintBaselines;

    constructor(ILoopRegistry core_) {
        core = core_;
    }

    /// @dev Only the bound core registry (its timelocked batch `_dispatch`) may drive fingerprint state.
    modifier onlyCore() {
        if (msg.sender != address(core)) revert OnlyCore();
        _;
    }

    /// @dev Mirrors the core's owner model: only the core's current owner may queue a fingerprint update.
    modifier onlyCoreOwner() {
        if (msg.sender != Ownable(address(core)).owner()) revert OnlyCoreOwner();
        _;
    }

    // ---------------------------------------------------------------------
    // Public fingerprint API (moved off the core registry; SDK/indexer read here)
    // ---------------------------------------------------------------------

    function externalFingerprint(bytes32 integrationId)
        external
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory fingerprint)
    {
        return fingerprints[integrationId];
    }

    function pendingExternalFingerprint(bytes32 integrationId)
        external
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory fingerprint, uint256 effectiveBlock)
    {
        PendingFingerprint storage pending = pendingFingerprints[integrationId];
        return (pending.fingerprint, pending.effectiveBlock);
    }

    function navBaseline(bytes32 market) external view returns (uint256) {
        return fingerprintBaselines[_integrationId(market, LoopV1Types.SOURCE_VAULT_NAV)].value0;
    }

    function queueExternalFingerprintUpdate(
        bytes32 integrationId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) external onlyCoreOwner {
        _validateFingerprintShape(integrationId, fingerprint);
        bytes32 market = fingerprintMarkets[integrationId];
        bytes32 sourceId = fingerprintSources[integrationId];
        if (sourceId == bytes32(0)) revert LoopV1Errors.FingerprintInvalid(6);
        FingerprintBaseline memory baseline = _validateQueuedFingerprint(core, market, sourceId, fingerprint);
        uint256 effectiveBlock = block.number + REGISTRY_TIMELOCK_BLOCKS;
        pendingFingerprints[integrationId] = PendingFingerprint(fingerprint, effectiveBlock, baseline);
        emit ExternalFingerprintUpdateQueued(integrationId, fingerprint.fingerprintHash, effectiveBlock);
    }

    /// @notice Config-integrity gate (I-71 / Lock E). Called by the core's thin `validateExternalConfig`
    ///         forwarder as `fingerprints_.validate(this, market, primaryType)`. Reads core config via
    ///         the passed `core_` getters and this contract's local fingerprint storage.
    function validate(ILoopRegistry core_, bytes32 market, uint8 primaryType) external view returns (bool valid) {
        if (!_fingerprintValidationEnabled(core_, market)) return true;
        bytes32[] memory required = _requiredFingerprintSourceIds(primaryType);
        for (uint256 i = 0; i < required.length; i++) {
            _validateConfiguredFingerprint(core_, market, required[i]);
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // Core-only mutating hooks (invoked from the core registry's `_dispatch`)
    // ---------------------------------------------------------------------

    function rememberFingerprint(bytes32 market, bytes32 sourceId) external onlyCore {
        bytes32 integrationId = _integrationId(market, sourceId);
        fingerprintMarkets[integrationId] = market;
        fingerprintSources[integrationId] = sourceId;
    }

    function applyExternalFingerprint(bytes32 integrationId) external onlyCore {
        PendingFingerprint storage pending = pendingFingerprints[integrationId];
        if (pending.effectiveBlock == 0) revert LoopV1Errors.FingerprintInvalid(5);
        if (block.number < pending.effectiveBlock) revert LoopV1Errors.FingerprintTimelockNotElapsed();
        fingerprints[integrationId] = pending.fingerprint;
        fingerprintBaselines[integrationId] = pending.baseline;
        emit ExternalFingerprintUpdateApplied(integrationId, pending.fingerprint.fingerprintHash);
        emit ReclosedIntegration(integrationId);
        delete pendingFingerprints[integrationId];
    }

    // ---------------------------------------------------------------------
    // Internal validation + venue-read logic (moved verbatim; storage reads
    // rewired to `core_` getters)
    // ---------------------------------------------------------------------

    function _integrationId(bytes32 market, bytes32 sourceId) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("wstdiem.integration", market, sourceId));
    }

    function _requiredFingerprintSourceIds(uint8 primaryType) private pure returns (bytes32[] memory required) {
        if (primaryType == uint8(LoopV1Types.PrimaryType.REVOKE)) return new bytes32[](0);
        if (primaryType == uint8(LoopV1Types.PrimaryType.OPEN)) {
            required = new bytes32[](5);
            required[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
            required[1] = LoopV1Types.SOURCE_VAULT_NAV;
            required[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
            required[3] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
            required[4] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
            return required;
        }
        required = new bytes32[](6);
        required[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        required[1] = LoopV1Types.SOURCE_VAULT_NAV;
        required[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        required[3] = LoopV1Types.SOURCE_CURVE_QUOTE;
        required[4] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        required[5] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        return required;
    }

    function _validateConfiguredFingerprint(ILoopRegistry core_, bytes32 market, bytes32 sourceId) private view {
        address expected = _venueAddress(core_, market, sourceId);
        if (expected == address(0)) return;
        bytes32 integrationId = _integrationId(market, sourceId);
        LoopV1Types.ExternalProtocolFingerprint storage fp = fingerprints[integrationId];
        if (fp.integrationId == bytes32(0)) revert LoopV1Errors.ConfigIntegrityFailure();
        if (fp.integration != expected || _fingerprintHash(fp) != fp.fingerprintHash) {
            revert LoopV1Errors.FingerprintMismatch(1);
        }
        (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory current) =
            _liveFingerprint(core_, market, sourceId, expected, false);
        if (hard != fp.hardEqualityHash) revert LoopV1Errors.FingerprintMismatch(1);
        FingerprintBaseline storage baseline = fingerprintBaselines[integrationId];
        if (!_withinTolerance(sourceId, baseline, current)) revert LoopV1Errors.FingerprintMismatch(2);
        if (!_liveBaselineFresh(core_, sourceId, live, current)) revert LoopV1Errors.FingerprintMismatch(3);
        tolerance;
    }

    function _validateQueuedFingerprint(
        ILoopRegistry core_,
        bytes32 market,
        bytes32 sourceId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) private view returns (FingerprintBaseline memory baseline) {
        address expected = _venueAddress(core_, market, sourceId);
        if (expected == address(0) || fingerprint.integration != expected) revert LoopV1Errors.FingerprintInvalid(2);
        (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory current) =
            _liveFingerprint(core_, market, sourceId, expected, true);
        if (fingerprint.hardEqualityHash != hard) revert LoopV1Errors.FingerprintInvalid(1);
        if (fingerprint.toleranceBandHash != tolerance) revert LoopV1Errors.FingerprintInvalid(2);
        if (fingerprint.liveBaselineHash != live) revert LoopV1Errors.FingerprintInvalid(3);
        return current;
    }

    function _validateFingerprintShape(
        bytes32 integrationId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) private pure {
        if (fingerprint.integrationId != integrationId) {
            revert LoopV1Errors.FingerprintInvalid(1);
        }
        if (fingerprint.integration == address(0)) revert LoopV1Errors.FingerprintInvalid(2);
        if (fingerprint.liveBaselineHash == bytes32(0)) revert LoopV1Errors.FingerprintInvalid(3);
        if (_fingerprintHashCalldata(fingerprint) != fingerprint.fingerprintHash) {
            revert LoopV1Errors.FingerprintInvalid(4);
        }
    }

    function _venueAddress(ILoopRegistry core_, bytes32 market, bytes32 sourceId) private view returns (address) {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) return core_.morpho();
        if (sourceId == LoopV1Types.SOURCE_VAULT_NAV) return core_.wstDiemVault(market);
        if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) return core_.canonicalSource(market, sourceId);
        if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) return core_.curvePool(market);
        if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) return core_.canonicalSource(market, sourceId);
        if (sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT) {
            address pool = core_.uniswapV3FlashPool(market);
            return pool == address(0) ? core_.canonicalSource(market, sourceId) : pool;
        }
        return address(0);
    }

    function _fingerprintValidationEnabled(ILoopRegistry core_, bytes32 market) private view returns (bool) {
        return core_.uniswapV3FlashPool(market) != address(0)
            || core_.canonicalSource(market, LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT) != address(0);
    }

    function _liveFingerprint(ILoopRegistry core_, bytes32 market, bytes32 sourceId, address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) {
            return _morphoFingerprint(core_, market, integration, queueing);
        }
        if (sourceId == LoopV1Types.SOURCE_VAULT_NAV) return _vaultFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) return _chainlinkFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) return _curveFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) return _sequencerFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT) {
            return _uniswapFingerprint(core_, market, integration, queueing);
        }
        revert LoopV1Errors.FingerprintInvalid(6);
    }

    function _morphoFingerprint(ILoopRegistry core_, bytes32 market, address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IMorphoFingerprintReader(integration).idToMarketParams(market) returns (
            address loanToken, address collateralToken, address oracle, address irm, uint256 lltv
        ) {
            LoopV1Types.MorphoMarketParams memory stored = core_.marketParams(market);
            if (
                loanToken != stored.loanToken || collateralToken != stored.collateralToken || oracle != stored.oracle
                    || irm != stored.irm || lltv != stored.lltv
            ) {
                if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
                revert LoopV1Errors.FingerprintMismatch(1);
            }
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.morpho.hard.v1", integration, market, loanToken, collateralToken, oracle, irm, lltv
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.morpho.live.v1", market));
            return (hard, tolerance, live, baseline);
        } catch {
            if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
            revert LoopV1Errors.FingerprintMismatch(1);
        }
    }

    function _vaultFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IERC4626FingerprintReader(integration).asset() returns (address asset_) {
            try IERC4626FingerprintReader(integration).decimals() returns (uint8 decimals_) {
                try IERC4626FingerprintReader(integration).totalSupply() returns (uint256 supply) {
                    try IERC4626FingerprintReader(integration).totalAssets() returns (uint256 assets) {
                        try IERC4626FingerprintReader(integration).convertToAssets(WAD) returns (uint256 nav) {
                            if (supply == 0 || assets == 0 || nav == 0) {
                                if (queueing) revert LoopV1Errors.FingerprintInvalid(2);
                                revert LoopV1Errors.FingerprintMismatch(2);
                            }
                            baseline.value0 = nav;
                            hard = keccak256(abi.encode("wstdiem.fp.vault.hard.v1", integration, asset_, decimals_));
                            tolerance =
                                keccak256(abi.encode("wstdiem.fp.vault.tolerance.v1", nav, MAX_TOLERANCE_STEP_BPS));
                            live = keccak256(abi.encode("wstdiem.fp.vault.live.v1", supply != 0, assets != 0));
                            return (hard, tolerance, live, baseline);
                        } catch {}
                    } catch {}
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(2);
        revert LoopV1Errors.FingerprintMismatch(2);
    }

    function _chainlinkFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IChainlinkFingerprintReader(integration).aggregator() returns (address aggregator_) {
            try IChainlinkFingerprintReader(integration).decimals() returns (uint8 decimals_) {
                try IChainlinkFingerprintReader(integration).latestRoundData() returns (
                    uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80
                ) {
                    if (answer <= 0 || updatedAt == 0) {
                        if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
                        revert LoopV1Errors.FingerprintMismatch(3);
                    }
                    baseline.updatedAt = updatedAt;
                    uint16 phaseId = uint16(roundId >> 64);
                    hard = keccak256(
                        abi.encode("wstdiem.fp.chainlink.hard.v1", integration, aggregator_, decimals_, phaseId)
                    );
                    tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
                    live = keccak256(abi.encode("wstdiem.fp.chainlink.live.v1", updatedAt));
                    return (hard, tolerance, live, baseline);
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
        revert LoopV1Errors.FingerprintMismatch(3);
    }

    function _curveFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try ICurveFingerprintReader(integration).coins(0) returns (address coin0) {
            try ICurveFingerprintReader(integration).coins(1) returns (address coin1) {
                try ICurveFingerprintReader(integration).A() returns (uint256 amplification) {
                    try ICurveFingerprintReader(integration).fee() returns (uint256 fee_) {
                        try ICurveFingerprintReader(integration).balances(0) returns (uint256 balance0) {
                            try ICurveFingerprintReader(integration).balances(1) returns (uint256 balance1) {
                                baseline.value0 = balance0;
                                baseline.value1 = balance1;
                                hard = keccak256(
                                    abi.encode(
                                        "wstdiem.fp.curve.hard.v1", integration, coin0, coin1, amplification, fee_
                                    )
                                );
                                tolerance = keccak256(
                                    abi.encode(
                                        "wstdiem.fp.curve.tolerance.v1", balance0, balance1, MAX_TOLERANCE_STEP_BPS
                                    )
                                );
                                live = keccak256(abi.encode("wstdiem.fp.curve.live.v1", block.number));
                                return (hard, tolerance, live, baseline);
                            } catch {}
                        } catch {}
                    } catch {}
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(2);
        revert LoopV1Errors.FingerprintMismatch(2);
    }

    function _sequencerFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IChainlinkFingerprintReader(integration).decimals() returns (uint8 decimals_) {
            try IChainlinkFingerprintReader(integration).latestRoundData() returns (
                uint80, int256 answer, uint256 startedAt, uint256, uint80
            ) {
                if (answer != 0 || block.timestamp < startedAt + SEQUENCER_GRACE_SECONDS) {
                    if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
                    revert LoopV1Errors.FingerprintMismatch(3);
                }
                baseline.updatedAt = startedAt;
                hard = keccak256(abi.encode("wstdiem.fp.sequencer.hard.v1", integration, decimals_));
                tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
                live = keccak256(abi.encode("wstdiem.fp.sequencer.live.v1", startedAt));
                return (hard, tolerance, live, baseline);
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
        revert LoopV1Errors.FingerprintMismatch(3);
    }

    function _uniswapFingerprint(ILoopRegistry core_, bytes32 market, address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IUniswapV3PoolFingerprintReader(integration).factory() returns (address factory_) {
            try IUniswapV3PoolFingerprintReader(integration).token0() returns (address token0_) {
                try IUniswapV3PoolFingerprintReader(integration).token1() returns (address token1_) {
                    try IUniswapV3PoolFingerprintReader(integration).fee() returns (uint24 fee_) {
                        try IUniswapV3PoolFingerprintReader(integration).tickSpacing() returns (int24 tickSpacing_) {
                            try IUniswapV3PoolFingerprintReader(integration).liquidity() returns (uint128 liquidity_) {
                                try IUniswapV3PoolFingerprintReader(integration).slot0() returns (
                                    uint160, int24 tick, uint16, uint16, uint16, uint8, bool
                                ) {
                                    if (
                                        factory_ != core_.uniswapV3Factory(market)
                                            || fee_ != core_.uniswapV3FlashFeeTier(market)
                                    ) {
                                        if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
                                        revert LoopV1Errors.FingerprintMismatch(1);
                                    }
                                    baseline.value0 = uint256(liquidity_);
                                    baseline.signedValue = tick;
                                    hard = keccak256(
                                        abi.encode(
                                            "wstdiem.fp.uniswap.hard.v1",
                                            integration,
                                            factory_,
                                            token0_,
                                            token1_,
                                            fee_,
                                            tickSpacing_
                                        )
                                    );
                                    tolerance = keccak256(
                                        abi.encode(
                                            "wstdiem.fp.uniswap.tolerance.v1", liquidity_, MAX_TOLERANCE_STEP_BPS
                                        )
                                    );
                                    live = keccak256(abi.encode("wstdiem.fp.uniswap.live.v1", tick));
                                    return (hard, tolerance, live, baseline);
                                } catch {}
                            } catch {}
                        } catch {}
                    } catch {}
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
        revert LoopV1Errors.FingerprintMismatch(1);
    }

    function _withinTolerance(
        bytes32 sourceId,
        FingerprintBaseline storage baseline,
        FingerprintBaseline memory current
    ) private view returns (bool) {
        if (sourceId == LoopV1Types.SOURCE_VAULT_NAV || sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT) {
            return _withinBps(baseline.value0, current.value0, MAX_TOLERANCE_STEP_BPS);
        }
        if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) {
            return _withinBps(baseline.value0, current.value0, MAX_TOLERANCE_STEP_BPS)
                && _withinBps(baseline.value1, current.value1, MAX_TOLERANCE_STEP_BPS);
        }
        return true;
    }

    function _withinBps(uint256 baseline, uint256 current, uint16 bps) private pure returns (bool) {
        if (baseline == 0) return current == 0;
        uint256 delta = baseline > current ? baseline - current : current - baseline;
        return delta * 10_000 <= baseline * bps;
    }

    function _liveBaselineFresh(ILoopRegistry core_, bytes32 sourceId, bytes32 liveHash, FingerprintBaseline memory current)
        private
        view
        returns (bool)
    {
        liveHash;
        if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) {
            uint256 threshold = core_.sourceFreshnessThreshold(sourceId);
            return threshold == 0 || block.timestamp <= current.updatedAt + threshold;
        }
        if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) {
            return block.timestamp >= current.updatedAt + SEQUENCER_GRACE_SECONDS;
        }
        return true;
    }

    function _fingerprintHash(LoopV1Types.ExternalProtocolFingerprint storage fingerprint)
        private
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                fingerprint.integrationId,
                fingerprint.integration,
                fingerprint.hardEqualityHash,
                fingerprint.toleranceBandHash,
                fingerprint.liveBaselineHash,
                fingerprint.registryVersion
            )
        );
    }

    function _fingerprintHashCalldata(LoopV1Types.ExternalProtocolFingerprint calldata fingerprint)
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                fingerprint.integrationId,
                fingerprint.integration,
                fingerprint.hardEqualityHash,
                fingerprint.toleranceBandHash,
                fingerprint.liveBaselineHash,
                fingerprint.registryVersion
            )
        );
    }
}
