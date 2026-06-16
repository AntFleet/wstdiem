// wstDIEM ERC-4626 vault reader.

import type { PublicClient } from "viem";
import type { Address } from "../../types/branded.js";
import { ERC4626_ABI } from "../abis.js";

export class VaultReader {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
  ) {}

  asset(): Promise<Address> {
    return this.client.readContract({
      address: this.address,
      abi: ERC4626_ABI,
      functionName: "asset",
    }) as Promise<Address>;
  }

  totalAssets(): Promise<bigint> {
    return this.client.readContract({
      address: this.address,
      abi: ERC4626_ABI,
      functionName: "totalAssets",
    }) as Promise<bigint>;
  }

  totalSupply(): Promise<bigint> {
    return this.client.readContract({
      address: this.address,
      abi: ERC4626_ABI,
      functionName: "totalSupply",
    }) as Promise<bigint>;
  }

  convertToAssets(shares: bigint): Promise<bigint> {
    return this.client.readContract({
      address: this.address,
      abi: ERC4626_ABI,
      functionName: "convertToAssets",
      args: [shares],
    }) as Promise<bigint>;
  }

  convertToShares(assets: bigint): Promise<bigint> {
    return this.client.readContract({
      address: this.address,
      abi: ERC4626_ABI,
      functionName: "convertToShares",
      args: [assets],
    }) as Promise<bigint>;
  }
}
