// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "./ILoopRegistry.sol";

interface ILoopAnchorRegistry {
    function registry() external view returns (ILoopRegistry);
    function lastAnchorBlock() external view returns (uint64);
    function submitStateSnapshot(uint256 blockNumber, bytes32 manifestHash) external;
}
