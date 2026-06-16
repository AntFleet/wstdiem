// LoopAnchorRegistry reader + indexer/on-chain cross-check (A5-3 closure).
//
// PR-12 trusted the indexer's claimed anchor metadata blindly. PR-13 closes
// audit A5-3 by:
//   1. Reading `lastAnchorBlock` from the on-chain LoopAnchorRegistry.
//   2. Optionally fetching the StateSnapshotAccepted log at that block and
//      comparing `manifestHash` to the indexer's claim.
// On mismatch the SDK throws (default) or surfaces a degraded readiness
// status (when strictAnchorCrossCheck is disabled — staging only).

import type { PublicClient } from "viem";
import type { Address, BlockNumber, Bytes32 } from "../../types/branded.js";
import { asBlockNumber } from "../../types/branded.js";
import {
  LOOP_ANCHOR_REGISTRY_READ_ABI,
  LOOP_EVENTS_FULL_ABI,
} from "../abis.js";

export interface OnChainAnchor {
  lastAnchorBlock: BlockNumber;
}

/**
 * Indexer's anchor claim has TWO distinct block fields the SDK must keep
 * straight (PR-13 audit H2 closure):
 *   - `anchorBlock`: the LOGICAL snapshot block (the historic chain head whose
 *     state the indexer attests). This is the `uint256 indexed blockNumber`
 *     parameter of the on-chain `StateSnapshotAccepted` event.
 *   - `blockNumber`: the EMISSION block where the `submitStateSnapshot` tx
 *     was mined. This is `LoopAnchorRegistry.lastAnchorBlock` (a uint64 set
 *     to `block.number` at submission time per LoopAnchorRegistry.sol:30).
 *
 * The cross-check compares emission-block to emission-block:
 *   `indexerClaim.blockNumber > onChainLastAnchorBlock`  → indexer is lying.
 *
 * The matching log search ranges around the EMISSION block, not the logical
 * snapshot block, since that's where the log was emitted.
 */
export interface IndexerAnchorClaim {
  anchorBlock: BlockNumber;
  manifestHash: Bytes32;
  blockNumber: BlockNumber;
  blockHash: Bytes32;
}

export class AnchorRegistryReader {
  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
  ) {}

  async lastAnchorBlock(blockNumber?: bigint): Promise<BlockNumber> {
    const raw = (await this.client.readContract({
      address: this.address,
      abi: LOOP_ANCHOR_REGISTRY_READ_ABI,
      functionName: "lastAnchorBlock" as never,
      args: [] as never,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    })) as bigint;
    return asBlockNumber(raw);
  }

  /**
   * Fetch the StateSnapshotAccepted log emitted at a given EMISSION block
   * (`emissionBlock`) and whose `blockNumber` indexed-arg matches the
   * indexer-claimed logical snapshot block (`logicalAnchorBlock`).
   *
   * Returns null when no matching log is found in the recent window. PR-13
   * audit C-2 closure: callers MUST pass a `toBlock` (planning-block-pinned)
   * to prevent a head-race that would let an attacker forge a log after the
   * pinned read.
   */
  async fetchManifestForBlock(opts: {
    emissionBlock: BlockNumber;
    logicalAnchorBlock: BlockNumber;
    toBlock: BlockNumber;
  }): Promise<{ manifestHash: Bytes32; submitter: Address } | null> {
    const emissionBn = BigInt(opts.emissionBlock);
    const fromBlock = emissionBn > 1n ? emissionBn - 1n : 0n;
    const toBlock = BigInt(opts.toBlock);
    const logs = await this.client.getLogs({
      address: this.address,
      event: LOOP_EVENTS_FULL_ABI.find(
        (e) => e.name === "StateSnapshotAccepted",
      ) as never,
      fromBlock,
      toBlock,
      args: { blockNumber: BigInt(opts.logicalAnchorBlock) } as never,
    });
    if (logs.length === 0) return null;
    const first = logs[0];
    if (!first) return null;
    const log = first as unknown as {
      args?: { manifestHash?: Bytes32; submitter?: Address };
      blockNumber?: bigint;
    };
    // C-2 defense: reject logs from above the planning block — they could not
    // have been observed at planning time. A reorg-malleable attacker that
    // races between our reads and the cross-check would otherwise sneak a
    // fresh-but-future log past us.
    if (log.blockNumber !== undefined && log.blockNumber > toBlock) {
      return null;
    }
    if (!log.args?.manifestHash || !log.args.submitter) return null;
    return { manifestHash: log.args.manifestHash, submitter: log.args.submitter };
  }
}

export type AnchorCrossCheckResult =
  | { ok: true; anchorBlock: BlockNumber; manifestHash: Bytes32 }
  | {
      ok: false;
      reason:
        | "indexer-anchor-ahead-of-registry"
        | "manifest-hash-mismatch"
        | "no-matching-log"
        | "submitter-untrusted";
      details: string;
    };

/**
 * Cross-check the indexer's anchor claim against the on-chain LoopAnchorRegistry.
 *
 * Reads are block-pinned to `planningBlock` (PR-13 audit C-2 closure) so the
 * cross-check operates on a consistent snapshot — not racing the head.
 *
 * Verifies the submitter on the matched log equals the registry's currently-
 * registered `anchorSubmitter` (PR-13 audit H-3 closure) so a past compromise
 * of a since-rotated submitter key cannot republish a stale manifest.
 */
export async function crossCheckAnchor(
  reader: AnchorRegistryReader,
  indexerClaim: IndexerAnchorClaim,
  opts: { planningBlock: BlockNumber; expectedSubmitter: Address },
): Promise<AnchorCrossCheckResult> {
  const onChainAnchorBlock = await reader.lastAnchorBlock(BigInt(opts.planningBlock));
  // H2 fix: compare emission-block to emission-block. The indexer's claimed
  // emission block cannot exceed the registry's recorded lastAnchorBlock.
  if (BigInt(indexerClaim.blockNumber) > BigInt(onChainAnchorBlock)) {
    return {
      ok: false,
      reason: "indexer-anchor-ahead-of-registry",
      details: `indexer emission blockNumber=${indexerClaim.blockNumber} but LoopAnchorRegistry.lastAnchorBlock=${onChainAnchorBlock}`,
    };
  }
  // H2 fix: search around the emission block, filter by the logical anchor
  // block (the event's indexed blockNumber arg).
  const log = await reader.fetchManifestForBlock({
    emissionBlock: indexerClaim.blockNumber,
    logicalAnchorBlock: indexerClaim.anchorBlock,
    toBlock: opts.planningBlock,
  });
  if (!log) {
    return {
      ok: false,
      reason: "no-matching-log",
      details: `no StateSnapshotAccepted log found for logical anchorBlock=${indexerClaim.anchorBlock} at emission window ending at planningBlock=${opts.planningBlock}`,
    };
  }
  if (log.manifestHash.toLowerCase() !== indexerClaim.manifestHash.toLowerCase()) {
    return {
      ok: false,
      reason: "manifest-hash-mismatch",
      details: `indexer manifestHash=${indexerClaim.manifestHash} != on-chain manifestHash=${log.manifestHash} at logical anchorBlock=${indexerClaim.anchorBlock}`,
    };
  }
  // H-3 fix: verify the log's submitter matches the currently-registered
  // anchorSubmitter so a past key compromise (since rotated) cannot
  // republish a stale manifest.
  if (log.submitter.toLowerCase() !== opts.expectedSubmitter.toLowerCase()) {
    return {
      ok: false,
      reason: "submitter-untrusted",
      details: `on-chain submitter=${log.submitter} != registry.anchorSubmitter=${opts.expectedSubmitter} at logical anchorBlock=${indexerClaim.anchorBlock}`,
    };
  }
  return {
    ok: true,
    anchorBlock: indexerClaim.anchorBlock,
    manifestHash: log.manifestHash,
  };
}
