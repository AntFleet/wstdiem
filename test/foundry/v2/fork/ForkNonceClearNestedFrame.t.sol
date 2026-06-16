// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1EIP712} from "../../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1MorphoCalldata} from "../../../../contracts/v2/libraries/LoopV1MorphoCalldata.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {DigestBuilder} from "../helpers/DigestBuilder.sol";
import {NestedFrameProbe} from "./helpers/NestedFrameProbe.sol";
import {BaseMainnetForkSetup, IForkMorpho} from "./BaseMainnetForkSetup.sol";

contract OuterRevertingOrchestrator {
    error IntentionalOuterRevert();

    LoopAuthorizationLike private immutable auth;

    constructor(address auth_) {
        auth = LoopAuthorizationLike(auth_);
    }

    function validateOpen(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Open calldata action,
        LoopV1Types.ActionEvidence calldata evidence
    ) external {
        auth.validateOpen(digest, sig, action, evidence, bytes32(0));
    }

    function validateExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Exit calldata action,
        LoopV1Types.ActionEvidence calldata evidence
    ) external {
        auth.validateExit(digest, sig, action, evidence, bytes32(0));
    }

    function validateRebalance(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Rebalance calldata action,
        LoopV1Types.ActionEvidence calldata evidence
    ) external {
        auth.validateRebalance(digest, sig, action, evidence, bytes32(0));
    }

    function executeOpenThenRevert(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Open calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes calldata supplyCalldata,
        bytes calldata terminalCalldata
    ) external {
        auth.validateOpen(digest, sig, action, evidence, bytes32(0));
        auth.executeMorpho(digest, sig, supplyCalldata);
        auth.executeMorpho(digest, sig, terminalCalldata);
        revert IntentionalOuterRevert();
    }

    function executeExitThenRevert(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Exit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes calldata firstCalldata,
        bytes calldata terminalCalldata
    ) external {
        auth.validateExit(digest, sig, action, evidence, bytes32(0));
        if (firstCalldata.length != 0) auth.executeMorpho(digest, sig, firstCalldata);
        auth.executeMorpho(digest, sig, terminalCalldata);
        revert IntentionalOuterRevert();
    }

    function executeRebalanceThenRevert(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Rebalance calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes calldata firstCalldata,
        bytes calldata terminalCalldata
    ) external {
        auth.validateRebalance(digest, sig, action, evidence, bytes32(0));
        if (firstCalldata.length != 0) auth.executeMorpho(digest, sig, firstCalldata);
        auth.executeMorpho(digest, sig, terminalCalldata);
        revert IntentionalOuterRevert();
    }

    function executeMorpho(bytes32 digest, bytes calldata sig, bytes calldata morphoCalldata) external {
        auth.executeMorpho(digest, sig, morphoCalldata);
    }
}

interface LoopAuthorizationLike {
    function validateOpen(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Open calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);
    function validateExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Exit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);
    function validateRebalance(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Rebalance calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes32 eip1271PreimageDisplayProof
    ) external returns (LoopV1Types.ValidationResult memory);
    function executeMorpho(bytes32 digest, bytes calldata sig, bytes calldata morphoCalldata)
        external
        returns (bytes memory);
}

contract ForkNonceClearNestedFrameTest is BaseMainnetForkSetup {
    NestedFrameProbe private probe;
    OuterRevertingOrchestrator private outer;

    function setUp() public override {
        super.setUp();
        if (!forkActive) return;
        probe = new NestedFrameProbe(auth);
        outer = new OuterRevertingOrchestrator(address(auth));
        _installTestExecutor(address(probe), uint8(LoopV1Types.PrimaryType.OPEN));
        vm.prank(owner);
        IForkMorpho(venues.morpho).setAuthorization(address(auth), true);
    }

    function testScenarioAInnerRevertLeavesContextUsableAndNonceUnconsumed() public {
        LoopV1EIP712.Open memory action = _openAction(address(probe), 500, 0);
        bytes32 digest = DigestBuilder.openDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        probe.validateOpen(digest, sig, action, _emptyEvidence());

        (bool reverted, bool nonceConsumedAfter) = probe.probeRevert(
            digest, sig, LoopV1MorphoCalldata.supplyCollateral(venues.params, 0.01 ether, owner), owner
        );
        assertTrue(reverted);
        assertFalse(nonceConsumedAfter);

        deal(venues.params.collateralToken, address(auth), 0.02 ether);
        probe.executeMorpho(digest, sig, LoopV1MorphoCalldata.supplyCollateral(venues.params, 0.01 ether, owner));
        probe.executeMorpho(digest, sig, LoopV1MorphoCalldata.borrow(venues.params, 1e6, owner, address(probe)));
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 500), 1);
    }

    function testScenarioBTerminalRevertRollsBackNonceConsumption() public {
        deal(venues.params.collateralToken, address(auth), 0.02 ether);
        LoopV1EIP712.Open memory action = _openAction(address(probe), 500, 1);
        bytes32 digest = DigestBuilder.openDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        probe.validateOpen(digest, sig, action, _emptyEvidence());
        probe.executeMorpho(digest, sig, LoopV1MorphoCalldata.supplyCollateral(venues.params, 0.01 ether, owner));

        (bool reverted, bool nonceConsumedAfter) = probe.probeRevert(
            digest, sig, LoopV1MorphoCalldata.borrow(venues.params, 1_000_000_000e6, owner, address(probe)), owner
        );
        assertTrue(reverted);
        assertFalse(nonceConsumedAfter);
    }

    function testScenarioBOuterTransactionRevertRollsBackNonceAndActionContext() public {
        _installTestExecutor(address(outer), uint8(LoopV1Types.PrimaryType.OPEN));
        deal(venues.params.collateralToken, address(auth), 0.02 ether);

        LoopV1EIP712.Open memory action = _openAction(address(outer), 501, 4);
        bytes32 digest = DigestBuilder.openDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        bytes memory supplyCalldata = LoopV1MorphoCalldata.supplyCollateral(venues.params, 0.01 ether, owner);
        bytes memory terminalCalldata = LoopV1MorphoCalldata.borrow(venues.params, 1e6, owner, address(outer));

        vm.expectRevert(OuterRevertingOrchestrator.IntentionalOuterRevert.selector);
        outer.executeOpenThenRevert(digest, sig, action, _emptyEvidence(), supplyCalldata, terminalCalldata);

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 501), 0);

        outer.validateOpen(digest, sig, action, _emptyEvidence());
        outer.executeMorpho(digest, sig, supplyCalldata);
        outer.executeMorpho(digest, sig, terminalCalldata);
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 501), 1 << 4);
    }

    function testScenarioBOuterRevertCoversExitRepayTerminalSelector() public {
        _seedOpenPosition(510, 1);
        _installTestExecutor(address(outer), uint8(LoopV1Types.PrimaryType.EXIT));
        uint256 repayAssets = 500_000;
        deal(venues.params.loanToken, address(auth), repayAssets);

        LoopV1EIP712.Exit memory action = _exitAction(address(outer), 601, 2, repayAssets, 0, true);
        bytes32 digest = DigestBuilder.exitDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        bytes memory repayCalldata = LoopV1MorphoCalldata.repay(venues.params, repayAssets, owner);

        vm.expectRevert(OuterRevertingOrchestrator.IntentionalOuterRevert.selector);
        outer.executeExitThenRevert(digest, sig, action, _emptyEvidence(), "", repayCalldata);

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.EXIT), 601), 0);
        outer.validateExit(digest, sig, action, _emptyEvidence());
        outer.executeMorpho(digest, sig, repayCalldata);
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.EXIT), 601), 1 << 2);
    }

    function testScenarioBOuterRevertCoversExitWithdrawTerminalSelector() public {
        _seedOpenPosition(511, 1);
        _installTestExecutor(address(outer), uint8(LoopV1Types.PrimaryType.EXIT));
        uint256 repayAssets = 500_000;
        uint256 withdrawAssets = 0.001 ether;
        deal(venues.params.loanToken, address(auth), repayAssets);

        LoopV1EIP712.Exit memory action = _exitAction(address(outer), 602, 3, repayAssets, withdrawAssets, false);
        bytes32 digest = DigestBuilder.exitDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        bytes memory repayCalldata = LoopV1MorphoCalldata.repay(venues.params, repayAssets, owner);
        bytes memory withdrawCalldata =
            LoopV1MorphoCalldata.withdrawCollateral(venues.params, withdrawAssets, owner, address(outer));

        vm.expectRevert(OuterRevertingOrchestrator.IntentionalOuterRevert.selector);
        outer.executeExitThenRevert(digest, sig, action, _emptyEvidence(), repayCalldata, withdrawCalldata);

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.EXIT), 602), 0);
        outer.validateExit(digest, sig, action, _emptyEvidence());
        outer.executeMorpho(digest, sig, repayCalldata);
        outer.executeMorpho(digest, sig, withdrawCalldata);
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.EXIT), 602), 1 << 3);
    }

    function testScenarioBOuterRevertCoversRebalanceBorrowTerminalSelector() public {
        _installTestExecutor(address(outer), uint8(LoopV1Types.PrimaryType.REBALANCE));
        deal(venues.params.collateralToken, address(auth), 0.02 ether);

        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(outer), 603, 4, 0, 1e6);
        bytes32 digest = DigestBuilder.rebalanceDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        bytes memory supplyCalldata = LoopV1MorphoCalldata.supplyCollateral(venues.params, 0.01 ether, owner);
        bytes memory borrowCalldata = LoopV1MorphoCalldata.borrow(venues.params, 1e6, owner, address(outer));

        vm.expectRevert(OuterRevertingOrchestrator.IntentionalOuterRevert.selector);
        outer.executeRebalanceThenRevert(digest, sig, action, _emptyEvidence(), supplyCalldata, borrowCalldata);

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 603), 0);
        outer.validateRebalance(digest, sig, action, _emptyEvidence());
        outer.executeMorpho(digest, sig, supplyCalldata);
        outer.executeMorpho(digest, sig, borrowCalldata);
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 603), 1 << 4);
    }

    function testScenarioBOuterRevertCoversRebalanceRepayTerminalSelector() public {
        _seedOpenPosition(512, 1);
        _installTestExecutor(address(outer), uint8(LoopV1Types.PrimaryType.REBALANCE));
        uint256 repayAssets = 500_000;
        deal(venues.params.loanToken, address(auth), repayAssets);

        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(outer), 604, 5, 0, 0);
        bytes32 digest = DigestBuilder.rebalanceDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        bytes memory repayCalldata = LoopV1MorphoCalldata.repay(venues.params, repayAssets, owner);

        vm.expectRevert(OuterRevertingOrchestrator.IntentionalOuterRevert.selector);
        outer.executeRebalanceThenRevert(digest, sig, action, _emptyEvidence(), "", repayCalldata);

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 604), 0);
        outer.validateRebalance(digest, sig, action, _emptyEvidence());
        outer.executeMorpho(digest, sig, repayCalldata);
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 604), 1 << 5);
    }

    function testScenarioBOuterRevertCoversRebalanceWithdrawTerminalSelector() public {
        _seedOpenPosition(513, 1);
        _installTestExecutor(address(outer), uint8(LoopV1Types.PrimaryType.REBALANCE));
        uint256 repayAssets = 500_000;
        uint256 withdrawAssets = 0.001 ether;
        deal(venues.params.loanToken, address(auth), repayAssets);

        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(outer), 605, 6, withdrawAssets, 0);
        bytes32 digest = DigestBuilder.rebalanceDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        bytes memory repayCalldata = LoopV1MorphoCalldata.repay(venues.params, repayAssets, owner);
        bytes memory withdrawCalldata =
            LoopV1MorphoCalldata.withdrawCollateral(venues.params, withdrawAssets, owner, address(outer));

        vm.expectRevert(OuterRevertingOrchestrator.IntentionalOuterRevert.selector);
        outer.executeRebalanceThenRevert(digest, sig, action, _emptyEvidence(), repayCalldata, withdrawCalldata);

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 605), 0);
        outer.validateRebalance(digest, sig, action, _emptyEvidence());
        outer.executeMorpho(digest, sig, repayCalldata);
        outer.executeMorpho(digest, sig, withdrawCalldata);
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 605), 1 << 6);
    }

    function testScenarioCCrossActionOverwriteBlockedAfterNonTerminalSuccess() public {
        deal(venues.params.collateralToken, address(auth), 0.02 ether);
        LoopV1EIP712.Open memory action = _openAction(address(probe), 500, 2);
        bytes32 digest = DigestBuilder.openDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        probe.validateOpen(digest, sig, action, _emptyEvidence());
        probe.executeMorpho(digest, sig, LoopV1MorphoCalldata.supplyCollateral(venues.params, 0.01 ether, owner));

        LoopV1EIP712.Open memory other = _openAction(address(probe), 501, 0);
        bytes32 otherDigest = DigestBuilder.openDigest(auth, other);
        vm.expectRevert(LoopV1Errors.ActionContextAlreadyArmed.selector);
        probe.validateOpen(otherDigest, _sign(OWNER_PK, otherDigest), other, _emptyEvidence());
    }

    function testBoundaryExecuteWithoutValidateRevertsMissingContext() public {
        bytes32 digest = keccak256("pb8.missing");
        vm.expectRevert(LoopV1Errors.ActionContextMissing.selector);
        probe.executeMorpho(digest, "", LoopV1MorphoCalldata.supplyCollateral(venues.params, 1, owner));
    }

    function testBoundaryWrongDigestRejectedWhileContextArmed() public {
        LoopV1EIP712.Open memory action = _openAction(address(probe), 500, 3);
        bytes32 digest = DigestBuilder.openDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        probe.validateOpen(digest, sig, action, _emptyEvidence());
        vm.expectRevert(LoopV1Errors.ActionContextDigestMismatch.selector);
        probe.executeMorpho(keccak256("wrong"), sig, LoopV1MorphoCalldata.supplyCollateral(venues.params, 1, owner));
    }

    function _seedOpenPosition(uint248 nonceSlot, uint8 nonceBit) private {
        deal(venues.params.collateralToken, address(auth), 0.02 ether);
        LoopV1EIP712.Open memory action = _openAction(address(probe), nonceSlot, nonceBit);
        bytes32 digest = DigestBuilder.openDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);
        probe.validateOpen(digest, sig, action, _emptyEvidence());
        probe.executeMorpho(digest, sig, LoopV1MorphoCalldata.supplyCollateral(venues.params, 0.02 ether, owner));
        probe.executeMorpho(digest, sig, LoopV1MorphoCalldata.borrow(venues.params, 1e6, owner, address(probe)));
    }

    function _exitAction(
        address executor,
        uint248 nonceSlot,
        uint8 nonceBit,
        uint256 minRepayment,
        uint256 maxCollateralSold,
        bool repayOnly
    ) private view returns (LoopV1EIP712.Exit memory action) {
        action.identity = _identity(executor, nonceSlot, nonceBit);
        action.freshness = _freshness();
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = venues.params;
        action.bounds.minRepayment = minRepayment;
        action.bounds.maxCollateralSold = maxCollateralSold;
        action.bounds.repayOnly = repayOnly;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(owner);
    }

    function _rebalanceAction(
        address executor,
        uint248 nonceSlot,
        uint8 nonceBit,
        uint256 maxCollateralSold,
        uint256 maxDebtIncrease
    ) private view returns (LoopV1EIP712.Rebalance memory action) {
        action.identity = _identity(executor, nonceSlot, nonceBit);
        action.freshness = _freshness();
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = venues.params;
        action.bounds.maxCollateralSold = maxCollateralSold;
        action.bounds.maxDebtIncrease = maxDebtIncrease;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(owner);
    }

    function _identity(address executor, uint248 nonceSlot, uint8 nonceBit)
        private
        view
        returns (LoopV1EIP712.ActionIdentity memory identity)
    {
        identity = LoopV1EIP712.ActionIdentity({
            owner: owner,
            chainId: block.chainid,
            verifyingContract: address(auth),
            market: venues.market,
            executor: executor,
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: 0,
            nonceSlot: nonceSlot,
            nonceBit: nonceBit
        });
    }

    function _freshness() private view returns (LoopV1EIP712.Freshness memory freshness) {
        freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 hours,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 20,
            maxQuoteDeviationBps: 0
        });
    }
}
