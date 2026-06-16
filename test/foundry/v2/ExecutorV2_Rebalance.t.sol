// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorV2} from "../../../contracts/v2/LoopExecutorV2.sol";
import {IEmergencyGuardian} from "../../../contracts/v2/interfaces/IEmergencyGuardian.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {MorphoSelectors} from "../../../contracts/v2/libraries/MorphoSelectors.sol";
import {DigestBuilder} from "./helpers/DigestBuilder.sol";
import {RegistryBatchHelpers} from "./helpers/RegistryBatchHelpers.sol";

contract RebalanceMockMorpho {
    bytes4[] public selectors;

    function callCount() external view returns (uint256) {
        return selectors.length;
    }

    function supplyCollateral(LoopV1Types.MorphoMarketParams calldata, uint256, address, bytes calldata) external {
        selectors.push(msg.sig);
    }

    function borrow(LoopV1Types.MorphoMarketParams calldata, uint256 assets, uint256 shares, address, address)
        external
        returns (uint256, uint256)
    {
        selectors.push(msg.sig);
        return (assets, shares);
    }

    function repay(LoopV1Types.MorphoMarketParams calldata, uint256 assets, uint256 shares, address, bytes calldata)
        external
        returns (uint256, uint256)
    {
        selectors.push(msg.sig);
        return (assets, shares);
    }

    function withdrawCollateral(LoopV1Types.MorphoMarketParams calldata, uint256, address, address) external {
        selectors.push(msg.sig);
    }
}

contract RebalanceAuthorizationHarness {
    LoopAuthorization public immutable auth;

    constructor(LoopAuthorization auth_) {
        auth = auth_;
    }

    function execute(
        bytes32 digest,
        bytes calldata sig,
        LoopV1EIP712.Rebalance calldata action,
        LoopV1Types.ActionEvidence calldata evidence,
        bytes calldata first,
        bytes calldata second
    ) external {
        auth.validateRebalance(digest, sig, action, evidence, bytes32(0));
        auth.executeMorpho(digest, sig, first);
        if (second.length != 0) auth.executeMorpho(digest, sig, second);
    }
}

contract ExecutorV2RebalanceTest is RegistryBatchHelpers, Test {
    using DigestBuilder for LoopAuthorization;

    uint256 private constant OWNER_PK = 0xBEEF;
    address private owner;
    LoopRegistry private registry;
    LoopAuthorization private auth;
    LoopExecutorV2 private executor;
    RebalanceAuthorizationHarness private harness;
    RebalanceMockMorpho private morpho;
    LoopV1Types.MorphoMarketParams private params;
    bytes32 private market;

    function setUp() public {
        owner = vm.addr(OWNER_PK);
        registry = new LoopRegistry(address(this));
        auth = new LoopAuthorization(registry);
        executor = new LoopExecutorV2(auth, registry, IEmergencyGuardian(address(0)));
        harness = new RebalanceAuthorizationHarness(auth);
        morpho = new RebalanceMockMorpho();
        params =
            LoopV1Types.MorphoMarketParams(address(0x3101), address(0x3102), address(0x3103), address(0x3104), 8600);
        market = keccak256(abi.encode(params));

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](5);
        ops[0] = _opLoopAuthorization(address(auth));
        ops[1] = _opMorpho(address(morpho));
        ops[2] = _opMarket(market, params);
        ops[3] = _opExecutor(uint8(LoopV1Types.PrimaryType.REBALANCE), address(harness));
        ops[4] = _opSupportedMarket(market, true);
        _commit(registry, ops, bytes32(uint256(3)));
        registry.setPermissionlessCallerAllowed(address(harness), true);
    }

    function testExecutorRebalanceAmbiguousRevertsBeforeValidate() public {
        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(executor), 1, 1);
        vm.expectRevert(LoopV1Errors.RebalanceModeAmbiguous.selector);
        executor.executeRebalance(action, "", _emptyEvidence(), bytes32(0));
    }

    function testValidateRebalanceLeverageIncreaseArmsSupplyThenBorrow() public {
        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(harness), 7 ether, 0);
        bytes32 digest = auth.rebalanceDigest(action);
        bytes memory sig = _sign(OWNER_PK, digest);

        harness.execute(
            digest,
            sig,
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(MorphoSelectors.SUPPLY_COLLATERAL, params, 3 ether, owner, ""),
            abi.encodeWithSelector(MorphoSelectors.BORROW, params, 7 ether, 0, owner, address(harness))
        );

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 1), 2);
        assertEq(morpho.callCount(), 2);
    }

    function testValidateRebalanceLeverageIncreaseRejectsWithdrawSequence() public {
        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(harness), 7 ether, 0);
        bytes32 digest = auth.rebalanceDigest(action);

        vm.expectRevert(LoopV1Errors.MorphoSelectorOutOfOrder.selector);
        harness.execute(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(MorphoSelectors.WITHDRAW_COLLATERAL, params, 0, owner, address(harness)),
            ""
        );
    }

    function testValidateRebalancePartialDeleverageArmsRepayThenWithdraw() public {
        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(harness), 0, 4 ether);
        action.identity.nonceBit = 2;
        bytes32 digest = auth.rebalanceDigest(action);

        harness.execute(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(MorphoSelectors.REPAY, params, 1 ether, 0, owner, ""),
            abi.encodeWithSelector(MorphoSelectors.WITHDRAW_COLLATERAL, params, 4 ether, owner, address(harness))
        );

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 1), 4);
    }

    function testValidateRebalanceHealthRecoveryArmsRepayOnly() public {
        LoopV1EIP712.Rebalance memory action = _rebalanceAction(address(harness), 0, 0);
        action.identity.nonceBit = 3;
        bytes32 digest = auth.rebalanceDigest(action);

        harness.execute(
            digest,
            _sign(OWNER_PK, digest),
            action,
            _emptyEvidence(),
            abi.encodeWithSelector(MorphoSelectors.REPAY, params, 0, 0, owner, ""),
            ""
        );

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.REBALANCE), 1), 8);
    }

    function _rebalanceAction(address actionExecutor, uint256 maxDebtIncrease, uint256 maxCollateralSold)
        private
        view
        returns (LoopV1EIP712.Rebalance memory action)
    {
        action.identity = LoopV1EIP712.ActionIdentity({
            owner: owner,
            chainId: block.chainid,
            verifyingContract: address(auth),
            market: market,
            executor: actionExecutor,
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: 0,
            nonceSlot: 1,
            nonceBit: 1
        });
        action.freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 days,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 10,
            maxQuoteDeviationBps: 0
        });
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = params;
        action.bounds.maxDebtIncrease = maxDebtIncrease;
        action.bounds.maxCollateralSold = maxCollateralSold;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash();
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
