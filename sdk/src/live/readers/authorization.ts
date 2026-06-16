// LoopAuthorization reader — domain separator, policy/nonce state.

import type { PublicClient } from "viem";
import type { Address, Bytes32, Hex } from "../../types/branded.js";
import {
  LOOP_AUTHORIZATION_READ_ABI,
  LOOP_FORCE_EXIT_AUTHORIZER_READ_ABI,
} from "../abis.js";
import { PRIMARY_TYPE_U8, type PrimaryType } from "../../types/enums.js";

export class AuthorizationReader {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
  ) {}

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return this.client.readContract({
      address: this.address,
      abi: LOOP_AUTHORIZATION_READ_ABI,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>;
  }

  domainSeparator(): Promise<Bytes32> {
    return this.read<Bytes32>("domainSeparator");
  }

  /** Read the nonce-bitmap slot for (owner, policyId, primaryType, nonceSlot).
   * Returns the full uint256; callers AND/OR with (1 << nonceBit) to check. */
  nonceBitmap(
    owner: Address,
    policyId: bigint,
    primaryType: PrimaryType,
    nonceSlot: bigint,
  ): Promise<bigint> {
    return this.read<bigint>("nonceBitmap", [
      owner,
      policyId,
      PRIMARY_TYPE_U8[primaryType],
      nonceSlot,
    ]);
  }

  async isNonceUsed(
    owner: Address,
    policyId: bigint,
    primaryType: PrimaryType,
    nonceSlot: bigint,
    nonceBit: number,
  ): Promise<boolean> {
    const bitmap = await this.nonceBitmap(owner, policyId, primaryType, nonceSlot);
    return (bitmap & (1n << BigInt(nonceBit))) !== 0n;
  }

  policyHash(owner: Address, policyId: bigint): Promise<Bytes32> {
    return this.read<Bytes32>("policyHash", [owner, policyId]);
  }

  policyRevocationBlock(owner: Address, policyId: bigint): Promise<bigint> {
    return this.read<bigint>("policyRevocationBlock", [owner, policyId]);
  }

  acceptsThirdPartyRepay(owner: Address, policyId: bigint): Promise<boolean> {
    return this.read<boolean>("acceptsThirdPartyRepay", [owner, policyId]);
  }
}

export class ForceExitAuthorizerReader {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
  ) {}

  domainSeparator(): Promise<Bytes32> {
    return this.client.readContract({
      address: this.address,
      abi: LOOP_FORCE_EXIT_AUTHORIZER_READ_ABI,
      functionName: "domainSeparator",
    }) as Promise<Bytes32>;
  }
}
