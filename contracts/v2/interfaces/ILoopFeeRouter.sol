// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILoopFeeRouter {
    enum FeeKind {
        PROTOCOL,
        AUTOMATION
    }

    function routeFee(address token, uint256 amount, bytes32 actionId, FeeKind kind) external;
    function setProtocolReceiver(address receiver) external;
    function setAutomationReceiver(address receiver) external;
    function skim(address token) external;
    function protocolReceiver() external view returns (address);
    function automationReceiver() external view returns (address);
}
