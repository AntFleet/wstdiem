// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {LoopRegistry} from "../../contracts/v2/LoopRegistry.sol";
import {LoopV1Types} from "../../contracts/v2/libraries/LoopV1Types.sol";
import {DeploymentManifest} from "./DeploymentManifest.sol";
import {MockDeploymentKit} from "./MockDeploymentKit.sol";

/// @notice Testnet-only deploy of the full wstDIEM v2 system on top of mock external protocols.
/// @dev The canonical mainnet path (`Deploy.s.sol`) is untouched and expects real venue addresses.
///      This script deploys mock Morpho / wstDIEM vault / Curve / Uniswap V3 flash pool / Chainlink
///      feeds, wires the core protocol against them, and pins the external-protocol fingerprints —
///      the exact addresses to paste into `script/v2/configs/base-sepolia.json`.
///
///      Fingerprint bootstrap crosses the registry timelock via `vm.roll` (see `MockDeploymentKit`),
///      so run this WITHOUT `--broadcast` as a local simulation to mint addresses and verify wiring:
///
///        forge script script/v2/DeployMocks.s.sol:DeployMocks
///
///      For an actual Base Sepolia broadcast the fingerprint apply must be a SECOND transaction sent
///      after `REGISTRY_TIMELOCK_BLOCKS` (130_000) blocks have elapsed; the local `MockDeploymentE2E`
///      test is the pre-broadcast proof that the open/exit loop settles end-to-end against the mocks.
contract DeployMocks is Script, MockDeploymentKit {
    function run()
        external
        returns (
            DeploymentManifest.DeployedContracts memory deployed,
            DeploymentManifest.DeploymentConfig memory config
        )
    {
        address deployer = vm.envOr("WSTDIEM_MOCK_DEPLOYER", msg.sender);
        address governance = vm.envOr("WSTDIEM_MOCK_GOVERNANCE", deployer);

        MockAddresses memory mocks;
        LoopRegistry registry;
        // Broadcast so every mock/core deployment and registry call is sent from `deployer`, which
        // owns the registry through the fingerprint bootstrap.
        vm.startBroadcast(deployer);
        (mocks, config, deployed, registry) = _deployFullMockSystem(deployer, governance);
        vm.stopBroadcast();

        console2.log("== wstDIEM mock testnet deployment ==");
        console2.log("chainId", config.chainId);
        console2.log("registryVersion", registry.registryVersion());
        console2.logBytes32(config.market.id);

        console2.log("-- core protocol --");
        console2.log("registry", deployed.registry);
        console2.log("authorization", deployed.authorization);
        console2.log("executorV2", deployed.executorV2);
        console2.log("forceExitExecutor", deployed.forceExitExecutor);
        console2.log("forceExitAuthorizer", deployed.forceExitAuthorizer);
        console2.log("riskOracleAdapter", deployed.riskOracleAdapter);
        console2.log("feeRouter", deployed.feeRouter);
        console2.log("anchorRegistry", deployed.anchorRegistry);
        console2.log("emergencyGuardian", deployed.emergencyGuardian);

        console2.log("-- mock external protocols (paste into base-sepolia.json) --");
        console2.log("morpho", address(mocks.morpho));
        console2.log("loanToken (DIEM)", address(mocks.loanToken));
        console2.log("collateralToken (wstDIEM)", address(mocks.collateralToken));
        console2.log("oracle (morpho)", address(mocks.morphoOracle));
        console2.log("irm", address(mocks.morphoIrm));
        console2.log("wstDiemVault", address(mocks.vault));
        console2.log("curvePool", address(mocks.curve));
        console2.log("uniswapV3Factory", address(mocks.uniFactory));
        console2.log("uniswapV3FlashPool", address(mocks.uniPool));
        console2.log("chainlinkFeed", address(mocks.chainlink));
        console2.log("baseSequencerFeed", address(mocks.sequencer));

        // Gate self-check: proves the wired system passes external-config validation as deployed.
        require(
            registry.validateExternalConfig(config.market.id, uint8(LoopV1Types.PrimaryType.OPEN)), "open gate failed"
        );
        require(
            registry.validateExternalConfig(config.market.id, uint8(LoopV1Types.PrimaryType.EXIT)), "exit gate failed"
        );
    }
}
