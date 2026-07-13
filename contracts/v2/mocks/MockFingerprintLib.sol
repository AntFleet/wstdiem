// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopRegistry} from "../LoopRegistry.sol";
import {LoopV1Types} from "../libraries/LoopV1Types.sol";

interface IVaultFpView {
    function asset() external view returns (address);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

interface IChainlinkFpView {
    function aggregator() external view returns (address);
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface ICurveFpView {
    function coins(uint256 i) external view returns (address);
    function A() external view returns (uint256);
    function fee() external view returns (uint256);
    function balances(uint256 i) external view returns (uint256);
}

interface IUniswapV3FpView {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function liquidity() external view returns (uint128);
    function slot0() external view returns (uint160, int24 tick, uint16, uint16, uint16, uint8, bool);
}

/// @notice Single source of truth for the mock external-protocol fingerprint hashes. Used by both
///         `MockDeploymentKit` (local in-process deploy path) and `MockFingerprintBootstrapper`
///         (live on-chain atomic queue path), so the two can never drift.
/// @dev These formulas MUST mirror `LoopRegistry._liveFingerprint` exactly. Note that the curve and
///      chainlink live baselines are block-sensitive (`block.number` / `updatedAt`), so a fingerprint
///      is only valid in the block it is computed in — the live queue therefore MUST compute and
///      submit in a single transaction (see `MockFingerprintBootstrapper`).
library MockFingerprintLib {
    uint16 internal constant MAX_TOLERANCE_STEP_BPS = 50;

    struct MarketParams {
        bytes32 id;
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    function integrationId(bytes32 market, bytes32 sourceId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("wstdiem.integration", market, sourceId));
    }

    function fingerprintHashes(bytes32 sourceId, address integration, MarketParams memory m)
        internal
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live)
    {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) {
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.morpho.hard.v1",
                    integration,
                    m.id,
                    m.loanToken,
                    m.collateralToken,
                    m.oracle,
                    m.irm,
                    m.lltv
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.morpho.live.v1", m.id));
        } else if (sourceId == LoopV1Types.SOURCE_VAULT_NAV) {
            IVaultFpView vault = IVaultFpView(integration);
            uint256 nav = vault.convertToAssets(1e18);
            hard = keccak256(abi.encode("wstdiem.fp.vault.hard.v1", integration, vault.asset(), vault.decimals()));
            tolerance = keccak256(abi.encode("wstdiem.fp.vault.tolerance.v1", nav, MAX_TOLERANCE_STEP_BPS));
            live = keccak256(
                abi.encode("wstdiem.fp.vault.live.v1", vault.totalSupply() != 0, vault.totalAssets() != 0)
            );
        } else if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) {
            IChainlinkFpView feed = IChainlinkFpView(integration);
            (uint80 roundId,,, uint256 updatedAt,) = feed.latestRoundData();
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.chainlink.hard.v1", integration, feed.aggregator(), feed.decimals(), uint16(roundId >> 64)
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.chainlink.live.v1", updatedAt));
        } else if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) {
            ICurveFpView curve = ICurveFpView(integration);
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.curve.hard.v1", integration, curve.coins(0), curve.coins(1), curve.A(), curve.fee()
                )
            );
            tolerance = keccak256(
                abi.encode(
                    "wstdiem.fp.curve.tolerance.v1", curve.balances(0), curve.balances(1), MAX_TOLERANCE_STEP_BPS
                )
            );
            live = keccak256(abi.encode("wstdiem.fp.curve.live.v1", block.number));
        } else if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) {
            IChainlinkFpView feed = IChainlinkFpView(integration);
            (,, uint256 startedAt,,) = feed.latestRoundData();
            hard = keccak256(abi.encode("wstdiem.fp.sequencer.hard.v1", integration, feed.decimals()));
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.sequencer.live.v1", startedAt));
        } else {
            IUniswapV3FpView pool = IUniswapV3FpView(integration);
            (, int24 tick,,,,,) = pool.slot0();
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.uniswap.hard.v1",
                    integration,
                    pool.factory(),
                    pool.token0(),
                    pool.token1(),
                    pool.fee(),
                    pool.tickSpacing()
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.uniswap.tolerance.v1", pool.liquidity(), MAX_TOLERANCE_STEP_BPS));
            live = keccak256(abi.encode("wstdiem.fp.uniswap.live.v1", tick));
        }
    }

    function buildFingerprint(
        LoopRegistry registry,
        bytes32 sourceId,
        address integration,
        MarketParams memory m
    ) internal view returns (LoopV1Types.ExternalProtocolFingerprint memory fp) {
        fp.integrationId = integrationId(m.id, sourceId);
        fp.integration = integration;
        (fp.hardEqualityHash, fp.toleranceBandHash, fp.liveBaselineHash) = fingerprintHashes(sourceId, integration, m);
        fp.registryVersion = registry.registryVersion();
        fp.fingerprintHash = keccak256(
            abi.encode(
                fp.integrationId,
                fp.integration,
                fp.hardEqualityHash,
                fp.toleranceBandHash,
                fp.liveBaselineHash,
                fp.registryVersion
            )
        );
    }
}
