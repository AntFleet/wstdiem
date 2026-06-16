// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {BaseMainnetForkSetup, IForkUniswapV3Factory} from "./BaseMainnetForkSetup.sol";

contract ForkDeploymentSmokeTest is BaseMainnetForkSetup {
    function testDeploysFullSuiteAgainstPinnedFork() public view {
        assertTrue(forkActive);
        assertTrue(deployed.registry != address(0));
        assertTrue(deployed.authorization != address(0));
        assertTrue(deployed.executorV2 != address(0));
        assertTrue(deployed.forceExitExecutor != address(0));
        assertTrue(deployed.riskOracleAdapter != address(0));
        assertTrue(deployed.emergencyGuardian != address(0));
    }

    function testPostDeployRegistryWiring() public view {
        assertEq(registry.morpho(), venues.morpho);
        assertEq(registry.marketParams(venues.market).loanToken, venues.params.loanToken);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)), deployed.executorV2);
        assertEq(registry.uniswapV3FlashPool(venues.market), venues.uniswapPool);
    }

    function testProxyUniswapPoolIsFactoryCanonical() public view {
        assertEq(
            IForkUniswapV3Factory(venues.uniswapFactory)
                .getPool(venues.params.loanToken, venues.params.collateralToken, venues.uniswapFeeTier),
            venues.uniswapPool
        );
    }
}
