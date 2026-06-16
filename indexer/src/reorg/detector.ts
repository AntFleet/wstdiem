import type { PublicClient, Hex } from "viem";
import type { BlockHead } from "../rpc/client.js";
import type {
  ActionStepRepository,
  AnchorSnapshotRepository,
  BlockRepository,
  HeadRepository,
  PolicyRepository,
  RegistryCommitRepository,
  RoleRotationRepository,
} from "../state/repositories.js";

export interface ReorgRollback {
  detectedAt: bigint;
  commonAncestor: bigint;
}

/**
 * Detect a chain reorg by comparing the indexer's stored block hash for a given
 * block against the on-chain hash. If they differ, walk backwards until we find
 * the most recent block where stored == on-chain. That block is the common
 * ancestor; all indexed state at or above (ancestor + 1) is rolled back.
 */
export async function detectReorg(args: {
  client: PublicClient;
  blocks: BlockRepository;
  head: HeadRepository;
  reorgDepth: number;
}): Promise<ReorgRollback | null> {
  const headState = args.head.get();
  if (!headState) return null;
  const headBlock = await args.client.getBlock({ blockNumber: headState.lastIndexedBlock });
  if (headBlock.hash === headState.lastIndexedBlockHash) return null;

  // Walk backwards by `reorgDepth` blocks (or to genesis) finding the common ancestor.
  const floor =
    headState.lastIndexedBlock > BigInt(args.reorgDepth)
      ? headState.lastIndexedBlock - BigInt(args.reorgDepth)
      : 0n;
  for (let probe = headState.lastIndexedBlock; probe >= floor; probe -= 1n) {
    const stored = args.blocks.get(probe);
    if (!stored) continue;
    const onChain = await args.client.getBlock({ blockNumber: probe });
    if (onChain.hash === stored.hash) {
      return {
        detectedAt: headState.lastIndexedBlock,
        commonAncestor: probe,
      };
    }
    if (probe === 0n) break;
  }
  throw new ReorgDepthExceededError(headState.lastIndexedBlock, args.reorgDepth);
}

export class ReorgDepthExceededError extends Error {
  constructor(detectedAt: bigint, depth: number) {
    super(
      `Chain reorg deeper than configured reorgDepth=${depth} blocks detected at indexed head ${detectedAt}. ` +
        `Indexer cannot safely recover; consider re-seeding from a known-good snapshot.`,
    );
    this.name = "ReorgDepthExceededError";
  }
}

/**
 * Roll back all indexed state at or above (commonAncestor + 1).
 */
export function rollback(args: {
  rollback: ReorgRollback;
  blocks: BlockRepository;
  actionSteps: ActionStepRepository;
  policies: PolicyRepository;
  registryCommits: RegistryCommitRepository;
  anchorSnapshots: AnchorSnapshotRepository;
  roleRotations: RoleRotationRepository;
  head: HeadRepository;
}): void {
  const cutoff = args.rollback.commonAncestor + 1n;
  args.actionSteps.deleteAtOrAbove(cutoff);
  args.registryCommits.deleteAtOrAbove(cutoff);
  args.anchorSnapshots.deleteAtOrAbove(cutoff);
  args.roleRotations.deleteAtOrAbove(cutoff);
  // Policies are not deleted on reorg because PolicyCreated may have happened pre-ancestor;
  // we accept that revoke state may be momentarily inconsistent and reapply on re-index.
  args.blocks.deleteAtOrAbove(cutoff);

  const ancestorBlock = args.blocks.get(args.rollback.commonAncestor);
  if (!ancestorBlock) {
    throw new Error(
      `Common ancestor block ${args.rollback.commonAncestor} disappeared during rollback`,
    );
  }
  args.head.set({
    lastIndexedBlock: ancestorBlock.number,
    lastIndexedBlockHash: ancestorBlock.hash as Hex,
  });
}
