// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopForceExitAuthorizer} from "../../../contracts/v2/LoopForceExitAuthorizer.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {SignatureCheckerLib} from "../../../contracts/v2/libraries/SignatureCheckerLib.sol";
import {DigestBuilder} from "./helpers/DigestBuilder.sol";
import {MockSmartWallet} from "./helpers/MockSmartWallet.sol";
import {RegistryBatchHelpers} from "./helpers/RegistryBatchHelpers.sol";

contract ForceExitMockMorpho {
    function repay(LoopV1Types.MorphoMarketParams calldata, uint256 assets, uint256 shares, address, bytes calldata)
        external
        pure
        returns (uint256, uint256)
    {
        return (assets, shares);
    }

    function withdrawCollateral(LoopV1Types.MorphoMarketParams calldata, uint256, address, address) external pure {}
}

contract ForceExitExecutorHarness {
    LoopAuthorization public immutable auth;

    constructor(LoopAuthorization auth_) {
        auth = auth_;
    }

    function validateForceExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.ForceExit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        address executionCaller
    ) external {
        auth.validateForceExit(digest, sig, action, evidence, executionCaller, bytes32(0));
    }

    function executeForceExit(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.ForceExit calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        address executionCaller,
        bytes calldata repayData,
        bytes calldata withdrawData
    ) external {
        auth.validateForceExit(digest, sig, action, evidence, executionCaller, bytes32(0));
        auth.executeMorpho(digest, sig, repayData);
        auth.executeMorpho(digest, sig, withdrawData);
    }
}

contract ForceExitAuthorizerTest is RegistryBatchHelpers, Test {
    using DigestBuilder for LoopForceExitAuthorizer;

    uint256 private constant OWNER_PK = 0xF0CE;
    address private owner;
    address private executor;

    LoopRegistry private registry;
    LoopAuthorization private auth;
    LoopForceExitAuthorizer private forceAuthorizer;
    ForceExitExecutorHarness private forceExecutor;
    ForceExitMockMorpho private morpho;
    LoopV1Types.MorphoMarketParams private params;
    bytes32 private market;

    function setUp() public {
        owner = vm.addr(OWNER_PK);
        registry = new LoopRegistry(address(this));
        auth = new LoopAuthorization(registry);
        forceAuthorizer = new LoopForceExitAuthorizer(registry);
        forceExecutor = new ForceExitExecutorHarness(auth);
        morpho = new ForceExitMockMorpho();
        executor = address(forceExecutor);
        params =
            LoopV1Types.MorphoMarketParams(address(0x2001), address(0x2002), address(0x2003), address(0x2004), 8600);
        market = keccak256(abi.encode(params));

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](6);
        ops[0] = _opLoopAuthorization(address(auth));
        ops[1] = _opForceAuthorizer(address(forceAuthorizer));
        ops[2] = _opExecutor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT), executor);
        ops[3] = _opMorpho(address(morpho));
        ops[4] = _opMarket(market, params);
        ops[5] = _opSupportedMarket(market, true);
        _commit(registry, ops, bytes32(uint256(4)));
    }

    function testForceExitEoaHappyPath() public {
        LoopV1EIP712.ForceExit memory action = _forceExit(owner, address(forceAuthorizer));
        bytes32 digest = forceAuthorizer.forceExitDigest(action);
        forceAuthorizer.validateForceExitDigest(
            digest, _sign(OWNER_PK, digest), action, _emptyEvidence(owner), bytes32(0)
        );
    }

    function testForceExitDeadlineBound() public {
        LoopV1EIP712.ForceExit memory action = _forceExit(owner, address(forceAuthorizer));
        action.freshness.deadline = block.timestamp + 25 hours;
        bytes32 digest = forceAuthorizer.forceExitDigest(action);

        vm.expectRevert(LoopV1Errors.ForceExitDeadlineExceedsBound.selector);
        forceAuthorizer.validateForceExitDigest(
            digest, _sign(OWNER_PK, digest), action, _emptyEvidence(owner), bytes32(0)
        );
    }

    function testForceExitWaiverMinimality() public {
        LoopV1EIP712.ForceExit memory action = _forceExit(owner, address(forceAuthorizer));
        action.bounds.acknowledgedRisks =
            LoopV1Types.RISK_STALE_ORACLE_OVERRIDE | LoopV1Types.RISK_INSUFFICIENT_CURVE_DEPTH;
        bytes32 digest = forceAuthorizer.forceExitDigest(action);

        vm.expectRevert(LoopV1Errors.ForceExitWaiverOverbroad.selector);
        forceAuthorizer.validateForceExitDigest(
            digest, _sign(OWNER_PK, digest), action, _emptyEvidence(owner), bytes32(0)
        );

        action.bounds.acknowledgedRisks = LoopV1Types.RISK_LOOSE_SLIPPAGE | LoopV1Types.RISK_STALE_ORACLE_OVERRIDE;
        digest = forceAuthorizer.forceExitDigest(action);
        forceAuthorizer.validateForceExitDigest(
            digest, _sign(OWNER_PK, digest), action, _emptyEvidence(owner), bytes32(0)
        );
    }

    function testForceExitDistinctVerifyingContract() public {
        LoopV1EIP712.ForceExit memory action = _forceExit(owner, address(auth));
        bytes32 digest = forceAuthorizer.forceExitDigest(action);

        vm.expectRevert(LoopV1Errors.InvalidSignature.selector);
        forceAuthorizer.validateForceExitDigest(
            digest, _sign(OWNER_PK, digest), action, _emptyEvidence(owner), bytes32(0)
        );
    }

    function testEip1271ForceExitRequiresAttestationOrAllowList() public {
        MockSmartWallet wallet = new MockSmartWallet();
        LoopV1EIP712.ForceExit memory action = _forceExit(address(wallet), address(forceAuthorizer));
        bytes32 digest = forceAuthorizer.forceExitDigest(action);
        wallet.setValidDigest(digest, true);

        vm.expectRevert(LoopV1Errors.Eip1271PreimageNotAttested.selector);
        forceAuthorizer.validateForceExitDigest(digest, "", action, _emptyEvidence(address(wallet)), bytes32(0));

        registry.setPreimageDisplayGuaranteedWallet(address(wallet), true);
        forceAuthorizer.validateForceExitDigest(digest, "", action, _emptyEvidence(address(wallet)), bytes32(0));
    }

    function testEip1271PreimageProofHashAcceptedByGate() public {
        MockSmartWallet wallet = new MockSmartWallet();
        bytes32 proof = SignatureCheckerLib.preimageProofHash(
            address(wallet),
            uint8(LoopV1Types.PrimaryType.FORCE_EXIT),
            uint8(LoopV1Types.ExecutionKind.OWNER_DIRECT),
            uint8(LoopV1Types.MevProtectionMode.PRIVATE_BUILDER),
            0,
            LoopV1Types.RISK_STALE_ORACLE_OVERRIDE,
            5,
            market,
            registry.registryVersion(),
            0,
            1,
            0,
            0,
            0,
            address(forceAuthorizer)
        );

        assertTrue(
            forceAuthorizer.validateHighRiskPolicy(
                address(wallet),
                bytes32(uint256(1)),
                uint8(LoopV1Types.PrimaryType.FORCE_EXIT),
                uint8(LoopV1Types.ExecutionKind.OWNER_DIRECT),
                uint8(LoopV1Types.MevProtectionMode.PRIVATE_BUILDER),
                0,
                LoopV1Types.RISK_STALE_ORACLE_OVERRIDE,
                market,
                registry.registryVersion(),
                0,
                1,
                proof
            )
        );
    }

    function testForceExitReplayRejected() public {
        LoopV1EIP712.ForceExit memory action = _forceExit(owner, address(forceAuthorizer));
        bytes32 digest = forceAuthorizer.forceExitDigest(action);
        bytes memory sig = _sign(OWNER_PK, digest);

        forceExecutor.executeForceExit(
            digest,
            sig,
            action,
            _emptyEvidence(owner),
            owner,
            abi.encodeWithSelector(
                bytes4(keccak256("repay((address,address,address,address,uint256),uint256,uint256,address,bytes)")),
                params,
                1 ether,
                0,
                owner,
                ""
            ),
            abi.encodeWithSelector(
                bytes4(
                    keccak256("withdrawCollateral((address,address,address,address,uint256),uint256,address,address)")
                ),
                params,
                1 ether,
                owner,
                executor
            )
        );

        vm.expectRevert(LoopV1Errors.NonceAlreadyUsed.selector);
        forceExecutor.executeForceExit(
            digest,
            sig,
            action,
            _emptyEvidence(owner),
            owner,
            abi.encodeWithSelector(
                bytes4(keccak256("repay((address,address,address,address,uint256),uint256,uint256,address,bytes)")),
                params,
                1 ether,
                0,
                owner,
                ""
            ),
            abi.encodeWithSelector(
                bytes4(
                    keccak256("withdrawCollateral((address,address,address,address,uint256),uint256,address,address)")
                ),
                params,
                1 ether,
                owner,
                executor
            )
        );
    }

    function testForceExitNonOwnerDirectRejected() public {
        LoopV1EIP712.ForceExit memory action = _forceExit(owner, address(forceAuthorizer));
        bytes32 digest = forceAuthorizer.forceExitDigest(action);

        vm.expectRevert(LoopV1Errors.ExecutionKindMismatch.selector);
        forceExecutor.validateForceExit(digest, _sign(OWNER_PK, digest), action, _emptyEvidence(owner), address(0xBAD));
    }

    /// @dev PB2-fix-2 regression: validateForceExit MUST revert ActionContextAlreadyArmed when called against
    /// an already-armed action-context slot. Closes audit PB2-fix-C High-1 + Claude-verifier Missed-1
    /// (cross-action AutomationExec nonce leakage shares the same root cause).
    function testValidateForceExitContextOverwriteRejected() public {
        LoopV1EIP712.ForceExit memory action = _forceExit(owner, address(forceAuthorizer));
        bytes32 digest = forceAuthorizer.forceExitDigest(action);
        bytes memory sig = _sign(OWNER_PK, digest);

        // First validate arms the action-context slot successfully.
        forceExecutor.validateForceExit(digest, sig, action, _emptyEvidence(owner), owner);

        // Second validate (before terminal executeMorpho clears context) must revert.
        vm.expectRevert(LoopV1Errors.ActionContextAlreadyArmed.selector);
        forceExecutor.validateForceExit(digest, sig, action, _emptyEvidence(owner), owner);
    }

    function _forceExit(address actionOwner, address verifyingContract)
        private
        view
        returns (LoopV1EIP712.ForceExit memory action)
    {
        action.identity = LoopV1EIP712.ActionIdentity({
            owner: actionOwner,
            chainId: block.chainid,
            verifyingContract: verifyingContract,
            market: market,
            executor: executor,
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: 0,
            nonceSlot: 0,
            nonceBit: 1
        });
        action.freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 hours,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 10,
            maxQuoteDeviationBps: 0
        });
        action.executionKind = LoopV1Types.ExecutionKind.OWNER_DIRECT;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = params;
        action.bounds.minRepayment = 1 ether;
        action.bounds.maxCollateralSold = 2 ether;
        action.bounds.acknowledgedRisks = LoopV1Types.RISK_STALE_ORACLE_OVERRIDE;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(actionOwner);
    }

    function _emptyEvidence(address evidenceOwner) private view returns (LoopV1Types.ActionEvidence memory evidence) {
        evidence.owner = evidenceOwner;
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

    function _sign(uint256 privateKey, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
