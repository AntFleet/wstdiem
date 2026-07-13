// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorV2} from "../../../contracts/v2/LoopExecutorV2.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {MockFingerprintBootstrapper} from "../../../contracts/v2/mocks/MockFingerprintBootstrapper.sol";
import {MockFingerprintLib} from "../../../contracts/v2/mocks/MockFingerprintLib.sol";
import {DeploymentManifest} from "../../../script/v2/DeploymentManifest.sol";
import {MockDeploymentKit} from "../../../script/v2/MockDeploymentKit.sol";
import {DigestBuilder} from "./helpers/DigestBuilder.sol";

/// @notice Proves the LIVE deploy path — deploy core, transfer registry ownership to the on-chain
///         `MockFingerprintBootstrapper`, and queue+apply fingerprints through it — yields a system
///         whose external-config gates pass and that opens/exits a loop. This is the local proof for
///         `DeployMocksSepolia.s.sol`, which the in-process kit path (`MockDeploymentE2E`) does not
///         exercise (the kit queues off-chain, which reverts on a real broadcast).
contract MockBootstrapperE2ETest is Test, MockDeploymentKit {
    using DigestBuilder for LoopAuthorization;

    uint256 private constant OWNER_PK = 0xA11CE;
    uint256 private constant MAX_BORROW = 100 ether;

    MockAddresses private mocks;
    DeploymentManifest.DeploymentConfig private config;
    DeploymentManifest.DeployedContracts private deployed;
    LoopRegistry private registry;
    LoopAuthorization private auth;
    LoopExecutorV2 private executor;
    MockFingerprintBootstrapper private bootstrapper;
    address private owner;
    bytes32 private market;

    function setUp() public {
        vm.warp(1_000_000);
        owner = vm.addr(OWNER_PK);

        // Mirror DeployMocksSepolia.run() exactly, minus vm.roll for the timelock.
        mocks = _deployMockVenues();
        config = _buildConfig(mocks, address(this));
        (deployed, registry) = _deployCore(config, address(this));
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
        // Cross the registry timelock, then apply through the bootstrapper (phase 2).
        vm.roll(block.number + REGISTRY_TIMELOCK_BLOCKS);
        bootstrapper.applyAll();

        auth = LoopAuthorization(deployed.authorization);
        executor = LoopExecutorV2(deployed.executorV2);
        market = config.market.id;
    }

    function testBootstrapperGatesPass() public view {
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN)), "open gate");
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.EXIT)), "exit gate");
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.REBALANCE)), "rebalance gate");
    }

    function testApplyBeforeTimelockReverts() public {
        // Fresh queue on a second bootstrapper; applying immediately must revert.
        MockFingerprintBootstrapper bs2 = new MockFingerprintBootstrapper(
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
        // registry is currently owned by `bootstrapper`; Ownable2Step handoff to bs2.
        bootstrapper.transferRegistryOwnership(address(bs2));
        bs2.acceptRegistryOwnership();
        bs2.queueAll();
        vm.expectRevert();
        bs2.applyAll();
    }

    function testOpenThenExitThroughBootstrapper() public {
        _open(1, 1);
        (, uint128 debtBefore, uint128 collateralBefore) = mocks.morpho.position(market, owner);
        assertEq(uint256(debtBefore), MAX_BORROW, "position opened");

        _exit(2, uint256(collateralBefore));

        (, uint128 debtAfter, uint128 collateralAfter) = mocks.morpho.position(market, owner);
        assertEq(uint256(debtAfter), 0, "debt fully repaid");
        assertEq(uint256(collateralAfter), 0, "collateral fully withdrawn");
        assertEq(mocks.loanToken.balanceOf(address(executor)), 0, "no loan residual");
        assertEq(mocks.collateralToken.balanceOf(address(executor)), 0, "no collateral residual");
    }

    function _open(uint248 nonceSlot, uint8 nonceBit) private returns (LoopV1Types.LoopActionResult memory result) {
        LoopV1EIP712.Open memory action = _openAction(nonceSlot, nonceBit);
        bytes32 digest = auth.openDigest(action);
        result = executor.executeOpen(action, _sign(OWNER_PK, digest), _emptyEvidence(), bytes32(0));
    }

    function _exit(uint248 nonceSlot, uint256 collateral) private returns (LoopV1Types.LoopActionResult memory result) {
        LoopV1EIP712.Exit memory action = _exitAction(nonceSlot, 1, collateral);
        bytes32 digest = auth.exitDigest(action);
        result = executor.executeExit(action, _sign(OWNER_PK, digest), _emptyEvidence(), bytes32(0));
    }

    function _openAction(uint248 nonceSlot, uint8 nonceBit) private view returns (LoopV1EIP712.Open memory action) {
        action.identity = _identity(nonceSlot, nonceBit);
        action.freshness = _freshness();
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = _params();
        action.bounds.minWstDiemReceived = 1 ether;
        action.bounds.minBorrowedDiem = 1;
        action.bounds.maxBorrowedDiem = MAX_BORROW;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash();
    }

    function _exitAction(uint248 nonceSlot, uint8 nonceBit, uint256 collateral)
        private
        view
        returns (LoopV1EIP712.Exit memory action)
    {
        action.identity = _identity(nonceSlot, nonceBit);
        action.freshness = _freshness();
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = _params();
        action.bounds.minRepayment = 0;
        action.bounds.maxCollateralSold = collateral;
        action.bounds.repayOnly = false;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash();
    }

    function _identity(uint248 nonceSlot, uint8 nonceBit) private view returns (LoopV1EIP712.ActionIdentity memory) {
        return LoopV1EIP712.ActionIdentity({
            owner: owner,
            chainId: block.chainid,
            verifyingContract: address(auth),
            market: market,
            executor: address(executor),
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: 0,
            nonceSlot: nonceSlot,
            nonceBit: nonceBit
        });
    }

    function _freshness() private view returns (LoopV1EIP712.Freshness memory) {
        return LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 hours,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 20,
            maxQuoteDeviationBps: 0
        });
    }

    function _params() private view returns (LoopV1Types.MorphoMarketParams memory) {
        return LoopV1Types.MorphoMarketParams({
            loanToken: config.market.loanToken,
            collateralToken: config.market.collateralToken,
            oracle: config.market.oracle,
            irm: config.market.irm,
            lltv: config.market.lltv
        });
    }

    function _emptyEvidence() private view returns (LoopV1Types.ActionEvidence memory evidence) {
        evidence.owner = owner;
        evidence.market = market;
        evidence.blockNumber = block.number;
    }

    function _emptyEvidenceHash() private view returns (bytes32) {
        LoopV1Types.EvidenceSource[] memory sources = new LoopV1Types.EvidenceSource[](0);
        return keccak256(
            abi.encode(
                LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
                bytes32(0),
                bytes32(0),
                owner,
                market,
                block.number,
                uint16(0),
                keccak256(abi.encode(sources))
            )
        );
    }

    function _sign(uint256 privateKey, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
