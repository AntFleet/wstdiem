// wstDIEM ERC-4626 vault reader.

import type { PublicClient } from "viem";
import type { Address } from "../../types/branded.js";
import { ERC4626_ABI } from "../abis.js";

export class VaultReader {
  /**
   * @param convertToSharesUnsupported when true, the vault is KNOWN (by deploy
   *   config) to not implement `convertToShares` — e.g. the Base Sepolia mock.
   *   `convertToShares` then computes the canonical ERC-4626 floor from
   *   `totalSupply`/`totalAssets` directly and never calls the on-chain method.
   *   When false (default), `convertToShares` calls the on-chain method and
   *   RETHROWS on any error. We deliberately do NOT infer vault capability from
   *   viem error classes: viem wraps reverts, missing-function zero-data, AND
   *   transport/timeout/`-32603` internal-RPC failures all in
   *   `ContractFunctionExecutionError`, so a degraded/malicious RPC could
   *   otherwise be misread as "vault lacks convertToShares" and fail OPEN into a
   *   floor derived from a bad read. An explicit flag keeps it fail-closed.
   */
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
    private readonly convertToSharesUnsupported = false,
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
    if (!this.convertToSharesUnsupported) {
      // Compliant ERC-4626 vaults expose convertToShares directly. Any error
      // (revert, transport, timeout, decode, degraded RPC) PROPAGATES — we never
      // silently approximate a bound the user signs from a possibly-bad read.
      return (await this.client.readContract({
        address: this.address,
        abi: ERC4626_ABI,
        functionName: "convertToShares",
        args: [assets],
      })) as bigint;
    }
    // Deploy config declares this vault does not implement convertToShares
    // (e.g. the Base Sepolia mock, which exposes only convertToAssets). Compute
    // the canonical ERC-4626 floor from raw reads — this exactly matches a
    // standard convertToShares for a linear vault, and (unlike inverting
    // convertToAssets(WAD)) does not double-round and overestimate the signed
    // minWstDiemReceived:
    //   shares = assets * totalSupply / totalAssets   (integer floor)
    return this.navFloorShares(assets);
  }

  /** Canonical ERC-4626 floor `assets * totalSupply / totalAssets` from raw
   * reads. Public so callers with a config-declared non-conformant vault can
   * price shares explicitly. */
  async navFloorShares(assets: bigint): Promise<bigint> {
    const [totalSupply, totalAssets] = await Promise.all([
      this.totalSupply(),
      this.totalAssets(),
    ]);
    // ERC-4626 edge cases: an empty vault mints shares 1:1 with assets (initial
    // deposit convention); a non-empty vault with zero assets has no defined
    // price-per-share, so pricing is impossible.
    if (totalSupply === 0n) return assets;
    if (totalAssets === 0n) {
      throw new Error(
        "VaultReader.navFloorShares: vault has totalSupply != 0 with " +
          "totalAssets == 0 — cannot price shares.",
      );
    }
    return (assets * totalSupply) / totalAssets;
  }
}
