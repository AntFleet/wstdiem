// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {LoopRegistry} from "../../contracts/v2/LoopRegistry.sol";
import {LoopV1Types} from "../../contracts/v2/libraries/LoopV1Types.sol";
import {MockFingerprintBootstrapper} from "../../contracts/v2/mocks/MockFingerprintBootstrapper.sol";
import {MockFingerprintLib} from "../../contracts/v2/mocks/MockFingerprintLib.sol";
import {DeploymentManifest} from "./DeploymentManifest.sol";
import {MockDeploymentKit} from "./MockDeploymentKit.sol";

/// @notice LIVE Base Sepolia deploy of the full wstDIEM v2 system on mock external protocols, split
///         into the two transactions the registry timelock forces.
///
///         Unlike `DeployMocks.s.sol` (which crosses the timelock with `vm.roll` and is LOCAL-only),
///         this script never uses `vm.roll`/`vm.warp`, and it queues fingerprints through an on-chain
///         `MockFingerprintBootstrapper` so the block-sensitive curve/chainlink live baselines are
///         computed AND submitted in the same transaction (a script computing them off-chain and
///         broadcasting a separate queue tx reverts `FingerprintInvalid(3)` once it mines).
///
///         Phase 1 (now):
///           forge script script/v2/DeployMocksSepolia.s.sol:DeployMocksSepolia \
///             --sig "run()" --rpc-url <sepolia> --private-key <deployer> --broadcast
///         Deploys mocks + core, transfers registry ownership to the bootstrapper, and queues the six
///         fingerprints atomically. Logs the bootstrapper + registry addresses and the earliest apply
///         block. Opens are rejected until the fingerprints are applied after REGISTRY_TIMELOCK_BLOCKS.
///
///         Phase 2 (after ~130_000 blocks, ~3 days):
///           WSTDIEM_BOOTSTRAPPER=<addr> WSTDIEM_MOCK_GOVERNANCE=<addr> \
///           forge script script/v2/DeployMocksSepolia.s.sol:DeployMocksSepolia \
///             --sig "applyFingerprints()" --rpc-url <sepolia> --private-key <deployer> --broadcast
///         Applies the queued fingerprints, hands registry ownership to governance, and asserts the
///         open/exit external-config gates pass.
contract DeployMocksSepolia is Script, MockDeploymentKit {
    /// @notice Phase 1: deploy + wire + atomically queue fingerprints via the bootstrapper.
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
        MockFingerprintBootstrapper bootstrapper;
        vm.startBroadcast(deployer);
        mocks = _deployMockVenues();
        config = _buildConfig(mocks, governance);
        (deployed, registry) = _deployCore(config, deployer);
        _seedMockLiquidity(mocks);
        registry.setPermissionlessCallerAllowed(deployed.executorV2, true);

        bootstrapper = new MockFingerprintBootstrapper(
            registry,
            MockFingerprintLib.MarketParams({
                id: config.market.id,
                loanToken: config.market.loanToken,
                collateralToken: config.market.collateralToken,
                oracle: config.market.oracle,
                irm: config.market.irm,
                lltv: config.market.lltv
            }),
            MockFingerprintBootstrapper.Venues({
                morpho: config.market.morpho,
                vault: config.market.wstDiemVault,
                chainlink: config.market.chainlinkFeed,
                curve: config.market.curvePool,
                sequencer: config.market.sequencerFeed,
                uniswapV3FlashPool: config.market.uniswapV3FlashPool
            })
        );
        registry.transferOwnership(address(bootstrapper));
        bootstrapper.acceptRegistryOwnership();
        bootstrapper.queueAll();
        vm.stopBroadcast();

        uint256 applyBlock = block.number + REGISTRY_TIMELOCK_BLOCKS;

        console2.log("== wstDIEM mock SEPOLIA deploy (phase 1: deploy + queue) ==");
        console2.log("chainId", config.chainId);
        console2.log("registryVersion", registry.registryVersion());
        console2.log("market.id:");
        console2.logBytes32(config.market.id);
        console2.log("fingerprints queued via bootstrapper; earliest apply block", applyBlock);
        console2.log("current block", block.number);

        console2.log("-- core protocol --");
        console2.log("registry", deployed.registry);
        console2.log("fingerprintRegistry (SDK loopFingerprintRegistry)", address(registry.fingerprints_()));
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

        console2.log("-- phase 2 (after timelock) needs env: --");
        console2.log("WSTDIEM_BOOTSTRAPPER", address(bootstrapper));
        console2.log("WSTDIEM_MOCK_GOVERNANCE", governance);
    }

    /// @notice Phase 2: apply queued fingerprints, hand ownership to governance, assert gates. Reverts
    ///         with FingerprintTimelockNotElapsed if run before REGISTRY_TIMELOCK_BLOCKS have passed.
    function applyFingerprints() external {
        address deployer = vm.envOr("WSTDIEM_MOCK_DEPLOYER", msg.sender);
        MockFingerprintBootstrapper bootstrapper =
            MockFingerprintBootstrapper(vm.envAddress("WSTDIEM_BOOTSTRAPPER"));
        LoopRegistry registry = bootstrapper.registry();
        bytes32 marketId = bootstrapper.marketId();
        address governance = vm.envOr("WSTDIEM_MOCK_GOVERNANCE", deployer);

        vm.startBroadcast(deployer);
        bootstrapper.applyAll();
        bootstrapper.transferRegistryOwnership(governance);
        vm.stopBroadcast();

        require(
            registry.validateExternalConfig(marketId, uint8(LoopV1Types.PrimaryType.OPEN)),
            "open gate failed after apply"
        );
        require(
            registry.validateExternalConfig(marketId, uint8(LoopV1Types.PrimaryType.EXIT)),
            "exit gate failed after apply"
        );
        console2.log("== fingerprints applied; ownership -> governance; open/exit gates PASS ==");
        console2.log("registryVersion", registry.registryVersion());
    }
}
