// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
import {LoopV1Errors} from "./LoopV1Errors.sol";

library LoopV1ThrottleCounter {
    struct Counter {
        uint64 windowStartBlock;
        uint8 failedAttempts;
    }

    function check(Counter storage counter, ILoopRegistry registry) internal view {
        uint256 window = registry.attemptThrottleWindowBlocks();
        uint8 maxFailed = registry.maxFailedAttemptsPerWindow();
        if (counter.windowStartBlock == 0 || block.number > uint256(counter.windowStartBlock) + window) return;
        if (counter.failedAttempts >= maxFailed) revert LoopV1Errors.AutomationAttemptThrottled();
    }

    function recordFailure(Counter storage counter, ILoopRegistry registry) internal {
        uint256 window = registry.attemptThrottleWindowBlocks();
        if (counter.windowStartBlock == 0 || block.number > uint256(counter.windowStartBlock) + window) {
            counter.windowStartBlock = uint64(block.number);
            counter.failedAttempts = 1;
            return;
        }
        if (counter.failedAttempts < type(uint8).max) counter.failedAttempts++;
    }

    function clear(Counter storage counter) internal {
        counter.windowStartBlock = 0;
        counter.failedAttempts = 0;
    }
}
