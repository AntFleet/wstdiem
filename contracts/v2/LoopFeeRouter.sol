// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

import {ILoopFeeRouter} from "./interfaces/ILoopFeeRouter.sol";
import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {ILoopV1Events} from "./interfaces/ILoopV1Events.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";

interface IERC20FeeRouter {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Phase 1 fee router: per-kind receiver routing plus residual skim.
contract LoopFeeRouter is Ownable, ILoopFeeRouter, ILoopV1Events {
    ILoopRegistry public immutable registry;
    address public protocolReceiver;
    address public automationReceiver;

    constructor(ILoopRegistry registry_, address owner_, address protocolReceiver_, address automationReceiver_)
        Ownable(owner_)
    {
        registry = registry_;
        if (protocolReceiver_ == address(0) || automationReceiver_ == address(0)) {
            revert LoopV1Errors.ReceiverNotAllowed();
        }
        protocolReceiver = protocolReceiver_;
        automationReceiver = automationReceiver_;
        emit FeeRouterConfigured(protocolReceiver_, automationReceiver_);
    }

    function routeFee(address token, uint256 amount, bytes32 actionId, FeeKind kind) external {
        if (amount == 0) return;
        address receiver = _receiver(kind);
        if (receiver == address(0)) revert LoopV1Errors.ReceiverNotAllowed();
        _transferFrom(token, msg.sender, receiver, amount);
        emit FeeRouted(receiver, token, amount, actionId);
    }

    function setProtocolReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert LoopV1Errors.ReceiverNotAllowed();
        protocolReceiver = receiver;
        emit FeeRouterConfigured(protocolReceiver, automationReceiver);
    }

    function setAutomationReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert LoopV1Errors.ReceiverNotAllowed();
        automationReceiver = receiver;
        emit FeeRouterConfigured(protocolReceiver, automationReceiver);
    }

    function skim(address token) external {
        uint256 amount = IERC20FeeRouter(token).balanceOf(address(this));
        if (amount == 0) return;
        _transfer(token, protocolReceiver, amount);
        emit FeeRouted(protocolReceiver, token, amount, bytes32(0));
    }

    function _receiver(FeeKind kind) private view returns (address) {
        if (kind == FeeKind.PROTOCOL) return protocolReceiver;
        return automationReceiver;
    }

    function _transfer(address token, address to, uint256 amount) private {
        bool ok = IERC20FeeRouter(token).transfer(to, amount);
        if (!ok) revert LoopV1Errors.Erc20TransferFailed();
    }

    function _transferFrom(address token, address from, address to, uint256 amount) private {
        bool ok = IERC20FeeRouter(token).transferFrom(from, to, amount);
        if (!ok) revert LoopV1Errors.Erc20TransferFromFailed();
    }
}
