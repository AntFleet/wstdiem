// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {DigestBuilder} from "./helpers/DigestBuilder.sol";
import {RegistryBatchHelpers} from "./helpers/RegistryBatchHelpers.sol";

contract MockMorphoBlue {
    struct CallRecord {
        bytes4 selector;
        LoopV1Types.MorphoMarketParams params;
        uint256 assets;
        uint256 shares;
        address onBehalf;
        address receiver;
        bytes data;
    }

    CallRecord[] public calls;
    bool public failBorrow;
    LoopAuthorization public reenterAuth;
    bytes32 public reenterDigest;
    bytes public reenterSig;
    bytes public reenterData;

    function setFailBorrow(bool fail) external {
        failBorrow = fail;
    }

    function setReenter(LoopAuthorization auth, bytes32 digest, bytes calldata sig, bytes calldata data) external {
        reenterAuth = auth;
        reenterDigest = digest;
        reenterSig = sig;
        reenterData = data;
    }

    function callCount() external view returns (uint256) {
        return calls.length;
    }

    function lastCall() external view returns (CallRecord memory) {
        return calls[calls.length - 1];
    }

    function supplyCollateral(
        LoopV1Types.MorphoMarketParams calldata params,
        uint256 assets,
        address onBehalf,
        bytes calldata data
    ) external {
        if (address(reenterAuth) != address(0)) {
            reenterAuth.executeMorpho(reenterDigest, reenterSig, reenterData);
        }
        calls.push(CallRecord(msg.sig, params, assets, 0, onBehalf, address(0), data));
    }

    function borrow(
        LoopV1Types.MorphoMarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256, uint256) {
        if (failBorrow) revert("borrow failed");
        calls.push(CallRecord(msg.sig, params, assets, shares, onBehalf, receiver, ""));
        return (assets, shares);
    }

    function repay(
        LoopV1Types.MorphoMarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata data
    ) external returns (uint256, uint256) {
        calls.push(CallRecord(msg.sig, params, assets, shares, onBehalf, address(0), data));
        return (assets, shares);
    }

    function withdrawCollateral(
        LoopV1Types.MorphoMarketParams calldata params,
        uint256 assets,
        address onBehalf,
        address receiver
    ) external {
        calls.push(CallRecord(msg.sig, params, assets, 0, onBehalf, receiver, ""));
    }
}

contract AuthorizationExecutorHarness {
    LoopAuthorization public immutable auth;

    constructor(LoopAuthorization auth_) {
        auth = auth_;
    }

    function validateOpen(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Open calldata action,
        LoopV1Types.ActionEvidence calldata evidence
    ) external {
        auth.validateOpen(digest, sig, action, evidence, bytes32(0));
    }

    function executeOpen(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Open calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes calldata supplyData,
        bytes calldata borrowData
    ) external {
        auth.validateOpen(digest, sig, action, evidence, bytes32(0));
        auth.executeMorpho(digest, sig, supplyData);
        auth.executeMorpho(digest, sig, borrowData);
    }

    function executeExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Exit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes calldata repayData,
        bytes calldata withdrawData
    ) external {
        auth.validateExit(digest, sig, action, evidence, bytes32(0));
        auth.executeMorpho(digest, sig, repayData);
        auth.executeMorpho(digest, sig, withdrawData);
    }

    function validateAutomationExec(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.AutomationExec calldata action,
        LoopV1Types.ActionEvidence calldata evidence
    ) external {
        auth.validateAutomationExec(digest, sig, action, evidence, bytes32(0));
    }

    function executeAutomation(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.AutomationExec calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes calldata repayData,
        bytes calldata withdrawData
    ) external {
        auth.validateAutomationExec(digest, sig, action, evidence, bytes32(0));
        auth.executeMorpho(digest, sig, repayData);
        auth.executeMorpho(digest, sig, withdrawData);
    }
}

contract AuthorizationTest is RegistryBatchHelpers, Test {
    using DigestBuilder for LoopAuthorization;

    uint256 private constant OWNER_PK = 0xA11CE;
    uint256 private constant WRONG_PK = 0xB0B;
    address private owner;
    address private wrongOwner;

    LoopRegistry private registry;
    LoopAuthorization private auth;
    MockMorphoBlue private morpho;
    AuthorizationExecutorHarness private executor;
    LoopV1Types.MorphoMarketParams private params;
    bytes32 private market;

    bytes4 private constant SUPPLY_COLLATERAL =
        bytes4(keccak256("supplyCollateral((address,address,address,address,uint256),uint256,address,bytes)"));
    bytes4 private constant BORROW =
        bytes4(keccak256("borrow((address,address,address,address,uint256),uint256,uint256,address,address)"));
    bytes4 private constant REPAY =
        bytes4(keccak256("repay((address,address,address,address,uint256),uint256,uint256,address,bytes)"));
    bytes4 private constant WITHDRAW_COLLATERAL =
        bytes4(keccak256("withdrawCollateral((address,address,address,address,uint256),uint256,address,address)"));

    function setUp() public {
        owner = vm.addr(OWNER_PK);
        wrongOwner = vm.addr(WRONG_PK);
        registry = new LoopRegistry(address(this));
        auth = new LoopAuthorization(registry);
        morpho = new MockMorphoBlue();
        executor = new AuthorizationExecutorHarness(auth);
        params =
            LoopV1Types.MorphoMarketParams(address(0x1001), address(0x1002), address(0x1003), address(0x1004), 8600);
        market = keccak256(abi.encode(params));

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](7);
        ops[0] = _opLoopAuthorization(address(auth));
        ops[1] = _opMorpho(address(morpho));
        ops[2] = _opMarket(market, params);
        ops[3] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(executor));
        ops[4] = _opExecutor(uint8(LoopV1Types.PrimaryType.REBALANCE), address(executor));
        ops[5] = _opExecutor(uint8(LoopV1Types.PrimaryType.EXIT), address(executor));
        ops[6] = _opSupportedMarket(market, true);
        _commit(registry, ops, bytes32(uint256(2)));
        ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC), address(executor));
        _commit(registry, ops, bytes32(uint256(3)));
        registry.setPermissionlessCallerAllowed(address(executor), true);
    }

    function testValidateOpenEoaHappyPath() public {
        LoopV1EIP712.Open memory action = _openAction(0, 1);
        bytes32 digest = auth.openDigest(action);
        executor.validateOpen(digest, _sign(OWNER_PK, digest), action, _emptyEvidence());
    }

    function testValidateOpenWrongSignerRevertsInvalidSignature() public {
        LoopV1EIP712.Open memory action = _openAction(0, 1);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.InvalidSignature.selector);
        executor.validateOpen(digest, _sign(WRONG_PK, digest), action, _emptyEvidence());
    }

    function testExecuteOpenSetsNonceAndForwardsMorphoCalls() public {
        LoopV1EIP712.Open memory action = _openAction(9, 7);
        bytes32 digest = auth.openDigest(action);
        executor.executeOpen(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(SUPPLY_COLLATERAL, params, 10 ether, owner, ""),
            abi.encodeWithSelector(BORROW, params, 7 ether, 0, owner, address(executor))
        );

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 9), 1 << 7);
        assertEq(morpho.callCount(), 2);
        MockMorphoBlue.CallRecord memory last = morpho.lastCall();
        assertEq(last.selector, BORROW);
        assertEq(last.receiver, address(executor));
        assertEq(last.assets, 7 ether);
    }

    function testTerminalMorphoRevertDoesNotConsumeNonce() public {
        LoopV1EIP712.Open memory action = _openAction(10, 2);
        bytes32 digest = auth.openDigest(action);
        morpho.setFailBorrow(true);

        vm.expectRevert(bytes("borrow failed"));
        executor.executeOpen(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(SUPPLY_COLLATERAL, params, 10 ether, owner, ""),
            abi.encodeWithSelector(BORROW, params, 7 ether, 0, owner, address(executor))
        );
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 10), 0);
    }

    function testBorrowReceiverOutsideExecutorReverts() public {
        LoopV1EIP712.Open memory action = _openAction(11, 3);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.ReceiverNotAllowed.selector);
        executor.executeOpen(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(SUPPLY_COLLATERAL, params, 10 ether, owner, ""),
            abi.encodeWithSelector(BORROW, params, 7 ether, 0, owner, wrongOwner)
        );
    }

    function testBorrowSharesModeReverts() public {
        LoopV1EIP712.Open memory action = _openAction(12, 4);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.MorphoSharesModeForbidden.selector);
        executor.executeOpen(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(SUPPLY_COLLATERAL, params, 10 ether, owner, ""),
            abi.encodeWithSelector(BORROW, params, 7 ether, 1, owner, address(executor))
        );
    }

    function testCallbackDataReverts() public {
        LoopV1EIP712.Open memory action = _openAction(13, 5);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.CallbackDataForbidden.selector);
        executor.executeOpen(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(SUPPLY_COLLATERAL, params, 10 ether, owner, hex"01"),
            abi.encodeWithSelector(BORROW, params, 7 ether, 0, owner, address(executor))
        );
    }

    function testAdversarialMarketParamsRejected() public {
        LoopV1EIP712.Open memory action = _openAction(14, 6);
        action.marketParams.loanToken = params.collateralToken;
        action.marketParams.collateralToken = params.loanToken;
        bytes32 digest = auth.openDigest(action);

        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.MorphoParamsMismatch.selector, uint8(3)));
        executor.validateOpen(digest, _sign(OWNER_PK, digest), action, _emptyEvidence());
    }

    function testReentryCallbackBlocked() public {
        LoopV1EIP712.Open memory action = _openAction(15, 7);
        bytes32 digest = auth.openDigest(action);
        bytes memory sig = _sign(OWNER_PK, digest);
        morpho.setReenter(
            auth, digest, sig, abi.encodeWithSelector(BORROW, params, 7 ether, 0, owner, address(executor))
        );

        vm.expectRevert(LoopV1Errors.ReentrantCallback.selector);
        executor.executeOpen(
            digest,
            sig,
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(SUPPLY_COLLATERAL, params, 10 ether, owner, ""),
            abi.encodeWithSelector(BORROW, params, 7 ether, 0, owner, address(executor))
        );
    }

    function testExecutionKindMismatchOwnerDirect() public {
        LoopV1EIP712.Open memory action = _openAction(16, 8);
        action.executionKind = LoopV1Types.ExecutionKind.OWNER_DIRECT;
        bytes32 digest = auth.openDigest(action);

        vm.expectRevert(LoopV1Errors.ExecutionKindMismatch.selector);
        executor.validateOpen(digest, _sign(OWNER_PK, digest), action, _emptyEvidence());
    }

    function testMevWaiverMissing() public {
        LoopV1EIP712.Open memory action = _openAction(17, 9);
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PUBLIC;
        action.mevWaiverBits = 0;
        bytes32 digest = auth.openDigest(action);

        vm.expectRevert(LoopV1Errors.MevWaiverMissing.selector);
        executor.validateOpen(digest, _sign(OWNER_PK, digest), action, _emptyEvidence());
    }

    function testEvidenceCanonicalFailures() public {
        bytes32 sourceA = LoopV1Types.SOURCE_MORPHO_POSITION;
        bytes32 sourceB = LoopV1Types.SOURCE_VAULT_NAV;
        bytes32[] memory required = _sortedOpenSources();
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](3);
        ops[0] = _opRequired(uint8(LoopV1Types.PrimaryType.OPEN), required);
        ops[1] = _opCanonical(market, sourceA, address(0xA));
        ops[2] = _opCanonical(market, sourceB, address(0xB));
        _commit(registry, ops, bytes32(uint256(4)));

        LoopV1Types.ActionEvidence memory evidence = _openEvidenceWithRequired(address(0xA), address(0xB));
        evidence.sources[1] = evidence.sources[0];
        _expectOpenEvidenceRevert(evidence, LoopV1Errors.EvidenceUnsorted.selector);

        evidence = _openEvidenceWithRequired(address(0xA), address(0xB));
        evidence.sources[0].sourceId = LoopV1Types.SOURCE_CURVE_QUOTE;
        _expectOpenEvidenceRevert(evidence, LoopV1Errors.EvidenceSourceUnexpected.selector);

        evidence = _evidenceWithOneSource(sourceA, address(0xA));
        _expectOpenEvidenceRevert(evidence, LoopV1Errors.EvidenceSourceMissing.selector);

        evidence = _openEvidenceWithRequired(address(0xA), address(0xC));
        _expectOpenEvidenceRevert(evidence, LoopV1Errors.EvidenceSourceAddressMismatch.selector);
    }

    function testExternalConfigDriftBlocks() public {
        LoopV1EIP712.Open memory action = _openAction(18, 10);
        bytes32 digest = auth.openDigest(action);
        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(
                registry.validateExternalConfig.selector, market, uint8(LoopV1Types.PrimaryType.OPEN)
            ),
            abi.encode(false)
        );

        vm.expectRevert(LoopV1Errors.ConfigIntegrityFailure.selector);
        executor.validateOpen(digest, _sign(OWNER_PK, digest), action, _emptyEvidence());
    }

    function testCancelNonceBlocksFutureExecution() public {
        vm.prank(owner);
        auth.cancelNonce(uint8(LoopV1Types.PrimaryType.OPEN), 19, 11);
        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 19), 1 << 11);

        LoopV1EIP712.Open memory action = _openAction(19, 11);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(LoopV1Errors.NonceAlreadyUsed.selector);
        executor.executeOpen(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(SUPPLY_COLLATERAL, params, 10 ether, owner, ""),
            abi.encodeWithSelector(BORROW, params, 7 ether, 0, owner, address(executor))
        );
    }

    function testCreatePolicyEnforcesForceExitAndAc17() public {
        vm.prank(owner);
        vm.expectRevert(LoopV1Errors.ForceExitPolicyNotAllowedInPhase1.selector);
        auth.createPolicy(
            owner, uint8(LoopV1Types.PrimaryType.FORCE_EXIT), 0, 5, bytes32(uint256(1)), block.number + 100
        );

        vm.prank(owner);
        vm.expectRevert(LoopV1Errors.Phase1AutomationScopeViolation.selector);
        auth.createPolicy(
            owner,
            uint8(LoopV1Types.PrimaryType.OPEN),
            uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS),
            uint8(LoopV1Types.PrimaryType.OPEN),
            bytes32(uint256(1)),
            block.number + 100
        );

        vm.prank(owner);
        uint64 policyId = auth.createPolicy(
            owner,
            uint8(LoopV1Types.PrimaryType.EXIT),
            uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS),
            3,
            bytes32(uint256(9)),
            block.number + 100
        );
        assertEq(policyId, 1);
        assertEq(auth.policyHash(owner, policyId), bytes32(uint256(9)));
    }

    function testValidateAutomationExecForceExitRejected() public {
        LoopV1EIP712.AutomationExec memory action = _automationAction(1, 20, 12, 5, bytes32(uint256(1)));
        bytes32 digest = auth.automationDigest(action);

        vm.expectRevert(LoopV1Errors.Phase1AutomationScopeViolation.selector);
        executor.validateAutomationExec(digest, _sign(OWNER_PK, digest), action, _emptyEvidence());
    }

    function testPolicyHashMismatchRejected() public {
        vm.prank(owner);
        uint64 policyId = auth.createPolicy(
            owner,
            uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC),
            uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS),
            3,
            bytes32(uint256(123)),
            block.number + 100
        );
        LoopV1EIP712.AutomationExec memory action = _automationAction(policyId, 21, 13, 3, bytes32(uint256(456)));
        bytes32 digest = auth.automationDigest(action);

        vm.expectRevert(LoopV1Errors.PolicyHashMismatch.selector);
        executor.validateAutomationExec(digest, _sign(OWNER_PK, digest), action, _emptyEvidence());
    }

    function testAutomationDeleverageBoundsRespected() public {
        bytes32 policyHash = bytes32(uint256(789));
        vm.prank(owner);
        uint64 policyId = auth.createPolicy(
            owner,
            uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC),
            uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS),
            4,
            policyHash,
            block.number + 100
        );
        LoopV1EIP712.AutomationExec memory action = _automationAction(policyId, 22, 14, 4, policyHash);
        bytes32 digest = auth.automationDigest(action);

        vm.expectRevert(LoopV1Errors.CollateralSoldExceeded.selector);
        executor.executeAutomation(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(REPAY, params, 1 ether, 0, owner, ""),
            abi.encodeWithSelector(WITHDRAW_COLLATERAL, params, 1, owner, address(executor))
        );
    }

    function _openAction(uint248 nonceSlot, uint8 nonceBit) private view returns (LoopV1EIP712.Open memory action) {
        action.identity = LoopV1EIP712.ActionIdentity({
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
        action.freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 days,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 10,
            maxQuoteDeviationBps: 0
        });
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.mevWaiverBits = 0;
        action.marketParams = params;
        action.bounds.minBorrowedDiem = 5 ether;
        action.bounds.maxBorrowedDiem = 8 ether;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(owner);
    }

    function _automationAction(
        uint64 policyId,
        uint248 nonceSlot,
        uint8 nonceBit,
        uint8 policyClass,
        bytes32 policyHash
    ) private view returns (LoopV1EIP712.AutomationExec memory action) {
        action.identity = LoopV1EIP712.ActionIdentity({
            owner: owner,
            chainId: block.chainid,
            verifyingContract: address(auth),
            market: market,
            executor: address(executor),
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: policyId,
            nonceSlot: nonceSlot,
            nonceBit: nonceBit
        });
        action.freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 days,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 10,
            maxQuoteDeviationBps: 0
        });
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.bounds.underlyingPrimaryType = policyClass;
        action.bounds.policyHash = policyHash;
        action.bounds.notBeforeBlock = block.number;
        action.bounds.notAfterBlock = block.number + 10;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(owner);
    }

    function _emptyEvidence() private view returns (LoopV1Types.ActionEvidence memory evidence) {
        evidence.owner = owner;
        evidence.market = market;
        evidence.blockNumber = block.number;
    }

    function _emptyEvidenceHash(address evidenceOwner) private view returns (bytes32) {
        LoopV1Types.EvidenceSource[] memory sources = new LoopV1Types.EvidenceSource[](0);
        return keccak256(
            abi.encode(
                LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
                bytes32(0),
                bytes32(0),
                evidenceOwner,
                market,
                block.number,
                uint16(0),
                keccak256(abi.encode(sources))
            )
        );
    }

    function _evidenceHash(LoopV1Types.ActionEvidence memory evidence) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
                evidence.actionId,
                evidence.evidenceSetId,
                evidence.owner,
                evidence.market,
                evidence.blockNumber,
                evidence.stateBitmap,
                keccak256(abi.encode(evidence.sources))
            )
        );
    }

    function _evidenceWithOneSource(bytes32 sourceId, address sourceAddress)
        private
        view
        returns (LoopV1Types.ActionEvidence memory evidence)
    {
        evidence = _emptyEvidence();
        evidence.sources = new LoopV1Types.EvidenceSource[](1);
        evidence.sources[0] =
            LoopV1Types.EvidenceSource(sourceId, sourceAddress, LoopV1Types.SourceStatus.FRESH, block.number, 0);
    }

    function _evidenceWithSources(bytes32 firstId, address firstAddress, bytes32 secondId, address secondAddress)
        private
        view
        returns (LoopV1Types.ActionEvidence memory evidence)
    {
        evidence = _emptyEvidence();
        evidence.sources = new LoopV1Types.EvidenceSource[](2);
        evidence.sources[0] =
            LoopV1Types.EvidenceSource(firstId, firstAddress, LoopV1Types.SourceStatus.FRESH, block.number, 0);
        evidence.sources[1] =
            LoopV1Types.EvidenceSource(secondId, secondAddress, LoopV1Types.SourceStatus.FRESH, block.number, 0);
    }

    function _openEvidenceWithRequired(address morphoAddress, address vaultAddress)
        private
        view
        returns (LoopV1Types.ActionEvidence memory evidence)
    {
        bytes32[] memory required = _sortedOpenSources();
        evidence = _emptyEvidence();
        evidence.sources = new LoopV1Types.EvidenceSource[](required.length);
        for (uint256 i = 0; i < required.length; i++) {
            address sourceAddress;
            if (required[i] == LoopV1Types.SOURCE_MORPHO_POSITION) sourceAddress = morphoAddress;
            if (required[i] == LoopV1Types.SOURCE_VAULT_NAV) sourceAddress = vaultAddress;
            evidence.sources[i] =
                LoopV1Types.EvidenceSource(required[i], sourceAddress, LoopV1Types.SourceStatus.FRESH, block.number, 0);
        }
    }

    function _expectOpenEvidenceRevert(LoopV1Types.ActionEvidence memory evidence, bytes4 selector) private {
        LoopV1EIP712.Open memory action = _openAction(100, 1);
        action.hashes.evidenceBundleHash = _evidenceHash(evidence);
        bytes32 digest = auth.openDigest(action);
        vm.expectRevert(selector);
        executor.validateOpen(digest, _sign(OWNER_PK, digest), action, evidence);
    }

    function _sign(uint256 privateKey, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
