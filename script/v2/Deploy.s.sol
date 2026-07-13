// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

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
import {DeploymentManifest} from "./DeploymentManifest.sol";

contract Deploy is Script {
    using DeploymentManifest for DeploymentManifest.DeploymentConfig;

    /// @notice Reverts when the config's pinned chainId does not match block.chainid.
    /// @dev Prevents broadcasting a Base-mainnet config to the wrong chain (R0/Codex C-2).
    error WrongDeployChainId(uint256 configured, uint256 actual);

    function run() external returns (DeploymentManifest.DeployedContracts memory deployed) {
        string memory configPath = vm.envOr("WSTDIEM_DEPLOY_CONFIG", string("script/v2/configs/base-mainnet.json"));
        DeploymentManifest.DeploymentConfig memory config = _readConfig(configPath);

        enforceChainId(config.chainId);

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        LoopRegistry registry = new LoopRegistry(deployer);
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

        _verify(config, deployed, registry, guardian);
        // F22 Ownable2Step: governance must call acceptOwnership() to complete transfer.
        registry.transferOwnership(config.governanceMultisig);
        console2.log("pendingOwner (must acceptOwnership)", config.governanceMultisig);
        vm.stopBroadcast();

        console2.log("WSTDIEM Phase 1 deployment hash");
        console2.logBytes32(deploymentHash);
        console2.log("registry", deployed.registry);
        console2.log("forceExitAuthorizer", deployed.forceExitAuthorizer);
        console2.log("authorization", deployed.authorization);
        console2.log("executorV2", deployed.executorV2);
        console2.log("forceExitExecutor", deployed.forceExitExecutor);
        console2.log("riskOracleAdapter", deployed.riskOracleAdapter);
        console2.log("feeRouter", deployed.feeRouter);
        console2.log("anchorRegistry", deployed.anchorRegistry);
        console2.log("emergencyGuardian", deployed.emergencyGuardian);
        console2.log("registryVersion", registry.registryVersion());
    }

    function _verify(
        DeploymentManifest.DeploymentConfig memory config,
        DeploymentManifest.DeployedContracts memory deployed,
        LoopRegistry registry,
        EmergencyGuardian guardian
    ) private view {
        require(registry.registryVersion() == 1, "registry version");
        require(registry.loopAuthorization() == deployed.authorization, "authorization wiring");
        require(registry.loopForceExitAuthorizer() == deployed.forceExitAuthorizer, "force authorizer wiring");
        require(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)) == deployed.executorV2, "open executor");
        require(
            registry.executorFor(uint8(LoopV1Types.PrimaryType.REBALANCE)) == deployed.executorV2, "rebalance executor"
        );
        require(registry.executorFor(uint8(LoopV1Types.PrimaryType.EXIT)) == deployed.executorV2, "exit executor");
        require(
            registry.executorFor(uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)) == deployed.executorV2,
            "automation executor"
        );
        require(
            registry.executorFor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT)) == deployed.forceExitExecutor,
            "force executor"
        );
        require(address(LoopExecutorV2(deployed.executorV2).loopAuthorization()) == deployed.authorization, "exec auth");
        require(address(LoopExecutorV2(deployed.executorV2).loopRegistry()) == deployed.registry, "exec registry");
        require(
            address(LoopForceExitExecutor(deployed.forceExitExecutor).loopAuthorization()) == deployed.authorization,
            "force exec auth"
        );
        require(
            address(LoopForceExitExecutor(deployed.forceExitExecutor).loopRegistry()) == deployed.registry,
            "force exec registry"
        );
        require(registry.emergencyGuardian() == deployed.emergencyGuardian, "registry guardian");
        require(registry.governanceRole() == config.governanceMultisig, "registry governance");
        require(registry.anchorSubmitter() == config.anchorSubmitter, "anchor submitter");
        require(registry.anchorCadenceBlocks() == config.anchorCadenceBlocks, "anchor cadence");
        require(guardian.governanceRole() == config.governanceMultisig, "guardian governance");
        require(guardian.guardianRole() == config.initialGuardian, "guardian role");
        require(guardian.governanceRole() != guardian.guardianRole(), "guardian role separation");
    }

    /// @notice Reverts when `configured` does not equal `block.chainid`. Public for test access.
    function enforceChainId(uint256 configured) public view {
        if (block.chainid != configured) revert WrongDeployChainId(configured, block.chainid);
    }

    function _readConfig(string memory path) private view returns (DeploymentManifest.DeploymentConfig memory config) {
        string memory json = vm.readFile(path);
        config.chainId = vm.parseJsonUint(json, ".chainId");
        config.governanceMultisig = vm.parseJsonAddress(json, ".governanceMultisig");
        config.initialGuardian = vm.parseJsonAddress(json, ".initialGuardian");
        config.anchorSubmitter = vm.parseJsonAddress(json, ".anchorSubmitter");
        config.indexerSigningKey = vm.parseJsonAddress(json, ".indexerSigningKey");
        config.protocolFeeReceiver = vm.parseJsonAddress(json, ".protocolFeeReceiver");
        config.automationFeeReceiver = vm.parseJsonAddress(json, ".automationFeeReceiver");
        config.anchorCadenceBlocks = uint64(vm.parseJsonUint(json, ".anchorCadenceBlocks"));
        config.harvestCoolingBlocks = vm.parseJsonUint(json, ".harvestCoolingBlocks");
        config.forceExitMaxDeadlineSeconds = vm.parseJsonUint(json, ".forceExitMaxDeadlineSeconds");
        config.attemptThrottleWindowBlocks = uint16(vm.parseJsonUint(json, ".attemptThrottleWindowBlocks"));
        config.maxFailedAttemptsPerWindow = uint8(vm.parseJsonUint(json, ".maxFailedAttemptsPerWindow"));

        config.market.id = vm.parseJsonBytes32(json, ".markets[0].id");
        config.market.loanToken = vm.parseJsonAddress(json, ".markets[0].loanToken");
        config.market.collateralToken = vm.parseJsonAddress(json, ".markets[0].collateralToken");
        config.market.oracle = vm.parseJsonAddress(json, ".markets[0].oracle");
        config.market.irm = vm.parseJsonAddress(json, ".markets[0].irm");
        config.market.lltv = vm.parseJsonUint(json, ".markets[0].lltv");
        config.market.curvePool = vm.parseJsonAddress(json, ".markets[0].curvePool");
        config.market.wstDiemVault = vm.parseJsonAddress(json, ".markets[0].wstDiemVault");
        config.market.uniswapV3Factory = vm.parseJsonAddress(json, ".uniswapV3Factory");
        config.market.uniswapV3FlashPool = vm.parseJsonAddress(json, ".markets[0].uniswapV3FlashPool");
        config.market.uniswapV3FlashFeeTier = uint24(vm.parseJsonUint(json, ".markets[0].uniswapV3FlashFeeTier"));
        config.market.chainlinkFeed = vm.parseJsonAddress(json, ".markets[0].chainlinkFeed");
        config.market.sequencerFeed = vm.parseJsonAddress(json, ".baseSequencerFeed");
        config.market.morpho = vm.parseJsonAddress(json, ".morpho");
    }
}
