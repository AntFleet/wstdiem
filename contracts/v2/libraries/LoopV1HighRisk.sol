// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILoopRegistry} from "../interfaces/ILoopRegistry.sol";
import {SignatureCheckerLib} from "./SignatureCheckerLib.sol";

library LoopV1HighRisk {
    struct Params {
        address owner;
        uint8 primaryType;
        uint8 executionKind;
        uint8 mevProtectionMode;
        uint8 mevWaiverBits;
        uint8 acknowledgedRisks;
        uint8 policyClass;
        bytes32 market;
        uint256 registryVersion;
        uint248 nonceSlot;
        uint8 nonceBit;
        uint256 maxCollateralSold;
        uint256 maxDebtIncrease;
        uint256 deadline;
        bytes32 proof;
        address verifyingContract;
    }

    function attested(ILoopRegistry registry, Params memory p) public view returns (bool) {
        if (p.owner.code.length == 0 || registry.preimageDisplayGuaranteedWallet(p.owner)) return true;
        return p.proof
            == SignatureCheckerLib.preimageProofHash(
            p.owner,
            p.primaryType,
            p.executionKind,
            p.mevProtectionMode,
            p.mevWaiverBits,
            p.acknowledgedRisks,
            p.policyClass,
            p.market,
            p.registryVersion,
            p.nonceSlot,
            p.nonceBit,
            p.maxCollateralSold,
            p.maxDebtIncrease,
            p.deadline,
            p.verifyingContract
        );
    }
}
