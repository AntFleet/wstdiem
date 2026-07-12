// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Mock Chainlink aggregator (price feed) for the wstDIEM canonical price source.
/// @dev Faithful to the reads the risk oracle adapter and registry chainlink fingerprint use:
///      `latestRoundData()`, `aggregator()`, and `decimals()`. `updatedAt` tracks the current
///      block timestamp by default so the feed always reads fresh; a fixed override is available
///      for staleness testing. The phase id lives in the high 16 bits of `roundId`.
contract MockChainlinkFeed {
    uint8 public immutable decimals;
    address public immutable aggregator;
    int256 public answer;
    uint80 public roundId;
    uint256 private fixedUpdatedAt; // 0 => report live block.timestamp.

    constructor(uint8 decimals_, int256 answer_, uint16 phaseId) {
        decimals = decimals_;
        aggregator = address(this);
        answer = answer_;
        roundId = (uint80(phaseId) << 64) | uint80(1);
    }

    function setAnswer(int256 answer_) external {
        answer = answer_;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        fixedUpdatedAt = updatedAt_;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId_, int256 answer_, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        uint256 ts = fixedUpdatedAt == 0 ? block.timestamp : fixedUpdatedAt;
        return (roundId, answer, ts, ts, roundId);
    }
}

/// @notice Mock L2 sequencer-uptime feed. `answer == 0` means the sequencer is up.
/// @dev Faithful to the sequencer reads in the risk oracle adapter and registry sequencer
///      fingerprint: `latestRoundData()` (answer/startedAt) and `decimals()`. `startedAt` is the
///      block when the sequencer came up; the registry/adapter require the grace window (3600s)
///      to have elapsed since `startedAt`.
contract MockSequencerFeed {
    uint8 public constant decimals = 0;
    int256 public answer; // 0 = up, 1 = down.
    uint256 public startedAt;

    constructor() {
        answer = 0;
        startedAt = 1; // Small non-zero start; callers warp past the 3600s grace window.
    }

    function setStatus(int256 answer_, uint256 startedAt_) external {
        answer = answer_;
        startedAt = startedAt_;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer_, uint256 startedAt_, uint256 updatedAt, uint80 answeredInRound)
    {
        return (uint80(1), answer, startedAt, startedAt, uint80(1));
    }
}
