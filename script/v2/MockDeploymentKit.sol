// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonBase} from "forge-std/Base.sol";

import {EmergencyGuardian} from "../../contracts/v2/EmergencyGuardian.sol";
import {LoopAnchorRegistry} from "../../contracts/v2/LoopAnchorRegistry.sol";
import {LoopAuthorization} from "../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorV2} from "../../contracts/v2/LoopExecutorV2.sol";
import {LoopFeeRouter} from "../../contracts/v2/LoopFeeRouter.sol";
import {LoopForceExitAuthorizer} from "../../contracts/v2/LoopForceExitAuthorizer.sol";
import {LoopForceExitExecutor} from "../../contracts/v2/LoopForceExitExecutor.sol";
import {LoopRegistry} from "../../contracts/v2/LoopRegistry.sol";
import {LoopRiskOracleAdapter} from "../../contracts/v2/LoopRiskOracleAdapter.sol";
import {ILoopRegistry} from "../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopV1Types} from "../../contracts/v2/libraries/LoopV1Types.sol";

import {MockChainlinkFeed, MockSequencerFeed} from "../../contracts/v2/mocks/MockChainlinkFeed.sol";
import {MockCurvePool} from "../../contracts/v2/mocks/MockCurvePool.sol";
import {MockERC20} from "../../contracts/v2/mocks/MockERC20.sol";
import {MockMorpho, MockMorphoOracle, MockMorphoIrm} from "../../contracts/v2/mocks/MockMorpho.sol";
import {MockUniswapV3FlashPool, MockUniswapV3Factory} from "../../contracts/v2/mocks/MockUniswapV3.sol";
import {MockWstDiemVault} from "../../contracts/v2/mocks/MockWstDiemVault.sol";

import {DeploymentManifest} from "./DeploymentManifest.sol";

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
    function slot0()
        external
        view
        returns (uint160, int24 tick, uint16, uint16, uint16, uint8, bool);
}

/// @notice Deploys mock external protocols + the full wstDIEM v2 system on a local EVM and pins
///         the external-protocol fingerprints, producing a system ready for open/exit smoke.
/// @dev Shared by `DeployMocks.s.sol` (deploy prep) and `MockDeploymentE2E.t.sol` (local proof).
///      The fingerprint queue -> timelock -> apply cycle is executed here with `vm.roll`, so this
///      kit models the *local* deployment path. On a real Base Sepolia broadcast the apply step is
///      a second transaction sent after `REGISTRY_TIMELOCK_BLOCKS` (130_000) have elapsed.
abstract contract MockDeploymentKit is CommonBase {
    uint16 internal constant MAX_TOLERANCE_STEP_BPS = 50;
    uint256 internal constant REGISTRY_TIMELOCK_BLOCKS = 130_000;
    uint24 internal constant FLASH_FEE_TIER = 500;
    int24 internal constant UNI_TICK_SPACING = 10;
    uint256 internal constant LLTV = 860000000000000000; // 0.86 WAD

    struct MockAddresses {
        MockERC20 loanToken; // DIEM
        MockERC20 collateralToken; // wstDIEM share
        MockMorphoOracle morphoOracle;
        MockMorphoIrm morphoIrm;
        MockMorpho morpho;
        MockWstDiemVault vault;
        MockCurvePool curve;
        MockUniswapV3Factory uniFactory;
        MockUniswapV3FlashPool uniPool;
        MockChainlinkFeed chainlink;
        MockSequencerFeed sequencer;
        bytes32 marketId;
    }

    /// @notice Deploys mock venues, wires the core protocol, and pins fingerprints.
    /// @param operator Address that owns/operates the registry through bootstrap. Must be the
    ///        `msg.sender` of the registry calls: the executing test contract, or (under a script
    ///        broadcast) the broadcasting deployer EOA.
    /// @param governance Address wired as the governance role and pinned in the config/manifest.
    function _deployFullMockSystem(address operator, address governance)
        internal
        returns (
            MockAddresses memory mocks,
            DeploymentManifest.DeploymentConfig memory config,
            DeploymentManifest.DeployedContracts memory deployed,
            LoopRegistry registry
        )
    {
        // Sequencer grace + chainlink freshness need a realistic, non-zero timestamp.
        if (block.timestamp < 1_000_000) vm.warp(1_000_000);

        mocks = _deployMockVenues();
        config = _buildConfig(mocks, governance);
        (deployed, registry) = _deployCore(config, operator);
        _seedMockLiquidity(mocks);
        _bootstrapMockFingerprints(config, registry);

        // Executor is the KEEPER_PERMISSIONLESS execution caller for open/exit.
        registry.setPermissionlessCallerAllowed(deployed.executorV2, true);
        // High-tier: hard spender allowlist for production-shaped deploys/tests.
        registry.setSpendAllowlistEnforced(true);
        // Post-bootstrap: freeze immediate batchUpdate; further config needs queue+timelock.
        registry.closeBootstrap();
        // 2026-06-17 deploy fail-closed: refuse incomplete bootstrap wiring.
        registry.assertProductionReadiness(mocks.marketId);
    }

    function _deployMockVenues() internal returns (MockAddresses memory mocks) {
        MockERC20 diem = new MockERC20("Mock DIEM", "DIEM", 18);
        MockERC20 wstDiem = new MockERC20("Mock wstDIEM", "wstDIEM", 18);
        mocks.loanToken = diem;
        mocks.collateralToken = wstDiem;
        mocks.morphoOracle = new MockMorphoOracle(1e18);
        mocks.morphoIrm = new MockMorphoIrm();
        mocks.morpho = new MockMorpho();
        mocks.vault = new MockWstDiemVault(address(diem), address(wstDiem), 18);
        mocks.curve = new MockCurvePool(address(diem), address(wstDiem));

        MockUniswapV3Factory factory = new MockUniswapV3Factory();
        (address t0, address t1) =
            address(diem) < address(wstDiem) ? (address(diem), address(wstDiem)) : (address(wstDiem), address(diem));
        MockUniswapV3FlashPool pool = new MockUniswapV3FlashPool(address(factory), t0, t1, FLASH_FEE_TIER, UNI_TICK_SPACING);
        factory.registerPool(address(diem), address(wstDiem), FLASH_FEE_TIER, address(pool));
        mocks.uniFactory = factory;
        mocks.uniPool = pool;

        mocks.chainlink = new MockChainlinkFeed(8, 2000e8, 1);
        mocks.sequencer = new MockSequencerFeed();

        LoopV1Types.MorphoMarketParams memory params = LoopV1Types.MorphoMarketParams({
            loanToken: address(diem),
            collateralToken: address(wstDiem),
            oracle: address(mocks.morphoOracle),
            irm: address(mocks.morphoIrm),
            lltv: LLTV
        });
        mocks.marketId = mocks.morpho.createMarket(params, uint128(1_000_000_000 ether));
    }

    function _seedMockLiquidity(MockAddresses memory mocks) internal {
        // Flash pool, Morpho, and curve must hold enough loan token to serve their legs.
        mocks.loanToken.mint(address(mocks.uniPool), 100_000_000 ether);
        mocks.loanToken.mint(address(mocks.morpho), 100_000_000 ether);
        mocks.loanToken.mint(address(mocks.curve), 100_000_000 ether);
        // Pool also holds the collateral side for completeness of the flash surface.
        mocks.collateralToken.mint(address(mocks.uniPool), 100_000_000 ether);
    }

    function _buildConfig(MockAddresses memory mocks, address governance)
        internal
        view
        returns (DeploymentManifest.DeploymentConfig memory config)
    {
        config.chainId = block.chainid;
        config.governanceMultisig = governance;
        config.initialGuardian = address(uint160(governance) ^ 0x1111);
        config.anchorSubmitter = address(0xA11C0DE);
        config.indexerSigningKey = address(0x1ADE);
        config.protocolFeeReceiver = address(0xFEE1);
        config.automationFeeReceiver = address(0xFEE2);
        config.anchorCadenceBlocks = 100;
        config.harvestCoolingBlocks = 30;
        config.forceExitMaxDeadlineSeconds = 1 days;
        config.attemptThrottleWindowBlocks = 60;
        config.maxFailedAttemptsPerWindow = 5;
        config.market = DeploymentManifest.MarketConfig({
            id: mocks.marketId,
            loanToken: address(mocks.loanToken),
            collateralToken: address(mocks.collateralToken),
            oracle: address(mocks.morphoOracle),
            irm: address(mocks.morphoIrm),
            lltv: LLTV,
            curvePool: address(mocks.curve),
            wstDiemVault: address(mocks.vault),
            uniswapV3Factory: address(mocks.uniFactory),
            uniswapV3FlashPool: address(mocks.uniPool),
            uniswapV3FlashFeeTier: FLASH_FEE_TIER,
            chainlinkFeed: address(mocks.chainlink),
            sequencerFeed: address(mocks.sequencer),
            morpho: address(mocks.morpho)
        });
    }

    /// @dev Mirrors `Deploy.s.sol`, minus the final ownership transfer. The registry is owned by the
    ///      executing contract (`address(this)` — this script or test) so it can drive the
    ///      fingerprint bootstrap and permissionless-caller setup; `governanceMultisig` is still
    ///      wired as the governance *role*. A real broadcast would transfer ownership to governance
    ///      after the (timelocked) fingerprint apply.
    function _deployCore(DeploymentManifest.DeploymentConfig memory config, address operator)
        internal
        returns (DeploymentManifest.DeployedContracts memory deployed, LoopRegistry registry)
    {
        registry = new LoopRegistry(operator);
        LoopForceExitAuthorizer forceExitAuthorizer = new LoopForceExitAuthorizer(registry);
        LoopAuthorization authorization = new LoopAuthorization(registry);
        LoopRiskOracleAdapter riskOracle = new LoopRiskOracleAdapter(registry);
        LoopFeeRouter feeRouter = new LoopFeeRouter(
            registry, config.governanceMultisig, config.protocolFeeReceiver, config.automationFeeReceiver
        );
        LoopAnchorRegistry anchorRegistry = new LoopAnchorRegistry(registry);
        EmergencyGuardian guardian = new EmergencyGuardian(config.governanceMultisig, config.initialGuardian);
        LoopExecutorV2 executor = new LoopExecutorV2(authorization, registry, guardian);
        LoopForceExitExecutor forceExitExecutor = new LoopForceExitExecutor(authorization, registry, guardian);

        deployed = DeploymentManifest.DeployedContracts({
            registry: address(registry),
            forceExitAuthorizer: address(forceExitAuthorizer),
            authorization: address(authorization),
            executorV2: address(executor),
            forceExitExecutor: address(forceExitExecutor),
            riskOracleAdapter: address(riskOracle),
            feeRouter: address(feeRouter),
            anchorRegistry: address(anchorRegistry),
            emergencyGuardian: address(guardian)
        });

        bytes32 deploymentHash = DeploymentManifest.deploymentHash(config, deployed);
        bytes32 initialRoot = DeploymentManifest.initialRoot(deploymentHash);
        ILoopRegistry.BatchOp[] memory ops = DeploymentManifest.buildInitialOps(config, deployed);
        registry.batchUpdate(ops, 1, initialRoot);

        registry.setLoopRiskOracleAdapter(address(riskOracle));
        registry.setHarvestCoolingBlocks(config.harvestCoolingBlocks);
        registry.setForceExitMaxDeadlineSeconds(config.forceExitMaxDeadlineSeconds);
        registry.setAttemptThrottleWindowBlocks(config.attemptThrottleWindowBlocks);
        registry.setMaxFailedAttemptsPerWindow(config.maxFailedAttemptsPerWindow);
        registry.setAnchorCadenceBlocks(config.anchorCadenceBlocks);
        registry.setIndexerSigningKey(config.indexerSigningKey);
        registry.setAnchorSubmitter(config.anchorSubmitter);
        registry.setEmergencyGuardian(address(guardian));
        registry.setGovernanceRole(config.governanceMultisig);
        registry.setSourceFreshnessThreshold(LoopV1Types.SOURCE_CHAINLINK_FEED, 86_400);
    }

    /// @dev The six external-protocol source ids the mock market pins fingerprints for, paired with
    ///      the integration address each one covers. Shared by the queue + apply paths (and the live
    ///      2-phase Sepolia script) so their integrationId derivation can never drift.
    function _mockFingerprintSourceIds() internal pure returns (bytes32[] memory sourceIds) {
        sourceIds = new bytes32[](6);
        sourceIds[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        sourceIds[1] = LoopV1Types.SOURCE_VAULT_NAV;
        sourceIds[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        sourceIds[3] = LoopV1Types.SOURCE_CURVE_QUOTE;
        sourceIds[4] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        sourceIds[5] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
    }

    function _mockFingerprintSources(DeploymentManifest.DeploymentConfig memory config)
        internal
        pure
        returns (bytes32[] memory sourceIds, address[] memory integrations)
    {
        sourceIds = _mockFingerprintSourceIds();
        integrations = new address[](6);
        integrations[0] = config.market.morpho;
        integrations[1] = config.market.wstDiemVault;
        integrations[2] = config.market.chainlinkFeed;
        integrations[3] = config.market.curvePool;
        integrations[4] = config.market.sequencerFeed;
        integrations[5] = config.market.uniswapV3FlashPool;
    }

    /// @dev Rebuild the six integrationIds for a market from just its id — lets the phase-2 apply
    ///      run in a fresh process (no in-memory config) and reference the queued pending entries.
    function _marketIntegrationIds(bytes32 marketId) internal pure returns (bytes32[] memory integrationIds) {
        bytes32[] memory sourceIds = _mockFingerprintSourceIds();
        integrationIds = new bytes32[](sourceIds.length);
        for (uint256 i = 0; i < sourceIds.length; i++) {
            integrationIds[i] = _integrationId(marketId, sourceIds[i]);
        }
    }

    /// @dev Phase 1 (broadcastable on a live chain): queue the six fingerprints. Returns the
    ///      integrationIds so the apply phase can reference the same pending entries.
    function _queueMockFingerprints(
        DeploymentManifest.DeploymentConfig memory config,
        LoopRegistry registry
    ) internal returns (bytes32[] memory integrationIds) {
        (bytes32[] memory sourceIds, address[] memory integrations) = _mockFingerprintSources(config);
        integrationIds = new bytes32[](sourceIds.length);
        for (uint256 i = 0; i < sourceIds.length; i++) {
            bytes32 integrationId = _integrationId(config.market.id, sourceIds[i]);
            integrationIds[i] = integrationId;
            registry.queueExternalFingerprintUpdate(
                integrationId, _fingerprint(config, registry, sourceIds[i], integrations[i])
            );
        }
    }

    /// @dev Phase 2 (broadcastable only after `REGISTRY_TIMELOCK_BLOCKS` has elapsed on the live
    ///      chain): apply the previously-queued fingerprints in one batch.
    function _applyMockFingerprints(LoopRegistry registry, bytes32[] memory integrationIds) internal {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](integrationIds.length);
        for (uint256 i = 0; i < integrationIds.length; i++) {
            ops[i] = ILoopRegistry.BatchOp({op: 14, data: abi.encode(integrationIds[i])}); // OP_APPLY_EXTERNAL_FINGERPRINT
        }
        registry.batchUpdate(ops, registry.registryVersion() + 1, keccak256("wstdiem.mock.fingerprints"));
    }

    /// @dev Queues the six external-protocol fingerprints, crosses the registry timelock, and
    ///      applies them atomically — the same sequence `BaseMainnetForkSetup` runs against live
    ///      Base state, here against the mock venues. Local-only: `vm.roll` is a cheatcode that
    ///      cannot advance a real chain, so a live broadcast must use the queue/apply split above.
    function _bootstrapMockFingerprints(
        DeploymentManifest.DeploymentConfig memory config,
        LoopRegistry registry
    ) internal {
        bytes32[] memory integrationIds = _queueMockFingerprints(config, registry);
        vm.roll(block.number + REGISTRY_TIMELOCK_BLOCKS);
        _applyMockFingerprints(registry, integrationIds);
    }

    function _integrationId(bytes32 market, bytes32 sourceId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("wstdiem.integration", market, sourceId));
    }

    function _fingerprint(
        DeploymentManifest.DeploymentConfig memory config,
        LoopRegistry registry,
        bytes32 sourceId,
        address integration
    ) internal view returns (LoopV1Types.ExternalProtocolFingerprint memory fp) {
        fp.integrationId = _integrationId(config.market.id, sourceId);
        fp.integration = integration;
        (fp.hardEqualityHash, fp.toleranceBandHash, fp.liveBaselineHash) =
            _fingerprintHashes(config, sourceId, integration);
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

    function _fingerprintHashes(
        DeploymentManifest.DeploymentConfig memory config,
        bytes32 sourceId,
        address integration
    ) internal view returns (bytes32 hard, bytes32 tolerance, bytes32 live) {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) {
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.morpho.hard.v1",
                    integration,
                    config.market.id,
                    config.market.loanToken,
                    config.market.collateralToken,
                    config.market.oracle,
                    config.market.irm,
                    config.market.lltv
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.morpho.live.v1", config.market.id));
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
            (, , uint256 startedAt,,) = feed.latestRoundData();
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
}
