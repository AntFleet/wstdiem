// Registry reader — typed wrappers around LoopRegistry read methods.

import type { PublicClient } from "viem";
import type { Address, Bytes32, Hex, MarketId } from "../../types/branded.js";
import { LOOP_REGISTRY_READ_ABI } from "../abis.js";
import type { EvidenceSourceId } from "../../types/evidence.js";
import { SOURCE_ID_HASHES } from "../../types/evidence.js";
import { PRIMARY_TYPE_U8, type PrimaryType } from "../../types/enums.js";

export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

export interface ExternalFingerprintRaw {
  integrationId: Bytes32;
  integration: Address;
  fingerprintHash: Bytes32;
  hardEqualityHash: Bytes32;
  toleranceBandHash: Bytes32;
  liveBaselineHash: Bytes32;
  registryVersion: bigint;
}

export class RegistryReader {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
    /**
     * EIP-170 Phase 3: fingerprint reads (`externalFingerprint`) target the
     * split-out LoopFingerprintRegistry. Defaults to the core registry address
     * for pre-split deployments and single-address test harnesses.
     */
    private readonly fingerprintAddress: Address = address,
  ) {}

  private read<T>(
    functionName: string,
    args: readonly unknown[] = [],
    blockNumber?: bigint,
  ): Promise<T> {
    return this.client.readContract({
      address: this.address,
      abi: LOOP_REGISTRY_READ_ABI,
      functionName: functionName as never,
      args: args as never,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    }) as Promise<T>;
  }

  /**
   * Block-pinned variants are exposed where the live SDK calls multiple
   * registry reads at the same chain head and needs a tight TOCTOU window
   * (PR-13 audit closure: getReadiness pins all sub-reads to one block).
   */

  registryVersion(blockNumber?: bigint): Promise<bigint> {
    return this.read<bigint>("registryVersion", [], blockNumber);
  }

  registryMerkleRoot(blockNumber?: bigint): Promise<Bytes32> {
    return this.read<Bytes32>("registryMerkleRoot", [], blockNumber);
  }

  supportedMarket(market: MarketId, blockNumber?: bigint): Promise<boolean> {
    return this.read<boolean>("supportedMarket", [market], blockNumber);
  }

  marketParams(market: MarketId, blockNumber?: bigint): Promise<MarketParams> {
    return this.read<MarketParams>("marketParams", [market], blockNumber);
  }

  executorFor(primaryType: PrimaryType, blockNumber?: bigint): Promise<Address> {
    return this.read<Address>(
      "executorFor",
      [PRIMARY_TYPE_U8[primaryType]],
      blockNumber,
    );
  }

  validateExternalConfig(
    market: MarketId,
    primaryType: PrimaryType,
    blockNumber?: bigint,
  ): Promise<boolean> {
    return this.read<boolean>(
      "validateExternalConfig",
      [market, PRIMARY_TYPE_U8[primaryType]],
      blockNumber,
    );
  }

  loopAuthorization(): Promise<Address> {
    return this.read<Address>("loopAuthorization");
  }

  loopForceExitAuthorizer(): Promise<Address> {
    return this.read<Address>("loopForceExitAuthorizer");
  }

  emergencyGuardian(): Promise<Address> {
    return this.read<Address>("emergencyGuardian");
  }

  anchorCadenceBlocks(): Promise<bigint> {
    return this.read<bigint>("anchorCadenceBlocks");
  }

  anchorSubmitter(blockNumber?: bigint): Promise<Address> {
    return this.read<Address>("anchorSubmitter", [], blockNumber);
  }

  indexerSigningKey(): Promise<Address> {
    return this.read<Address>("indexerSigningKey");
  }

  canonicalSource(market: MarketId, sourceId: EvidenceSourceId): Promise<Address> {
    return this.read<Address>("canonicalSource", [market, SOURCE_ID_HASHES[sourceId]]);
  }

  /**
   * PR-15 audit H-2 closure: accept the raw `bytes32 sourceIdHash` directly
   * so the SDK can cross-check resolver-supplied evidence sources whose
   * `sourceIdHash` field is already in hash form (not a typed enum name).
   * Optional `blockNumber` for block-pinned reads.
   */
  canonicalSourceByHash(
    market: MarketId,
    sourceIdHash: Bytes32,
    blockNumber?: bigint,
  ): Promise<Address> {
    return this.read<Address>(
      "canonicalSource",
      [market, sourceIdHash],
      blockNumber,
    );
  }

  requiredEvidenceSourceSet(primaryType: PrimaryType): Promise<readonly Bytes32[]> {
    return this.read<readonly Bytes32[]>("requiredEvidenceSourceSet", [PRIMARY_TYPE_U8[primaryType]]);
  }

  preimageDisplayGuaranteedWallet(
    wallet: Address,
    blockNumber?: bigint,
  ): Promise<boolean> {
    return this.read<boolean>(
      "preimageDisplayGuaranteedWallet",
      [wallet],
      blockNumber,
    );
  }

  permissionlessCallerAllowed(caller: Address): Promise<boolean> {
    return this.read<boolean>("permissionlessCallerAllowed", [caller]);
  }

  lastHarvestBlock(market: MarketId): Promise<bigint> {
    return this.read<bigint>("lastHarvestBlock", [market]);
  }

  harvestCoolingBlocks(): Promise<bigint> {
    return this.read<bigint>("harvestCoolingBlocks");
  }

  forceExitBufferBps(): Promise<number> {
    return this.read<number>("forceExitBufferBps");
  }

  ownerLastSignedActionBlock(owner: Address): Promise<bigint> {
    return this.read<bigint>("ownerLastSignedActionBlock", [owner]);
  }

  morpho(): Promise<Address> {
    return this.read<Address>("morpho");
  }

  curvePool(market: MarketId): Promise<Address> {
    return this.read<Address>("curvePool", [market]);
  }

  uniswapV3FlashPool(market: MarketId): Promise<Address> {
    return this.read<Address>("uniswapV3FlashPool", [market]);
  }

  wstDiemVault(market: MarketId): Promise<Address> {
    return this.read<Address>("wstDiemVault", [market]);
  }

  navBaseline(market: MarketId): Promise<bigint> {
    return this.read<bigint>("navBaseline", [market]);
  }

  externalFingerprint(integrationId: Bytes32): Promise<ExternalFingerprintRaw> {
    // EIP-170 Phase 3: read from the split-out LoopFingerprintRegistry address.
    return this.client.readContract({
      address: this.fingerprintAddress,
      abi: LOOP_REGISTRY_READ_ABI,
      functionName: "externalFingerprint" as never,
      args: [integrationId] as never,
    }) as Promise<ExternalFingerprintRaw>;
  }

  dustBoundFor(market: MarketId, inputAmount: bigint): Promise<bigint> {
    return this.read<bigint>("dustBoundFor", [market, inputAmount]);
  }
}
