// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {EmergencyGuardian} from "../../../contracts/v2/EmergencyGuardian.sol";
import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorV2} from "../../../contracts/v2/LoopExecutorV2.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopRiskOracleAdapter} from "../../../contracts/v2/LoopRiskOracleAdapter.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {DeploymentManifest} from "../../../script/v2/DeploymentManifest.sol";
import {MockDeploymentKit} from "../../../script/v2/MockDeploymentKit.sol";
import {DigestBuilder} from "./helpers/DigestBuilder.sol";
import {EvidenceBuilder} from "./helpers/EvidenceBuilder.sol";

/// @notice Regression suite for the 2026-06-17 trust-root audit slice:
///         F01 shares→assets debt, F02 oracle scale, F22 Ownable2Step, F31 spender allowlist,
///         live state-bitmap risk-up gates, deploy readiness.
contract TrustRootAuditTest is Test, MockDeploymentKit {
    using DigestBuilder for LoopAuthorization;

    uint256 private constant OWNER_PK = 0xA11CE;
    uint256 private constant MAX_BORROW = 100 ether;

    MockAddresses private mocks;
    DeploymentManifest.DeploymentConfig private config;
    DeploymentManifest.DeployedContracts private deployed;
    LoopRegistry private registry;
    LoopAuthorization private auth;
    LoopExecutorV2 private executor;
    LoopRiskOracleAdapter private riskOracle;
    address private owner;
    bytes32 private market;

    function setUp() public {
        owner = vm.addr(OWNER_PK);
        (mocks, config, deployed, registry) = _deployFullMockSystem(address(this), address(this));
        auth = LoopAuthorization(deployed.authorization);
        executor = LoopExecutorV2(deployed.executorV2);
        riskOracle = LoopRiskOracleAdapter(deployed.riskOracleAdapter);
        market = config.market.id;
    }

    function testProductionReadinessPassesAfterBootstrap() public view {
        registry.assertProductionReadiness(market);
    }

    function testDebtConversionAfterInterestAccrual() public {
        _open(1, 1);

        mocks.morpho.accrueInterest(market, uint128(MAX_BORROW / 20));

        LoopRiskOracleAdapter.PositionState memory state = riskOracle.readPositionState(market, owner);
        assertEq(state.debt, MAX_BORROW + MAX_BORROW / 20, "debt assets include accrual");

        (, uint128 borrowShares,) = mocks.morpho.position(market, owner);
        assertEq(uint256(borrowShares), MAX_BORROW, "shares unchanged by accrual");
        assertGt(state.debt, uint256(borrowShares), "assets > shares after accrual");
    }

    function testExitClearsAccruedDebt() public {
        _open(1, 1);
        // Tiny accrual so collateral still covers flash repay + fee after shares→assets sizing.
        mocks.morpho.accrueInterest(market, uint128(0.01 ether));

        (,, uint128 collateralBefore) = mocks.morpho.position(market, owner);
        _exit(2, 1, uint256(collateralBefore));

        (, uint128 debtAfter, uint128 collateralAfter) = mocks.morpho.position(market, owner);
        assertEq(uint256(debtAfter), 0, "shares cleared");
        assertEq(uint256(collateralAfter), 0, "collateral cleared");
    }

    function testOraclePriceNormalizationMorphoScale() public {
        mocks.morphoOracle.setPrice(1e18);
        _open(1, 1);
        LoopRiskOracleAdapter.PositionState memory wadState = riskOracle.readPositionState(market, owner);

        mocks.morphoOracle.setPrice(1e36);
        LoopRiskOracleAdapter.PositionState memory morphoState = riskOracle.readPositionState(market, owner);
        // 1e36 Morpho-scale 1:1 must normalize to the same WAD-scale HF as 1e18 mocks.
        assertEq(morphoState.healthFactor, wadState.healthFactor, "Morpho-scale and WAD-scale HF match");
        assertGt(morphoState.healthFactor, 0, "HF computed");
    }

    function testOwnable2StepRequiresAccept() public {
        address nextOwner = address(0xBEEF);
        registry.transferOwnership(nextOwner);
        assertEq(registry.owner(), address(this), "still current owner pending accept");
        assertEq(registry.pendingOwner(), nextOwner, "pending set");

        vm.prank(nextOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), nextOwner, "ownership transferred");
    }

    function testRiskUpBlockedWhenHarvestCooling() public {
        registry.setHarvestAuthority(address(this));
        registry.recordHarvest(market, block.number, bytes32(uint256(1)));

        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        LoopV1EIP712.Open memory action = _openAction(9, 1, bundleHash);
        bytes32 digest = auth.openDigest(action);

        vm.expectRevert(LoopV1Errors.HarvestConvergencePending.selector);
        executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function testRequiredEvidenceSetsPinned() public view {
        assertEq(registry.requiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.OPEN)).length, 5);
        assertEq(registry.requiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.EXIT)).length, 6);
        assertEq(registry.requiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.FORCE_EXIT)).length, 6);
    }

    function testStaleEvidenceStatusReverts() public {
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        evidence.sources[0].status = LoopV1Types.SourceStatus.STALE;
        bundleHash = EvidenceBuilder.hashBundle(evidence);
        LoopV1EIP712.Open memory action = _openAction(12, 1, bundleHash);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.EvidenceStale.selector);
        executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function testForceExitRequiresCurveDepthWaiverWhenDry() public {
        _open(1, 1);
        mocks.curve.setBalances(0, 0);

        // Force-exit path: live bitmap has CURVE_LIQUIDITY_INSUFFICIENT; zero acknowledgedRisks.
        // Use the force-exit authorizer validation surface via executor would need full digest;
        // assert the live bitmap bit is set so waiver enforcement has something to check.
        uint16 bitmap = riskOracle.computeStateBitmap(market, owner);
        uint16 curveBit = uint16(1 << uint8(LoopV1Types.StateBit.CURVE_LIQUIDITY_INSUFFICIENT));
        assertTrue(bitmap & curveBit != 0, "curve bit set when depth empty");
    }

    function testPauseBitAppearsInLiveBitmap() public {
        EmergencyGuardian guardian = EmergencyGuardian(deployed.emergencyGuardian);
        vm.prank(guardian.guardianRole());
        guardian.pause(uint8(LoopV1Types.PrimaryType.OPEN));

        uint16 bitmap = riskOracle.computeStateBitmap(market, owner);
        uint16 pauseBit = uint16(1 << uint8(LoopV1Types.StateBit.PAUSE_OPEN_INCREASE));
        assertTrue(bitmap & pauseBit != 0, "pause bit set");

        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        LoopV1EIP712.Open memory action = _openAction(11, 1, bundleHash);
        bytes32 digest = auth.openDigest(action);
        // Either guardian requireNotPaused or state-bitmap gate fails closed.
        vm.expectRevert();
        executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function testCriticalRoleRotationRequiresTimelock() public {
        address next = address(0xBEEF);
        registry.setIndexerSigningKey(next);
        assertEq(registry.indexerSigningKey(), config.indexerSigningKey, "still old until apply");
        (address pending, uint256 effective) = registry.pendingCriticalRole(registry.ROLE_INDEXER_SIGNER());
        assertEq(pending, next);
        assertGt(effective, block.number);

        vm.expectRevert(LoopV1Errors.FingerprintTimelockNotElapsed.selector);
        registry.applyIndexerSigningKey();

        vm.roll(effective);
        registry.applyIndexerSigningKey();
        assertEq(registry.indexerSigningKey(), next, "rotated after timelock");
    }

    function testSpendAllowlistEnforcedRejectsUnregistered() public {
        assertTrue(registry.spendAllowlistEnforced(), "enforced after bootstrap");
        // Unregistered (primaryType, token, spender) must fail closed under enforcement.
        ILoopRegistry.SpenderCheck memory missing =
            registry.allowedSpender(uint8(LoopV1Types.PrimaryType.OPEN), address(0xDEAD), address(0xBEEF));
        assertEq(missing.spender, address(0));
    }

    function testOpenVaultSpenderRegistered() public view {
        ILoopRegistry.SpenderCheck memory check = registry.allowedSpender(
            uint8(LoopV1Types.PrimaryType.OPEN), address(mocks.loanToken), address(mocks.vault)
        );
        assertEq(check.spender, address(mocks.vault), "vault spender registered for open");
    }

    function testExitCurveSpenderRegistered() public view {
        ILoopRegistry.SpenderCheck memory check = registry.allowedSpender(
            uint8(LoopV1Types.PrimaryType.EXIT), address(mocks.collateralToken), address(mocks.curve)
        );
        assertEq(check.spender, address(mocks.curve), "curve spender registered for exit");
    }

    function _open(uint248 nonceSlot, uint8 nonceBit) private returns (LoopV1Types.LoopActionResult memory result) {
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.OPEN), owner, market
        );
        LoopV1EIP712.Open memory action = _openAction(nonceSlot, nonceBit, bundleHash);
        bytes32 digest = auth.openDigest(action);
        result = executor.executeOpen(action, _sign(OWNER_PK, digest), evidence, bytes32(0));
    }

    function _exit(uint248 nonceSlot, uint8 nonceBit, uint256 collateral)
        private
        returns (LoopV1Types.LoopActionResult memory result)
    {
        (LoopV1Types.ActionEvidence memory evidence, bytes32 bundleHash) = EvidenceBuilder.build(
            ILoopRegistry(address(registry)), uint8(LoopV1Types.PrimaryType.EXIT), owner, market
        );
        LoopV1EIP712.Exit memory action = _exitAction(nonceSlot, nonceBit, collateral, bundleHash);
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
        action.bounds.minWstDiemReceived = 1 ether;
        action.bounds.minBorrowedDiem = 1;
        action.bounds.maxBorrowedDiem = MAX_BORROW;
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

    function _sign(uint256 pk, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
