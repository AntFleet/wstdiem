// EIP-712 domain separator construction. WSTDIEM uses the 5-field domain with
// `salt`: keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, keccak256(name),
// keccak256(version), chainId, verifyingContract, salt)).

import { encodeAbiParameters, keccak256, toBytes, parseAbiParameters } from "viem";
import type { Address, Bytes32, ChainId, Hex } from "../types/branded.js";
import { DOMAIN_SEPARATOR_TYPEHASH } from "./typehashes.js";

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: ChainId;
  verifyingContract: Address;
  salt: Bytes32;
}

export const ZERO_SALT: Bytes32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const DOMAIN_PARAMS = parseAbiParameters(
  "bytes32, bytes32, bytes32, uint256, address, bytes32",
);

export function computeDomainSeparator(domain: Eip712Domain): Hex {
  const encoded = encodeAbiParameters(DOMAIN_PARAMS, [
    DOMAIN_SEPARATOR_TYPEHASH,
    keccak256(toBytes(domain.name)),
    keccak256(toBytes(domain.version)),
    BigInt(domain.chainId),
    domain.verifyingContract,
    domain.salt,
  ]);
  return keccak256(encoded);
}
