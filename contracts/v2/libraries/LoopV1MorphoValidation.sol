// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
import {LoopV1Errors} from "./LoopV1Errors.sol";
import {LoopV1Types} from "./LoopV1Types.sol";
import {MorphoSelectors} from "./MorphoSelectors.sol";

library LoopV1MorphoValidation {
    struct Context {
        address owner;
        address executor;
        bytes32 market;
        uint8 primaryType;
        uint256 step;
        bytes4 terminalSelector;
        uint256 minBorrow;
        uint256 maxBorrow;
        uint256 minRepay;
        uint256 maxCollateral;
        uint256 maxDebtIncrease;
    }

    function validate(ILoopRegistry registry, bytes calldata morphoCalldata, Context memory ctx)
        public
        view
        returns (bytes4 selector, address tokenIn, uint256 tokenAmount)
    {
        selector = _selectorOf(morphoCalldata);
        (tokenIn, tokenAmount) = _validateMorphoCalldata(registry, selector, morphoCalldata, ctx);
        _enforceSequence(selector, ctx);
    }

    function _validateMorphoCalldata(
        ILoopRegistry registry,
        bytes4 selector,
        bytes calldata morphoCalldata,
        Context memory ctx
    ) private view returns (address tokenIn, uint256 tokenAmount) {
        if (selector == MorphoSelectors.SUPPLY_COLLATERAL) {
            (LoopV1Types.MorphoMarketParams memory params, uint256 assets, address onBehalf, bytes memory data) =
                abi.decode(morphoCalldata[4:], (LoopV1Types.MorphoMarketParams, uint256, address, bytes));
            _requireParams(registry, params, onBehalf, ctx);
            if (data.length != 0) revert LoopV1Errors.CallbackDataForbidden();
            return (params.collateralToken, assets);
        }
        if (selector == MorphoSelectors.BORROW) {
            (
                LoopV1Types.MorphoMarketParams memory params,
                uint256 assets,
                uint256 shares,
                address onBehalf,
                address receiver
            ) = abi.decode(morphoCalldata[4:], (LoopV1Types.MorphoMarketParams, uint256, uint256, address, address));
            _requireParams(registry, params, onBehalf, ctx);
            if (shares != 0) revert LoopV1Errors.MorphoSharesModeForbidden();
            if (receiver != ctx.executor) revert LoopV1Errors.ReceiverNotAllowed();
            if (ctx.minBorrow != 0 || ctx.maxBorrow != 0) {
                if (assets < ctx.minBorrow || assets > ctx.maxBorrow) revert LoopV1Errors.BorrowedDiemOutOfBand();
            } else if (ctx.maxDebtIncrease != 0 && assets > ctx.maxDebtIncrease) {
                revert LoopV1Errors.BorrowedDiemOutOfBand();
            }
            return (address(0), 0);
        }
        if (selector == MorphoSelectors.REPAY) {
            (
                LoopV1Types.MorphoMarketParams memory params,
                uint256 assets,
                uint256 shares,
                address onBehalf,
                bytes memory data
            ) = abi.decode(morphoCalldata[4:], (LoopV1Types.MorphoMarketParams, uint256, uint256, address, bytes));
            _requireParams(registry, params, onBehalf, ctx);
            if (shares != 0) revert LoopV1Errors.MorphoSharesModeForbidden();
            if (data.length != 0) revert LoopV1Errors.CallbackDataForbidden();
            if (assets < ctx.minRepay) revert LoopV1Errors.MinimumRepayShort();
            return (params.loanToken, assets);
        }
        if (selector == MorphoSelectors.WITHDRAW_COLLATERAL) {
            (LoopV1Types.MorphoMarketParams memory params, uint256 assets, address onBehalf, address receiver) =
                abi.decode(morphoCalldata[4:], (LoopV1Types.MorphoMarketParams, uint256, address, address));
            _requireParams(registry, params, onBehalf, ctx);
            if (receiver != ctx.executor) revert LoopV1Errors.ReceiverNotAllowed();
            if (assets > ctx.maxCollateral) revert LoopV1Errors.CollateralSoldExceeded();
            return (address(0), 0);
        }
        revert LoopV1Errors.MorphoSelectorForbidden();
    }

    function _requireParams(
        ILoopRegistry registry,
        LoopV1Types.MorphoMarketParams memory params,
        address onBehalf,
        Context memory ctx
    ) private view {
        LoopV1Types.MorphoMarketParams memory canonical = registry.marketParams(ctx.market);
        if (!_paramsEqual(params, canonical)) revert LoopV1Errors.MorphoParamsMismatch(3);
        if (keccak256(abi.encode(params)) != ctx.market) revert LoopV1Errors.MorphoParamsMismatch(4);
        if (onBehalf != ctx.owner) revert LoopV1Errors.MorphoParamsMismatch(5);
    }

    function _enforceSequence(bytes4 selector, Context memory ctx) private pure {
        if (ctx.step > 1) revert LoopV1Errors.MorphoSelectorAfterTerminal();
        if (ctx.primaryType == uint8(LoopV1Types.PrimaryType.OPEN)) {
            if (
                (ctx.step == 0 && selector != MorphoSelectors.SUPPLY_COLLATERAL)
                    || (ctx.step == 1 && selector != MorphoSelectors.BORROW)
            ) {
                revert LoopV1Errors.MorphoSelectorOutOfOrder();
            }
            return;
        }
        if (ctx.terminalSelector == MorphoSelectors.BORROW) {
            if (
                (ctx.step == 0 && selector != MorphoSelectors.SUPPLY_COLLATERAL)
                    || (ctx.step == 1 && selector != MorphoSelectors.BORROW)
            ) {
                revert LoopV1Errors.MorphoSelectorOutOfOrder();
            }
            return;
        }
        if (ctx.terminalSelector == MorphoSelectors.REPAY) {
            if (ctx.step != 0 || selector != MorphoSelectors.REPAY) revert LoopV1Errors.MorphoSelectorOutOfOrder();
            return;
        }
        if (ctx.terminalSelector == MorphoSelectors.WITHDRAW_COLLATERAL) {
            if (
                (ctx.step == 0 && selector != MorphoSelectors.REPAY)
                    || (ctx.step == 1 && selector != MorphoSelectors.WITHDRAW_COLLATERAL)
            ) {
                revert LoopV1Errors.MorphoSelectorOutOfOrder();
            }
            return;
        }
        revert LoopV1Errors.MorphoSelectorForbidden();
    }

    function _paramsEqual(LoopV1Types.MorphoMarketParams memory a, LoopV1Types.MorphoMarketParams memory b)
        private
        pure
        returns (bool)
    {
        return a.loanToken == b.loanToken && a.collateralToken == b.collateralToken && a.oracle == b.oracle
            && a.irm == b.irm && a.lltv == b.lltv;
    }

    function _selectorOf(bytes calldata data) private pure returns (bytes4 selector) {
        if (data.length < 4) revert LoopV1Errors.MorphoSelectorForbidden();
        assembly {
            selector := calldataload(data.offset)
        }
    }
}
