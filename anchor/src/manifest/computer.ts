import { encodeAbiParameters, keccak256, type Hex } from "viem";
import type { IndexerSnapshot } from "../indexer-client.js";

export interface ManifestInput {
  chainId: number;
  indexedBlockNumber: bigint;
  indexedBlockHash: Hex;
  registryVersion: bigint;
  registryMerkleRoot: Hex;
}

/**
 * Compute the canonical manifest hash for an anchor submission.
 *
 * MVP schema: keccak256(abi.encode(uint256 chainId, uint256 indexedBlock,
 *   bytes32 indexedBlockHash, uint256 registryVersion, bytes32 registryMerkleRoot)).
 *
 * This binds the indexer's view of (a) which block it last saw, (b) that block's
 * canonical hash, and (c) the latest LoopRegistry config commit. Off-chain clients
 * (SDKs, app) can reproduce this hash from the indexer's HTTP API and reject any
 * indexer that disagrees with the on-chain submission.
 *
 * The spec's full ActionEvidence canonical-set hash (PROTOCOL.md §A2) will land in
 * in a subsequent release; in the MVP we anchor the smaller registry + block
 * commitment as a starting point for the indexer integrity model.
 */
export function computeManifestHash(input: ManifestInput): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [
      BigInt(input.chainId),
      input.indexedBlockNumber,
      input.indexedBlockHash,
      input.registryVersion,
      input.registryMerkleRoot,
    ],
  );
  return keccak256(encoded);
}

const ZERO_BYTES32: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function manifestInputFrom(snapshot: IndexerSnapshot, chainId: number): ManifestInput {
  return {
    chainId,
    indexedBlockNumber: snapshot.head.lastIndexedBlock,
    indexedBlockHash: snapshot.head.lastIndexedBlockHash,
    registryVersion: snapshot.registry?.registryVersion ?? 0n,
    registryMerkleRoot: snapshot.registry?.merkleRoot ?? ZERO_BYTES32,
  };
}
