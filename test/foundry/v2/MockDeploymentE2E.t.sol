// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorV2} from "../../../contracts/v2/LoopExecutorV2.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1PositionMath} from "../../../contracts/v2/libraries/LoopV1PositionMath.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {DeploymentManifest} from "../../../script/v2/DeploymentManifest.sol";
import {MockDeploymentKit} from "../../../script/v2/MockDeploymentKit.sol";
import {DigestBuilder} from "./helpers/DigestBuilder.sol";
import {EvidenceBuilder} from "./helpers/EvidenceBuilder.sol";

/// @notice Local end-to-end proof that the full wstDIEM v2 system opens and exits a loop against
///         deployed mock external protocols (no RPC / fork). Deploys via the shared
///         `MockDeploymentKit`, exercises OPEN (flash -> vault deposit -> supplyCollateral ->
///         borrow) and EXIT (flash -> repay -> withdraw -> curve swap), and asserts the on-chain
///         gates (`validateExternalConfig`) pass throughout.
contract MockDeploymentE2ETest is Test, MockDeploymentKit {
    using DigestBuilder for LoopAuthorization;

    uint256 private constant OWNER_PK = 0xA11CE;

    MockAddresses private mocks;
    DeploymentManifest.DeploymentConfig private config;
    DeploymentManifest.DeployedContracts private deployed;
    LoopRegistry private registry;
    LoopAuthorization private auth;
    LoopExecutorV2 private executor;
    address private owner;
    bytes32 private market;

    uint256 private constant MAX_BORROW = 100 ether;
    uint256 private constant EQUITY = 50 ether;
    uint256 private constant MIN_HF = 1.05e18;

    function setUp() public {
        owner = vm.addr(OWNER_PK);
        (mocks, config, deployed, registry) = _deployFullMockSystem(address(this), address(this));
        auth = LoopAuthorization(deployed.authorization);
        executor = LoopExecutorV2(deployed.executorV2);
        market = config.market.id;
        mocks.collateralToken.mint(owner, 1_000 ether);
        vm.prank(owner);
        mocks.collateralToken.approve(address(executor), type(uint256).max);
    }

    function testExternalConfigGatesPassAgainstMocks() public view {
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN)), "open gate");
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.EXIT)), "exit gate");
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.REBALANCE)), "rebalance gate");
        assertEq(registry.requiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.OPEN)).length, 5, "open evidence");
        assertEq(registry.requiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.EXIT)).length, 6, "exit evidence");
    }

    function testOpenLoopEndToEndAgainstMocks() public {
        uint256 ownerEquityBefore = mocks.collateralToken.balanceOf(owner);
        LoopV1Types.LoopActionResult memory result = _open(1, 1);

        assertEq(result.borrowedDiem, MAX_BORROW, "borrowed matches budget");
        assertGt(result.collateralWstDiem, EQUITY, "collateral includes equity plus vault mint");
        assertEq(mocks.collateralToken.balanceOf(owner), ownerEquityBefore - EQUITY, "signed equity pulled");

        (, uint128 borrowShares, uint128 collateral) = mocks.morpho.position(market, owner);
        assertEq(uint256(borrowShares), MAX_BORROW, "morpho debt recorded");
        assertEq(uint256(collateral), result.collateralWstDiem, "morpho collateral is combined supply");
        (uint256 debt,, uint256 hf) = LoopV1PositionMath.readMorphoPosition(
            address(mocks.morpho), market, owner, _params()
        );
        assertEq(debt, MAX_BORROW, "debt assets match borrow");
        assertGe(hf, MIN_HF, "post-open HF meets launch bound");
        // Executor holds no residual token dust after the loop settles.
        assertEq(mocks.loanToken.balanceOf(address(executor)), 0, "no loan residual");
        assertEq(mocks.collateralToken.balanceOf(address(executor)), 0, "no collateral residual");
    }

    function testOpenRevertsZeroEquityCollateral() public {
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        LoopV1EIP712.Open memory action = _openAction(3, 1, bundleHash);
        action.bounds.equityCollateral = 0;
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.ZeroEquityCollateral.selector);
        executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function testOpenRevertsWhenVaultMintBelowFloorDespiteLargeEquity() public {
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        LoopV1EIP712.Open memory action = _openAction(4, 1, bundleHash);
        // Deposit mints 1:1 of the flash principal (~MAX_BORROW). A floor above that
        // must fail even though signed equity alone exceeds the floor.
        action.bounds.minWstDiemReceived = MAX_BORROW + 1 ether;
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.VaultDepositShortfall.selector);
        executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function testOpenRevertsWithoutOwnerApproval() public {
        vm.prank(owner);
        mocks.collateralToken.approve(address(executor), 0);
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        LoopV1EIP712.Open memory action = _openAction(5, 1, bundleHash);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.Erc20TransferFromFailed.selector);
        executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function testRebalanceLeverageIncreaseDoesNotPullOwnerEquity() public {
        _open(1, 1);
        (,, uint128 collateralBefore) = mocks.morpho.position(market, owner);
        uint256 ownerBefore = mocks.collateralToken.balanceOf(owner);

        uint256 extraDebt = 10 ether;
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.REBALANCE), owner, market
        );
        LoopV1EIP712.Rebalance memory action = _rebalanceIncreaseAction(6, 1, extraDebt, bundleHash);
        bytes32 digest = auth.rebalanceDigest(action);
        executor.executeRebalance(action, _sign(OWNER_PK, digest), evidence, bytes32(0));

        assertEq(mocks.collateralToken.balanceOf(owner), ownerBefore, "leverage-up must not pull owner wstDIEM");
        (,, uint128 collateralAfter) = mocks.morpho.position(market, owner);
        assertGt(uint256(collateralAfter), uint256(collateralBefore), "vault mint supplied as extra collateral");
        assertEq(mocks.loanToken.balanceOf(address(executor)), 0, "no loan residual");
        assertEq(mocks.collateralToken.balanceOf(address(executor)), 0, "no collateral residual");
    }

    function testOpenThenExitEndToEndAgainstMocks() public {
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
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        LoopV1EIP712.Open memory action = _openAction(nonceSlot, nonceBit, bundleHash);
        bytes32 digest = auth.openDigest(action);
        result = executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function _exit(uint248 nonceSlot, uint256 collateral)
        private
        returns (LoopV1Types.LoopActionResult memory result)
    {
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.EXIT), owner, market
        );
        LoopV1EIP712.Exit memory action = _exitAction(nonceSlot, 1, collateral, bundleHash);
        bytes32 digest = auth.exitDigest(action);
        result = executor.executeExit(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function _openAction(uint248 nonceSlot, uint8 nonceBit, bytes32 evidenceBundleHash)
        private
        view
        returns (LoopV1EIP712.Open memory action)
    {
        action.identity = _identity(nonceSlot, nonceBit);
        action.freshness = _freshness();
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = _params();
        action.bounds.equityCollateral = EQUITY;
        action.bounds.minWstDiemReceived = 1 ether;
        action.bounds.minBorrowedDiem = 1;
        action.bounds.maxBorrowedDiem = MAX_BORROW;
        action.bounds.minHealthFactor = MIN_HF;
        action.hashes.evidenceBundleHash = evidenceBundleHash;
    }

    function _rebalanceIncreaseAction(
        uint248 nonceSlot,
        uint8 nonceBit,
        uint256 maxDebtIncrease,
        bytes32 evidenceBundleHash
    ) private view returns (LoopV1EIP712.Rebalance memory action) {
        action.identity = _identity(nonceSlot, nonceBit);
        action.freshness = _freshness();
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = _params();
        action.bounds.maxDebtIncrease = maxDebtIncrease;
        action.bounds.maxCollateralSold = 0;
        action.bounds.minPostHealthFactor = MIN_HF;
        action.hashes.evidenceBundleHash = evidenceBundleHash;
    }

    function _exitAction(uint248 nonceSlot, uint8 nonceBit, uint256 collateral, bytes32 evidenceBundleHash)
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
        action.hashes.evidenceBundleHash = evidenceBundleHash;
    }

    function _identity(uint248 nonceSlot, uint8 nonceBit)
        private
        view
        returns (LoopV1EIP712.ActionIdentity memory identity)
    {
        identity = LoopV1EIP712.ActionIdentity({
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

    function _sign(uint256 privateKey, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
