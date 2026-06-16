// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
import {LoopV1Errors} from "./LoopV1Errors.sol";
import {SignatureCheckerLib} from "./SignatureCheckerLib.sol";

library LoopV1StateSnapshot {
    using SignatureCheckerLib for address;

    function validate(
        ILoopRegistry registry,
        address verifyingContract,
        uint256 currentLastAnchoredBlock,
        uint256 blockNumber,
        bytes32 manifestHash,
        bytes calldata anchorSig
    ) public view returns (uint256) {
        if (msg.sender != registry.anchorSubmitter()) revert LoopV1Errors.CallerNotAllowed();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(verifyingContract, block.chainid, blockNumber, manifestHash))
        );
        if (!registry.indexerSigningKey().isValidSignatureNow(digest, anchorSig)) {
            revert LoopV1Errors.InvalidSignature();
        }
        if (blockNumber <= currentLastAnchoredBlock) revert LoopV1Errors.AnchorNotMonotonic();
        return blockNumber;
    }
}
