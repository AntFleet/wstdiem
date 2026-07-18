// wstDIEM ERC-4626 vault reader.

import { ContractFunctionExecutionError, type PublicClient } from "viem";
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
    } catch (error) {
      // Fail closed on transport/timeout/decode/wrong-chain failures: only fall
      // back when the call actually reverted / the function is absent on-chain
      // (viem raises ContractFunctionExecutionError for both). Any other error
      // (network, timeout, decode, unexpected) is rethrown so a degraded RPC
      // never silently produces a share floor from a bad read.
      if (!(error instanceof ContractFunctionExecutionError)) throw error;
      // Fallback: some deployed vaults (e.g. the Sepolia mock) implement only
      // convertToAssets and revert on convertToShares. Compute the canonical
      // ERC-4626 floor from raw reads instead of inverting convertToAssets(WAD)
      // (which double-rounds — convertToAssets is itself floored — and can
      // OVERESTIMATE shares, pushing the signed minWstDiemReceived floor too
      // high and spuriously reverting valid opens):
      //   shares = assets * totalSupply / totalAssets   (integer floor)
      // This exactly matches a standard ERC-4626 convertToShares.
      const [totalSupply, totalAssets] = await Promise.all([
        this.totalSupply(),
        this.totalAssets(),
      ]);
      // ERC-4626 edge cases: an empty vault mints shares 1:1 with assets
      // (initial deposit convention); a non-empty vault with zero assets has no
      // defined price-per-share, so pricing is impossible.
      if (totalSupply === 0n) return assets;
      if (totalAssets === 0n) {
        throw new Error(
          "VaultReader.convertToShares: convertToShares reverted and the vault " +
            "has totalSupply != 0 with totalAssets == 0 — cannot price shares.",
        );
      }
      return (assets * totalSupply) / totalAssets;
    }
  }
}
