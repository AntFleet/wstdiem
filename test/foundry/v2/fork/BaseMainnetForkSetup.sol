// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {EmergencyGuardian} from "../../../../contracts/v2/EmergencyGuardian.sol";
import {LoopAuthorization} from "../../../../contracts/v2/LoopAuthorization.sol";
import {LoopRegistry} from "../../../../contracts/v2/LoopRegistry.sol";
import {LoopRiskOracleAdapter} from "../../../../contracts/v2/LoopRiskOracleAdapter.sol";
import {ILoopRegistry} from "../../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopV1EIP712} from "../../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Hashing} from "../../../../contracts/v2/libraries/LoopV1Hashing.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {DeploymentManifest} from "../../../../script/v2/DeploymentManifest.sol";
import {DeployHarness} from "../helpers/DeployHarness.sol";
import {RegistryBatchHelpers} from "../helpers/RegistryBatchHelpers.sol";
import {ForkMock4626Vault, ForkMockCurvePool} from "./helpers/ForkTokenMock.sol";
import {ForkVenuePicker} from "./helpers/ForkVenuePicker.sol";

interface IForkMorpho {
    function idToMarketParams(bytes32 market)
        external
        view
        returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv);
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
    function setAuthorization(address authorized, bool newIsAuthorized) external;
}

interface IForkChainlink {
    function aggregator() external view returns (address);
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IForkUniswapV3Pool {
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

interface IForkVault {
    function asset() external view returns (address);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

interface IForkCurvePool {
    function coins(uint256 i) external view returns (address);
    function balances(uint256 i) external view returns (uint256);
    function A() external view returns (uint256);
    function fee() external view returns (uint256);
    function oracle() external view returns (uint256);
}

interface IForkUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

abstract contract BaseMainnetForkSetup is Test, DeployHarness, RegistryBatchHelpers {
    using LoopV1Hashing for LoopV1EIP712.Open;

    uint256 internal constant FORK_BLOCK_NUMBER = 47_264_207;
    string internal constant BASE_RPC_ENV = "BASE_RPC_URL";
    uint256 internal constant OWNER_PK = 0xA11CE;
    uint256 internal constant FP_TIMELOCK_BLOCKS = 130_000;

    ForkVenuePicker.Venues internal venues;
    DeploymentManifest.DeployedContracts internal deployed;
    LoopRegistry internal registry;
    EmergencyGuardian internal guardian;
    LoopAuthorization internal auth;
    LoopRiskOracleAdapter internal riskOracle;
    address internal owner;
    bool internal forkActive;

    function setUp() public virtual {
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
        _bootstrapFingerprintsFromLive();
        registry.setPermissionlessCallerAllowed(address(this), true);
    }

    function _pickProxyVenues() internal {
        ForkMock4626Vault vault = new ForkMock4626Vault(ForkVenuePicker.WETH, 18);
        ForkMockCurvePool curve = new ForkMockCurvePool(ForkVenuePicker.USDC, ForkVenuePicker.WETH);
        venues = ForkVenuePicker.Venues({
            market: ForkVenuePicker.USDC_WETH_MARKET,
            params: LoopV1Types.MorphoMarketParams({
                loanToken: ForkVenuePicker.USDC,
                collateralToken: ForkVenuePicker.WETH,
                oracle: ForkVenuePicker.MORPHO_ORACLE,
                irm: ForkVenuePicker.MORPHO_IRM,
                lltv: ForkVenuePicker.LLTV
            }),
            morpho: ForkVenuePicker.MORPHO,
            curvePool: address(curve),
            vault: address(vault),
            uniswapFactory: ForkVenuePicker.UNISWAP_V3_FACTORY,
            uniswapPool: ForkVenuePicker.USDC_WETH_500_POOL,
            uniswapFeeTier: ForkVenuePicker.UNISWAP_FEE_TIER,
            chainlinkFeed: ForkVenuePicker.ETH_USD_CHAINLINK_FEED,
            sequencerFeed: ForkVenuePicker.BASE_SEQUENCER_FEED
        });
    }

    function _deployProtocol() internal {
        DeploymentManifest.DeploymentConfig memory config;
        config.chainId = block.chainid;
        config.governanceMultisig = address(this);
        config.initialGuardian = address(0xA11CE);
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
            id: venues.market,
            loanToken: venues.params.loanToken,
            collateralToken: venues.params.collateralToken,
            oracle: venues.params.oracle,
            irm: venues.params.irm,
            lltv: venues.params.lltv,
            curvePool: venues.curvePool,
            wstDiemVault: venues.vault,
            uniswapV3Factory: venues.uniswapFactory,
            uniswapV3FlashPool: venues.uniswapPool,
            uniswapV3FlashFeeTier: venues.uniswapFeeTier,
            chainlinkFeed: venues.chainlinkFeed,
            sequencerFeed: venues.sequencerFeed,
            morpho: venues.morpho
        });
        bytes32 deploymentHash;
        (deployed, registry, guardian, deploymentHash) = _deploy(config);
        deploymentHash;
        auth = LoopAuthorization(deployed.authorization);
        riskOracle = LoopRiskOracleAdapter(deployed.riskOracleAdapter);
        registry.setSourceFreshnessThreshold(LoopV1Types.SOURCE_CHAINLINK_FEED, 86_400);
    }

    function _bootstrapFingerprintsFromLive() internal {
        bytes32[] memory sourceIds = new bytes32[](6);
        address[] memory integrations = new address[](6);
        sourceIds[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        integrations[0] = venues.morpho;
        sourceIds[1] = LoopV1Types.SOURCE_VAULT_NAV;
        integrations[1] = venues.vault;
        sourceIds[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        integrations[2] = venues.chainlinkFeed;
        sourceIds[3] = LoopV1Types.SOURCE_CURVE_QUOTE;
        integrations[3] = venues.curvePool;
        sourceIds[4] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        integrations[4] = venues.sequencerFeed;
        sourceIds[5] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        integrations[5] = venues.uniswapPool;

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](sourceIds.length);
        for (uint256 i = 0; i < sourceIds.length; i++) {
            bytes32 integrationId = _integrationId(sourceIds[i]);
            registry.queueExternalFingerprintUpdate(integrationId, _fingerprint(sourceIds[i], integrations[i]));
            ops[i] = _opApplyFingerprint(integrationId);
        }
        vm.roll(block.number + FP_TIMELOCK_BLOCKS);
        _commit(registry, ops, keccak256("pb8.live.fingerprints"));
    }

    function _installTestExecutor(address executor, uint8 primaryType) internal {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(primaryType, executor);
        _commit(registry, ops, keccak256(abi.encode("pb8.executor", executor, primaryType, block.number)));
        registry.setPermissionlessCallerAllowed(executor, true);
    }

    function _openAction(address executor, uint248 nonceSlot, uint8 nonceBit)
        internal
        view
        returns (LoopV1EIP712.Open memory action)
    {
        action.identity = LoopV1EIP712.ActionIdentity({
            owner: owner,
            chainId: block.chainid,
            verifyingContract: address(auth),
            market: venues.market,
            executor: executor,
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: 0,
            nonceSlot: nonceSlot,
            nonceBit: nonceBit
        });
        action.freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 hours,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 20,
            maxQuoteDeviationBps: 0
        });
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = venues.params;
        action.bounds.minWstDiemReceived = 0.01 ether;
        action.bounds.minBorrowedDiem = 1e6;
        action.bounds.maxBorrowedDiem = 2e6;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(owner);
    }

    function _emptyEvidence() internal view returns (LoopV1Types.ActionEvidence memory evidence) {
        evidence.owner = owner;
        evidence.market = venues.market;
        evidence.blockNumber = block.number;
    }

    function _emptyEvidenceHash(address evidenceOwner) internal view returns (bytes32) {
        LoopV1Types.EvidenceSource[] memory sources = new LoopV1Types.EvidenceSource[](0);
        return keccak256(
            abi.encode(
                LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
                bytes32(0),
                bytes32(0),
                evidenceOwner,
                venues.market,
                block.number,
                uint16(0),
                keccak256(abi.encode(sources))
            )
        );
    }

    function _sign(uint256 privateKey, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _integrationId(bytes32 sourceId) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("wstdiem.integration", venues.market, sourceId));
    }

    function _fingerprint(bytes32 sourceId, address integration)
        internal
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory fp)
    {
        fp.integrationId = _integrationId(sourceId);
        fp.integration = integration;
        (fp.hardEqualityHash, fp.toleranceBandHash, fp.liveBaselineHash) = _fingerprintHashes(sourceId, integration);
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

    function _fingerprintHashes(bytes32 sourceId, address integration)
        internal
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live)
    {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) {
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.morpho.hard.v1",
                    integration,
                    venues.market,
                    venues.params.loanToken,
                    venues.params.collateralToken,
                    venues.params.oracle,
                    venues.params.irm,
                    venues.params.lltv
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.morpho.live.v1", venues.market));
        } else if (sourceId == LoopV1Types.SOURCE_VAULT_NAV) {
            uint256 nav = IForkVault(integration).convertToAssets(1e18);
            hard = keccak256(
                abi.encode("wstdiem.fp.vault.hard.v1", integration, IForkVault(integration).asset(), uint8(18))
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.vault.tolerance.v1", nav, uint16(50)));
            live = keccak256(abi.encode("wstdiem.fp.vault.live.v1", true, true));
        } else if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) {
            (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
                IForkChainlink(integration).latestRoundData();
            answer;
            startedAt;
            answeredInRound;
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.chainlink.hard.v1",
                    integration,
                    IForkChainlink(integration).aggregator(),
                    IForkChainlink(integration).decimals(),
                    uint16(roundId >> 64)
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.chainlink.live.v1", updatedAt));
        } else if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) {
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.curve.hard.v1",
                    integration,
                    IForkCurvePool(integration).coins(0),
                    IForkCurvePool(integration).coins(1),
                    IForkCurvePool(integration).A(),
                    IForkCurvePool(integration).fee()
                )
            );
            tolerance = keccak256(
                abi.encode(
                    "wstdiem.fp.curve.tolerance.v1",
                    IForkCurvePool(integration).balances(0),
                    IForkCurvePool(integration).balances(1),
                    uint16(50)
                )
            );
            live = keccak256(abi.encode("wstdiem.fp.curve.live.v1", block.number));
        } else if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) {
            (, int256 answer, uint256 startedAt,,) = IForkChainlink(integration).latestRoundData();
            assertEq(answer, 0);
            hard = keccak256(
                abi.encode("wstdiem.fp.sequencer.hard.v1", integration, IForkChainlink(integration).decimals())
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.sequencer.live.v1", startedAt));
        } else {
            IForkUniswapV3Pool pool = IForkUniswapV3Pool(integration);
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
            tolerance = keccak256(abi.encode("wstdiem.fp.uniswap.tolerance.v1", pool.liquidity(), uint16(50)));
            live = keccak256(abi.encode("wstdiem.fp.uniswap.live.v1", tick));
        }
    }
}
