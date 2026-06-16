import type { Hex, PublicClient } from "viem";

export interface CadenceState {
  currentBlock: bigint;
  lastSubmittedAnchorBlock: bigint | null;
  cadenceBlocks: bigint;
  minIndexerLagBlocks: bigint;
  indexedBlock: bigint;
}

export interface CadenceDecision {
  shouldSubmit: boolean;
  reason: string;
  candidateAnchorBlock: bigint;
}

/**
 * Decide whether to submit a new anchor snapshot.
 *
 * Submit when:
 *   (a) indexed block is at least minIndexerLagBlocks behind current head, AND
 *   (b) at least cadenceBlocks have elapsed since the last submission (or no prior submission).
 *
 * The candidate anchor block is the indexer's last indexed block (we anchor what
 * we have indexed, not a future block).
 */
export function decideSubmit(state: CadenceState): CadenceDecision {
  const candidateAnchorBlock = state.indexedBlock;
  const lag = state.currentBlock - state.indexedBlock;
  if (lag < state.minIndexerLagBlocks) {
    return {
      shouldSubmit: false,
      reason: `indexer lag ${lag.toString()} < minIndexerLagBlocks ${state.minIndexerLagBlocks.toString()}`,
      candidateAnchorBlock,
    };
  }
  if (state.lastSubmittedAnchorBlock === null) {
    return {
      shouldSubmit: true,
      reason: "no prior anchor submission; submitting initial snapshot",
      candidateAnchorBlock,
    };
  }
  const gap = candidateAnchorBlock - state.lastSubmittedAnchorBlock;
  if (gap < state.cadenceBlocks) {
    return {
      shouldSubmit: false,
      reason: `cadence gap ${gap.toString()} < cadenceBlocks ${state.cadenceBlocks.toString()}`,
      candidateAnchorBlock,
    };
  }
  return {
    shouldSubmit: true,
    reason: `cadence gap ${gap.toString()} >= cadenceBlocks ${state.cadenceBlocks.toString()}`,
    candidateAnchorBlock,
  };
}

const ANCHOR_CADENCE_BLOCKS_ABI = [
  {
    type: "function",
    stateMutability: "view",
    name: "anchorCadenceBlocks",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
] as const;

export async function readAnchorCadenceFromRegistry(
  client: PublicClient,
  registry: Hex,
): Promise<bigint> {
  const result = (await client.readContract({
    address: registry,
    abi: ANCHOR_CADENCE_BLOCKS_ABI,
    functionName: "anchorCadenceBlocks",
  })) as bigint;
  return result;
}
