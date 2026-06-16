// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopRegistry} from "../../../../contracts/v2/LoopRegistry.sol";
import {RegistryBatchHelpers} from "./RegistryBatchHelpers.sol";

/// @notice Shared Foundry helpers for Phase B PR-1 foundation tests.
contract TestHelpers is RegistryBatchHelpers {
    address internal constant OWNER = address(0xA11CE);
    address internal constant NOT_OWNER = address(0xB0B);

    function deployRegistry() internal returns (LoopRegistry registry) {
        registry = new LoopRegistry(OWNER);
    }
}
