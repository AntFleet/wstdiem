// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopAuthorization} from "../../../../../contracts/v2/LoopAuthorization.sol";
import {LoopV1EIP712} from "../../../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Types} from "../../../../../contracts/v2/libraries/LoopV1Types.sol";

contract NestedFrameProbe {
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

    function probeRevert(bytes32 digest, bytes calldata sig, bytes calldata morphoCalldata, address owner)
        external
        returns (bool reverted, bool nonceConsumedAfter)
    {
        try auth.executeMorpho(digest, sig, morphoCalldata) {
            reverted = false;
        } catch {
            reverted = true;
        }
        nonceConsumedAfter = auth.nonceBitmap(owner, 0, uint8(LoopV1Types.PrimaryType.OPEN), 500) != 0;
    }

    function executeMorpho(bytes32 digest, bytes calldata sig, bytes calldata morphoCalldata)
        external
        returns (bytes memory)
    {
        return auth.executeMorpho(digest, sig, morphoCalldata);
    }
}
