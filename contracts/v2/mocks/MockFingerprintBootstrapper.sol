// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopRegistry} from "../LoopRegistry.sol";
import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
import {LoopV1Types} from "../libraries/LoopV1Types.sol";
import {MockFingerprintLib} from "./MockFingerprintLib.sol";

/// @notice On-chain atomic bootstrapper for the mock external-protocol fingerprints, required for a
///         LIVE broadcast (as opposed to the in-process `MockDeploymentKit`).
/// @dev The registry's curve/chainlink live baselines are block-sensitive (`block.number` /
///      `updatedAt`), so a fingerprint computed off-chain by a script and broadcast as a separate
///      transaction reverts `FingerprintInvalid(3)` once it mines a block later. This contract
///      computes AND queues each fingerprint inside a single `queueAll()` transaction, so the
///      compute block equals the validate block and the baselines match. It must own the registry
///      while queuing/applying (transfer ownership to it after core setup, hand it back after apply).
contract MockFingerprintBootstrapper {
    using MockFingerprintLib for *;

    uint8 internal constant OP_APPLY_EXTERNAL_FINGERPRINT = 14;

    address public immutable operator;
    LoopRegistry public immutable registry;
    MockFingerprintLib.MarketParams internal market;

    // sourceId[i] pins integrations[i]; order fixed so queue + apply reference identical ids.
    bytes32[6] internal sourceIds;
    address[6] internal integrations;

    error NotOperator();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    struct Venues {
        address morpho;
        address vault;
        address chainlink;
        address curve;
        address sequencer;
        address uniswapV3FlashPool;
    }

    constructor(LoopRegistry registry_, MockFingerprintLib.MarketParams memory market_, Venues memory venues) {
        operator = msg.sender;
        registry = registry_;
        market = market_;

        sourceIds[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        integrations[0] = venues.morpho;
        sourceIds[1] = LoopV1Types.SOURCE_VAULT_NAV;
        integrations[1] = venues.vault;
        sourceIds[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        integrations[2] = venues.chainlink;
        sourceIds[3] = LoopV1Types.SOURCE_CURVE_QUOTE;
        integrations[3] = venues.curve;
        sourceIds[4] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        integrations[4] = venues.sequencer;
        sourceIds[5] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        integrations[5] = venues.uniswapV3FlashPool;
    }

    /// @notice Compute + queue all six fingerprints atomically (this contract must own the registry).
    function queueAll() external onlyOperator {
        for (uint256 i = 0; i < 6; i++) {
            bytes32 integrationId = MockFingerprintLib.integrationId(market.id, sourceIds[i]);
            LoopV1Types.ExternalProtocolFingerprint memory fp =
                MockFingerprintLib.buildFingerprint(registry, sourceIds[i], integrations[i], market);
            registry.fingerprints_().queueExternalFingerprintUpdate(integrationId, fp);
        }
    }

    /// @notice Apply all six queued fingerprints in one batch. Reverts until the registry timelock
    ///         (`REGISTRY_TIMELOCK_BLOCKS`) has elapsed since `queueAll()`.
    function applyAll() external onlyOperator {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](6);
        for (uint256 i = 0; i < 6; i++) {
            bytes32 integrationId = MockFingerprintLib.integrationId(market.id, sourceIds[i]);
            ops[i] = ILoopRegistry.BatchOp({op: OP_APPLY_EXTERNAL_FINGERPRINT, data: abi.encode(integrationId)});
        }
        registry.batchUpdate(ops, registry.registryVersion() + 1, keccak256("wstdiem.mock.fingerprints"));
    }

    /// @notice Accept Ownable2Step ownership after the deployer proposes this bootstrapper.
    function acceptRegistryOwnership() external onlyOperator {
        registry.acceptOwnership();
    }

    /// @notice Hand registry ownership back (to governance / the deployer) after the bootstrap.
    /// @dev Ownable2Step: `to` must call `acceptOwnership()` to complete the transfer.
    function transferRegistryOwnership(address to) external onlyOperator {
        registry.transferOwnership(to);
    }

    function marketId() external view returns (bytes32) {
        return market.id;
    }
}
