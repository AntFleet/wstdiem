// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1EIP712} from "../../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1MorphoCalldata} from "../../../../contracts/v2/libraries/LoopV1MorphoCalldata.sol";
import {LoopV1Types} from "../../../../contracts/v2/libraries/LoopV1Types.sol";
import {DigestBuilder} from "../helpers/DigestBuilder.sol";
import {BaseMainnetForkSetup, IForkMorpho} from "./BaseMainnetForkSetup.sol";

contract ForkMorphoIntegrationTest is BaseMainnetForkSetup {
    bytes4 private constant SUPPLY_COLLATERAL = 0x238d6579;
    bytes4 private constant BORROW = 0x50d8cd4b;
    bytes4 private constant REPAY = 0x20b76e81;
    bytes4 private constant WITHDRAW_COLLATERAL = 0x8720316d;

    function testMorphoMarketParamsMatchRegistryPinnedCanonical() public view {
        (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) =
            IForkMorpho(venues.morpho).idToMarketParams(venues.market);
        assertEq(loanToken, venues.params.loanToken);
        assertEq(collateralToken, venues.params.collateralToken);
        assertEq(oracle, venues.params.oracle);
        assertEq(irm, venues.params.irm);
        assertEq(lltv, venues.params.lltv);
    }

    function testMorphoPositionReadReturnsSensibleValues() public view {
        (uint256 supplyShares, uint128 borrowShares, uint128 collateral) =
            IForkMorpho(venues.morpho).position(venues.market, owner);
        assertEq(supplyShares, 0);
        assertEq(borrowShares, 0);
        assertEq(collateral, 0);
    }

    function testMorphoMarketReadHasLiveLiquidity() public view {
        (uint128 totalSupplyAssets,, uint128 totalBorrowAssets,,,) = IForkMorpho(venues.morpho).market(venues.market);
        assertGt(totalSupplyAssets, 0);
        assertGt(totalBorrowAssets, 0);
        assertGt(totalSupplyAssets, totalBorrowAssets);
    }

    function testCalldataShapeRoundTripSupplyCollateralSelector() public pure {
        bytes memory data = LoopV1MorphoCalldata.supplyCollateral(_params(), 1 ether, address(0xA11CE));
        assertEq(bytes4(data), SUPPLY_COLLATERAL);
    }

    function testCalldataShapeRoundTripBorrowRepayWithdrawSelectors() public pure {
        LoopV1Types.MorphoMarketParams memory params = _params();
        assertEq(bytes4(LoopV1MorphoCalldata.borrow(params, 1e6, address(1), address(2))), BORROW);
        assertEq(bytes4(LoopV1MorphoCalldata.repay(params, 1e6, address(1))), REPAY);
        assertEq(
            bytes4(LoopV1MorphoCalldata.withdrawCollateral(params, 1 ether, address(1), address(2))),
            WITHDRAW_COLLATERAL
        );
    }

    function testExecuteMorphoSupplyThenBorrowAgainstRealMorpho() public {
        _openPosition(101, 1, 0.02 ether, 1e6);

        assertEq(auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 101), 2);
    }

    function testExecuteMorphoRepayAgainstRealMorphoReducesDebt() public {
        _openPosition(102, 2, 0.02 ether, 1e6);
        (, uint128 borrowSharesBefore,) = IForkMorpho(venues.morpho).position(venues.market, owner);
        assertGt(borrowSharesBefore, 0);

        _installTestExecutor(address(this), uint8(LoopV1Types.PrimaryType.EXIT));
        uint256 repayAssets = 500_000;
        deal(venues.params.loanToken, address(auth), repayAssets);
        LoopV1EIP712.Exit memory action = _exitAction(202, 3, repayAssets, 0, true);
        bytes32 digest = DigestBuilder.exitDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);

        auth.validateExit(digest, sig, action, _emptyEvidence(), bytes32(0));
        auth.executeMorpho(digest, sig, LoopV1MorphoCalldata.repay(venues.params, repayAssets, owner));

        (, uint128 borrowSharesAfter,) = IForkMorpho(venues.morpho).position(venues.market, owner);
        assertLt(borrowSharesAfter, borrowSharesBefore);
    }

    function testExecuteMorphoWithdrawCollateralAgainstRealMorphoUsesExecutorReceiver() public {
        _openPosition(103, 4, 0.02 ether, 1e6);
        (,, uint128 collateralBefore) = IForkMorpho(venues.morpho).position(venues.market, owner);
        assertGt(collateralBefore, 0);

        _installTestExecutor(address(this), uint8(LoopV1Types.PrimaryType.EXIT));
        uint256 repayAssets = 500_000;
        uint256 withdrawAssets = 0.001 ether;
        deal(venues.params.loanToken, address(auth), repayAssets);
        uint256 receiverBalanceBefore = _erc20Balance(venues.params.collateralToken, address(this));
        LoopV1EIP712.Exit memory action = _exitAction(203, 5, repayAssets, withdrawAssets, false);
        bytes32 digest = DigestBuilder.exitDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);

        auth.validateExit(digest, sig, action, _emptyEvidence(), bytes32(0));
        auth.executeMorpho(digest, sig, LoopV1MorphoCalldata.repay(venues.params, repayAssets, owner));
        auth.executeMorpho(
            digest, sig, LoopV1MorphoCalldata.withdrawCollateral(venues.params, withdrawAssets, owner, address(this))
        );

        (,, uint128 collateralAfter) = IForkMorpho(venues.morpho).position(venues.market, owner);
        assertLt(collateralAfter, collateralBefore);
        assertEq(_erc20Balance(venues.params.collateralToken, address(this)), receiverBalanceBefore + withdrawAssets);
    }

    function _params() private pure returns (LoopV1Types.MorphoMarketParams memory) {
        return LoopV1Types.MorphoMarketParams({
            loanToken: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,
            collateralToken: 0x4200000000000000000000000000000000000006,
            oracle: 0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4,
            irm: 0x46415998764C29aB2a25CbeA6254146D50D22687,
            lltv: 860000000000000000
        });
    }

    function _openPosition(uint248 nonceSlot, uint8 nonceBit, uint256 collateralAssets, uint256 borrowAssets) private {
        _installTestExecutor(address(this), uint8(LoopV1Types.PrimaryType.OPEN));
        vm.prank(owner);
        IForkMorpho(venues.morpho).setAuthorization(address(auth), true);
        deal(venues.params.collateralToken, address(auth), collateralAssets);

        LoopV1EIP712.Open memory action = _openAction(address(this), nonceSlot, nonceBit);
        bytes32 digest = DigestBuilder.openDigest(auth, action);
        bytes memory sig = _sign(OWNER_PK, digest);

        auth.validateOpen(digest, sig, action, _emptyEvidence(), bytes32(0));
        auth.executeMorpho(digest, sig, LoopV1MorphoCalldata.supplyCollateral(venues.params, collateralAssets, owner));
        auth.executeMorpho(digest, sig, LoopV1MorphoCalldata.borrow(venues.params, borrowAssets, owner, address(this)));
    }

    function _exitAction(
        uint248 nonceSlot,
        uint8 nonceBit,
        uint256 minRepayment,
        uint256 maxCollateralSold,
        bool repayOnly
    ) private view returns (LoopV1EIP712.Exit memory action) {
        action.identity = LoopV1EIP712.ActionIdentity({
            owner: owner,
            chainId: block.chainid,
            verifyingContract: address(auth),
            market: venues.market,
            executor: address(this),
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: 0,
            nonceSlot: nonceSlot,
            nonceBit: nonceBit
        });
        action.freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 hours,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 20,
            maxQuoteDeviationBps: 0
        });
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = venues.params;
        action.bounds.minRepayment = minRepayment;
        action.bounds.maxCollateralSold = maxCollateralSold;
        action.bounds.repayOnly = repayOnly;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(owner);
    }

    function _erc20Balance(address token, address account) private view returns (uint256 balance) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", account));
        require(ok && data.length >= 32, "balanceOf");
        balance = abi.decode(data, (uint256));
    }
}
