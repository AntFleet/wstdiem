// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

import {EmergencyGuardian} from "../../../contracts/v2/EmergencyGuardian.sol";
import {LoopExecutorV2} from "../../../contracts/v2/LoopExecutorV2.sol";
import {LoopForceExitExecutor} from "../../../contracts/v2/LoopForceExitExecutor.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {Deploy} from "../../../script/v2/Deploy.s.sol";
import {DeploymentManifest} from "../../../script/v2/DeploymentManifest.sol";
import {DeployHarness} from "./helpers/DeployHarness.sol";

contract DeploymentScriptTest is DeployHarness, Test {
    address private constant GOVERNANCE = address(0xA11CE);
    address private constant GUARDIAN = address(0xB0B);
    address private constant ANCHOR = address(0xA222);
    address private constant INDEXER = address(0x1337);

    DeploymentManifest.DeploymentConfig private config;
    DeploymentManifest.DeployedContracts private deployed;
    LoopRegistry private registry;
    EmergencyGuardian private guardian;
    bytes32 private deploymentHash;

    function setUp() public {
        config = _config();
        (deployed, registry, guardian, deploymentHash) = _deploy(config);
    }

    function testFullDeploymentHarnessRuns() public view {
        assertTrue(deployed.registry != address(0));
        assertTrue(deployed.authorization != address(0));
        assertTrue(deployed.executorV2 != address(0));
        assertTrue(deployed.forceExitExecutor != address(0));
    }

    function testRegistryVersionAndRootCommitted() public view {
        assertEq(registry.registryVersion(), 1);
        assertEq(registry.registryMerkleRoot(), DeploymentManifest.initialRoot(deploymentHash));
    }

    function testExecutorWiringSetCorrectly() public view {
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)), deployed.executorV2);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.REBALANCE)), deployed.executorV2);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.EXIT)), deployed.executorV2);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)), deployed.executorV2);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT)), deployed.forceExitExecutor);
    }

    function testGuardianAndGovernanceRolesSet() public view {
        assertEq(registry.emergencyGuardian(), deployed.emergencyGuardian);
        assertEq(registry.governanceRole(), GOVERNANCE);
        assertEq(guardian.governanceRole(), GOVERNANCE);
        assertEq(guardian.guardianRole(), GUARDIAN);
        assertTrue(guardian.governanceRole() != guardian.guardianRole());
    }

    function testExecutorCrossDependenciesMatchRegistry() public view {
        LoopExecutorV2 executor = LoopExecutorV2(deployed.executorV2);
        assertEq(address(executor.loopAuthorization()), registry.loopAuthorization());
        assertEq(address(executor.loopRegistry()), deployed.registry);
    }

    function testForceExitExecutorCrossDependenciesMatchRegistry() public view {
        LoopForceExitExecutor forceExitExecutor = LoopForceExitExecutor(deployed.forceExitExecutor);
        assertEq(address(forceExitExecutor.loopAuthorization()), registry.loopAuthorization());
        assertEq(address(forceExitExecutor.loopRegistry()), deployed.registry);
    }

    function testRegistryOwnershipTransferredToGovernance() public view {
        assertEq(registry.owner(), GOVERNANCE);
    }

    function testAnchorAndIndexerRolesSet() public view {
        assertEq(registry.anchorSubmitter(), ANCHOR);
        assertEq(registry.indexerSigningKey(), INDEXER);
        assertEq(registry.anchorCadenceBlocks(), 100);
    }

    function testOperationalConfigSet() public view {
        assertEq(registry.harvestCoolingBlocks(), 30);
        assertEq(registry.forceExitMaxDeadlineSeconds(), 1 days);
        assertEq(registry.attemptThrottleWindowBlocks(), 60);
        assertEq(registry.maxFailedAttemptsPerWindow(), 5);
        assertEq(registry.forceExitBufferBps(), 0);
        assertEq(registry.loopRiskOracleAdapter(), deployed.riskOracleAdapter);
    }

    function testConstructorArgumentValidationRejectsZeroGuardianRole() public {
        vm.expectRevert();
        new EmergencyGuardian(GOVERNANCE, address(0));
    }

    function testConstructorArgumentValidationRejectsRoleOverlap() public {
        vm.expectRevert(LoopV1Errors.RolesMustDiffer.selector);
        new EmergencyGuardian(GOVERNANCE, GOVERNANCE);
    }

    function testEnforceChainIdAcceptsMatchingChain() public {
        Deploy deployScript = new Deploy();
        deployScript.enforceChainId(block.chainid);
    }

    function testEnforceChainIdRevertsOnWrongChain() public {
        Deploy deployScript = new Deploy();
        uint256 wrongChain = block.chainid + 1;
        vm.expectRevert(abi.encodeWithSelector(Deploy.WrongDeployChainId.selector, wrongChain, block.chainid));
        deployScript.enforceChainId(wrongChain);
    }

    function testEnforceChainIdRevertsOnZeroChain() public {
        Deploy deployScript = new Deploy();
        vm.expectRevert(abi.encodeWithSelector(Deploy.WrongDeployChainId.selector, uint256(0), block.chainid));
        deployScript.enforceChainId(0);
    }

    function testBatchMarketConfigCommitted() public view {
        assertTrue(registry.supportedMarket(config.market.id));
        assertEq(registry.morpho(), config.market.morpho);
        assertEq(registry.curvePool(config.market.id), config.market.curvePool);
        assertEq(registry.wstDiemVault(config.market.id), config.market.wstDiemVault);
    }

    function _config() private view returns (DeploymentManifest.DeploymentConfig memory cfg) {
        cfg.chainId = block.chainid;
        cfg.governanceMultisig = GOVERNANCE;
        cfg.initialGuardian = GUARDIAN;
        cfg.anchorSubmitter = ANCHOR;
        cfg.indexerSigningKey = INDEXER;
        cfg.protocolFeeReceiver = address(0xFEE1);
        cfg.automationFeeReceiver = address(0xFEE2);
        cfg.anchorCadenceBlocks = 100;
        cfg.harvestCoolingBlocks = 30;
        cfg.forceExitMaxDeadlineSeconds = 1 days;
        cfg.attemptThrottleWindowBlocks = 60;
        cfg.maxFailedAttemptsPerWindow = 5;
        cfg.market = DeploymentManifest.MarketConfig({
            id: bytes32(uint256(0x1234)),
            loanToken: address(0x1001),
            collateralToken: address(0x1002),
            oracle: address(0x1003),
            irm: address(0x1004),
            lltv: 8600,
            curvePool: address(0x1005),
            wstDiemVault: address(0x1006),
            uniswapV3Factory: address(0x1007),
            uniswapV3FlashPool: address(0x1008),
            uniswapV3FlashFeeTier: 500,
            chainlinkFeed: address(0x1009),
            sequencerFeed: address(0x1010),
            morpho: address(0x1011)
        });
    }
}
