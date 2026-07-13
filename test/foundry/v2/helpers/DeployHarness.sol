// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

import {EmergencyGuardian} from "../../../../contracts/v2/EmergencyGuardian.sol";
import {LoopAnchorRegistry} from "../../../../contracts/v2/LoopAnchorRegistry.sol";
import {LoopAuthorization} from "../../../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorV2} from "../../../../contracts/v2/LoopExecutorV2.sol";
import {LoopFeeRouter} from "../../../../contracts/v2/LoopFeeRouter.sol";
import {LoopForceExitAuthorizer} from "../../../../contracts/v2/LoopForceExitAuthorizer.sol";
import {LoopForceExitExecutor} from "../../../../contracts/v2/LoopForceExitExecutor.sol";
import {LoopRegistry} from "../../../../contracts/v2/LoopRegistry.sol";
import {LoopRiskOracleAdapter} from "../../../../contracts/v2/LoopRiskOracleAdapter.sol";
import {ILoopRegistry} from "../../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {DeploymentManifest} from "../../../../script/v2/DeploymentManifest.sol";

abstract contract DeployHarness {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function _deploy(DeploymentManifest.DeploymentConfig memory config)
        internal
        returns (
            DeploymentManifest.DeployedContracts memory deployed,
            LoopRegistry registry,
            EmergencyGuardian guardian,
            bytes32 deploymentHash
        )
    {
        registry = new LoopRegistry(address(this));
        LoopForceExitAuthorizer forceExitAuthorizer = new LoopForceExitAuthorizer(registry);
        LoopAuthorization authorization = new LoopAuthorization(registry);
        LoopRiskOracleAdapter riskOracle = new LoopRiskOracleAdapter(registry);
        LoopFeeRouter feeRouter = new LoopFeeRouter(
            registry, config.governanceMultisig, config.protocolFeeReceiver, config.automationFeeReceiver
        );
        LoopAnchorRegistry anchorRegistry = new LoopAnchorRegistry(registry);
        guardian = new EmergencyGuardian(config.governanceMultisig, config.initialGuardian);
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

        deploymentHash = DeploymentManifest.deploymentHash(config, deployed);
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
        registry.setSpendAllowlistEnforced(true);
        // F22: Ownable2Step — two-phase ownership transfer.
        registry.transferOwnership(config.governanceMultisig);
        vm.prank(config.governanceMultisig);
        registry.acceptOwnership();

        require(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)) == deployed.executorV2, "open");
        require(registry.executorFor(uint8(LoopV1Types.PrimaryType.REBALANCE)) == deployed.executorV2, "rebalance");
        require(registry.executorFor(uint8(LoopV1Types.PrimaryType.EXIT)) == deployed.executorV2, "exit");
        require(
            registry.executorFor(uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC)) == deployed.executorV2, "automation"
        );
        require(registry.executorFor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT)) == deployed.forceExitExecutor, "force");
        require(address(executor.loopAuthorization()) == deployed.authorization, "exec auth");
        require(address(executor.loopRegistry()) == deployed.registry, "exec registry");
        require(address(forceExitExecutor.loopAuthorization()) == deployed.authorization, "force auth");
        require(address(forceExitExecutor.loopRegistry()) == deployed.registry, "force registry");
        require(guardian.governanceRole() != guardian.guardianRole(), "role separation");
    }
}
