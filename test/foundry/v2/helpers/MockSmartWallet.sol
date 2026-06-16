// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockSmartWallet {
    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;
    mapping(bytes32 digest => bool valid) public validDigest;

    function setValidDigest(bytes32 digest, bool valid) external {
        validDigest[digest] = valid;
    }

    function isValidSignature(bytes32 digest, bytes calldata) external view returns (bytes4) {
        return validDigest[digest] ? MAGIC_VALUE : bytes4(0xffffffff);
    }
}
