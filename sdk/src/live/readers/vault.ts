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

  async convertToShares(assets: bigint): Promise<bigint> {
    // Primary path: compliant ERC-4626 vaults expose convertToShares directly.
    try {
      return (await this.client.readContract({
        address: this.address,
        abi: ERC4626_ABI,
        functionName: "convertToShares",
        args: [assets],
      })) as bigint;
    } catch {
      // Fallback: some deployed vaults (e.g. the Sepolia mock) implement only
      // convertToAssets. Invert the price-per-share from convertToAssets(WAD):
      //   shares = assets * WAD / convertToAssets(WAD)
      // This equals the standard ERC-4626 convertToShares for a linear vault
      // (constant exchange rate), so the derived floor stays correct.
      const WAD = 10n ** 18n;
      const assetsPerWadShares = await this.convertToAssets(WAD);
      if (assetsPerWadShares === 0n) {
        throw new Error(
          "VaultReader.convertToShares: convertToShares reverted and " +
            "convertToAssets(1e18) returned 0 — cannot derive shares (div-by-zero).",
        );
      }
      return (assets * WAD) / assetsPerWadShares;
    }
  }
}
