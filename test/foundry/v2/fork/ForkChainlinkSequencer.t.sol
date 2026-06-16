// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseMainnetForkSetup, IForkChainlink} from "./BaseMainnetForkSetup.sol";

contract ForkChainlinkSequencerTest is BaseMainnetForkSetup {
    function testChainlinkFeedLiveRead() public view {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            IForkChainlink(venues.chainlinkFeed).latestRoundData();
        assertGt(roundId, 0);
        assertGt(answer, 0);
        assertGt(updatedAt, 0);
        assertEq(answeredInRound, roundId);
    }

    function testChainlinkAggregatorAndDecimals() public view {
        assertTrue(IForkChainlink(venues.chainlinkFeed).aggregator() != address(0));
        assertEq(IForkChainlink(venues.chainlinkFeed).decimals(), 8);
    }

    function testBaseSequencerUptimeFeedRead() public view {
        (, int256 answer, uint256 startedAt,,) = IForkChainlink(venues.sequencerFeed).latestRoundData();
        assertEq(answer, 0);
        assertGt(startedAt, 0);
    }
}
