import type { DB } from "../db/client.js";
import type { Hex } from "viem";

export interface BlockRecord {
  number: bigint;
  hash: Hex;
  parentHash: Hex;
  timestamp: bigint;
}

export interface HeadState {
  lastIndexedBlock: bigint;
  lastIndexedBlockHash: Hex;
}

const toNumber = (v: bigint): number => {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Block number ${v.toString()} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return Number(v);
};

export class HeadRepository {
  constructor(private readonly db: DB) {}

  get(): HeadState | null {
    const row = this.db
      .prepare<[], { last_indexed_block: number; last_indexed_block_hash: string }>(
        "SELECT last_indexed_block, last_indexed_block_hash FROM head_tracker WHERE id = 1",
      )
      .get();
    if (!row) return null;
    return {
      lastIndexedBlock: BigInt(row.last_indexed_block),
      lastIndexedBlockHash: row.last_indexed_block_hash as Hex,
    };
  }

  set(state: HeadState): void {
    this.db
      .prepare(
        `INSERT INTO head_tracker(id, last_indexed_block, last_indexed_block_hash, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           last_indexed_block = excluded.last_indexed_block,
           last_indexed_block_hash = excluded.last_indexed_block_hash,
           updated_at = excluded.updated_at`,
      )
      .run(toNumber(state.lastIndexedBlock), state.lastIndexedBlockHash, Date.now());
  }
}

export class BlockRepository {
  constructor(private readonly db: DB) {}

  upsert(block: BlockRecord): void {
    this.db
      .prepare(
        `INSERT INTO block_index(block_number, block_hash, parent_hash, timestamp)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(block_number) DO UPDATE SET
           block_hash = excluded.block_hash,
           parent_hash = excluded.parent_hash,
           timestamp = excluded.timestamp`,
      )
      .run(toNumber(block.number), block.hash, block.parentHash, toNumber(block.timestamp));
  }

  get(blockNumber: bigint): BlockRecord | null {
    const row = this.db
      .prepare<
        [number],
        { block_number: number; block_hash: string; parent_hash: string; timestamp: number }
      >(
        "SELECT block_number, block_hash, parent_hash, timestamp FROM block_index WHERE block_number = ?",
      )
      .get(toNumber(blockNumber));
    if (!row) return null;
    return {
      number: BigInt(row.block_number),
      hash: row.block_hash as Hex,
      parentHash: row.parent_hash as Hex,
      timestamp: BigInt(row.timestamp),
    };
  }

  /**
   * Remove indexed blocks at or above the given block number. Used to roll back
   * state after a chain reorg.
   */
  deleteAtOrAbove(blockNumber: bigint): void {
    this.db
      .prepare("DELETE FROM block_index WHERE block_number >= ?")
      .run(toNumber(blockNumber));
  }
}

export interface ActionStepRecord {
  blockNumber: bigint;
  blockHash: Hex;
  logIndex: number;
  transactionHash: Hex;
  owner: Hex;
  primaryType: number;
  actionId: Hex;
  digest: Hex;
  stepKind: number;
  stepIndex: number;
  payloadJson: string;
}

export class ActionStepRepository {
  constructor(private readonly db: DB) {}

  insert(step: ActionStepRecord): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO action_steps(
           block_number, block_hash, log_index, transaction_hash, owner, primary_type,
           action_id, digest, step_kind, step_index, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        toNumber(step.blockNumber),
        step.blockHash,
        step.logIndex,
        step.transactionHash,
        step.owner,
        step.primaryType,
        step.actionId,
        step.digest,
        step.stepKind,
        step.stepIndex,
        step.payloadJson,
      );
  }

  deleteAtOrAbove(blockNumber: bigint): void {
    this.db
      .prepare("DELETE FROM action_steps WHERE block_number >= ?")
      .run(toNumber(blockNumber));
  }

  byActionId(actionId: Hex): ActionStepRecord[] {
    const rows = this.db
      .prepare<
        [string],
        {
          block_number: number;
          block_hash: string;
          log_index: number;
          transaction_hash: string;
          owner: string;
          primary_type: number;
          action_id: string;
          digest: string;
          step_kind: number;
          step_index: number;
          payload_json: string;
        }
      >(
        `SELECT * FROM action_steps WHERE action_id = ?
         ORDER BY block_number ASC, log_index ASC`,
      )
      .all(actionId);
    return rows.map((row) => ({
      blockNumber: BigInt(row.block_number),
      blockHash: row.block_hash as Hex,
      logIndex: row.log_index,
      transactionHash: row.transaction_hash as Hex,
      owner: row.owner as Hex,
      primaryType: row.primary_type,
      actionId: row.action_id as Hex,
      digest: row.digest as Hex,
      stepKind: row.step_kind,
      stepIndex: row.step_index,
      payloadJson: row.payload_json,
    }));
  }
}

export interface PolicyRecord {
  owner: Hex;
  policyId: bigint;
  primaryType: number;
  policyHash: Hex;
  policyClass: number;
  createdBlock: bigint;
  expiryBlock: bigint;
  state: "active" | "revoking" | "revoked";
  revokeInitiatedBlock?: bigint;
  revokeFinalizedBlock?: bigint;
}

export class PolicyRepository {
  constructor(private readonly db: DB) {}

  upsertCreated(policy: PolicyRecord): void {
    this.db
      .prepare(
        `INSERT INTO policies(
           owner, policy_id, primary_type, policy_hash, policy_class,
           created_block, expiry_block, state
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
         ON CONFLICT(owner, policy_id) DO UPDATE SET
           primary_type = excluded.primary_type,
           policy_hash = excluded.policy_hash,
           policy_class = excluded.policy_class,
           created_block = excluded.created_block,
           expiry_block = excluded.expiry_block,
           state = 'active'`,
      )
      .run(
        policy.owner,
        Number(policy.policyId),
        policy.primaryType,
        policy.policyHash,
        policy.policyClass,
        toNumber(policy.createdBlock),
        toNumber(policy.expiryBlock),
      );
  }

  /** PolicyUpdated on-chain has no primaryType/class — only hash + expiry change. */
  upsertUpdated(args: {
    owner: Hex;
    policyId: bigint;
    policyHash: Hex;
    expiryBlock: bigint;
  }): void {
    const existing = this.db
      .prepare<
        [string, number],
        { primary_type: number; policy_class: number; created_block: number }
      >(
        "SELECT primary_type, policy_class, created_block FROM policies WHERE owner = ? AND policy_id = ?",
      )
      .get(args.owner, Number(args.policyId));

    if (!existing) {
      // Out-of-order / partial reindex: insert with unknown type/class.
      this.upsertCreated({
        owner: args.owner,
        policyId: args.policyId,
        primaryType: 0,
        policyHash: args.policyHash,
        policyClass: 0,
        createdBlock: args.expiryBlock,
        expiryBlock: args.expiryBlock,
        state: "active",
      });
      return;
    }

    this.db
      .prepare(
        `UPDATE policies SET policy_hash = ?, expiry_block = ?, state = 'active'
         WHERE owner = ? AND policy_id = ?`,
      )
      .run(args.policyHash, toNumber(args.expiryBlock), args.owner, Number(args.policyId));
  }

  markRevoking(owner: Hex, policyId: bigint, revocationBlock: bigint): void {
    this.db
      .prepare(
        `UPDATE policies SET state = 'revoking', revoke_initiated_block = ?
         WHERE owner = ? AND policy_id = ?`,
      )
      .run(toNumber(revocationBlock), owner, Number(policyId));
  }

  markRevoked(owner: Hex, policyId: bigint, finalizedBlock: bigint): void {
    this.db
      .prepare(
        `UPDATE policies SET state = 'revoked', revoke_finalized_block = ?
         WHERE owner = ? AND policy_id = ?`,
      )
      .run(toNumber(finalizedBlock), owner, Number(policyId));
  }

  list(): PolicyRecord[] {
    const rows = this.db
      .prepare<
        [],
        {
          owner: string;
          policy_id: number;
          primary_type: number;
          policy_hash: string;
          policy_class: number;
          created_block: number;
          expiry_block: number;
          state: "active" | "revoking" | "revoked";
          revoke_initiated_block: number | null;
          revoke_finalized_block: number | null;
        }
      >("SELECT * FROM policies ORDER BY created_block ASC")
      .all();
    return rows.map((row) => ({
      owner: row.owner as Hex,
      policyId: BigInt(row.policy_id),
      primaryType: row.primary_type,
      policyHash: row.policy_hash as Hex,
      policyClass: row.policy_class,
      createdBlock: BigInt(row.created_block),
      expiryBlock: BigInt(row.expiry_block),
      state: row.state,
      revokeInitiatedBlock:
        row.revoke_initiated_block !== null ? BigInt(row.revoke_initiated_block) : undefined,
      revokeFinalizedBlock:
        row.revoke_finalized_block !== null ? BigInt(row.revoke_finalized_block) : undefined,
    }));
  }
}

export interface RegistryCommitRecord {
  registryVersion: bigint;
  merkleRoot: Hex;
  committer: Hex;
  opCount: number;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

export class RegistryCommitRepository {
  constructor(private readonly db: DB) {}

  insert(commit: RegistryCommitRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO registry_commits(
           registry_version, merkle_root, committer, op_count,
           block_number, block_hash, transaction_hash, log_index
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(commit.registryVersion),
        commit.merkleRoot,
        commit.committer,
        commit.opCount,
        toNumber(commit.blockNumber),
        commit.blockHash,
        commit.transactionHash,
        commit.logIndex,
      );
  }

  deleteAtOrAbove(blockNumber: bigint): void {
    this.db
      .prepare("DELETE FROM registry_commits WHERE block_number >= ?")
      .run(toNumber(blockNumber));
  }

  latest(): RegistryCommitRecord | null {
    const row = this.db
      .prepare<
        [],
        {
          registry_version: number;
          merkle_root: string;
          committer: string;
          op_count: number;
          block_number: number;
          block_hash: string;
          transaction_hash: string;
          log_index: number;
        }
      >("SELECT * FROM registry_commits ORDER BY registry_version DESC LIMIT 1")
      .get();
    if (!row) return null;
    return mapRegistryCommit(row);
  }

  list(limit = 50): RegistryCommitRecord[] {
    const rows = this.db
      .prepare<
        [number],
        {
          registry_version: number;
          merkle_root: string;
          committer: string;
          op_count: number;
          block_number: number;
          block_hash: string;
          transaction_hash: string;
          log_index: number;
        }
      >("SELECT * FROM registry_commits ORDER BY registry_version DESC LIMIT ?")
      .all(limit);
    return rows.map(mapRegistryCommit);
  }
}

function mapRegistryCommit(row: {
  registry_version: number;
  merkle_root: string;
  committer: string;
  op_count: number;
  block_number: number;
  block_hash: string;
  transaction_hash: string;
  log_index: number;
}): RegistryCommitRecord {
  return {
    registryVersion: BigInt(row.registry_version),
    merkleRoot: row.merkle_root as Hex,
    committer: row.committer as Hex,
    opCount: row.op_count,
    blockNumber: BigInt(row.block_number),
    blockHash: row.block_hash as Hex,
    transactionHash: row.transaction_hash as Hex,
    logIndex: row.log_index,
  };
}

export interface AnchorSnapshotRecord {
  anchorBlock: bigint;
  manifestHash: Hex;
  submitter: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

export class AnchorSnapshotRepository {
  constructor(private readonly db: DB) {}

  insert(snapshot: AnchorSnapshotRecord): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO anchor_snapshots(
           anchor_block, manifest_hash, submitter,
           block_number, block_hash, transaction_hash, log_index
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        toNumber(snapshot.anchorBlock),
        snapshot.manifestHash,
        snapshot.submitter,
        toNumber(snapshot.blockNumber),
        snapshot.blockHash,
        snapshot.transactionHash,
        snapshot.logIndex,
      );
  }

  deleteAtOrAbove(blockNumber: bigint): void {
    this.db
      .prepare("DELETE FROM anchor_snapshots WHERE block_number >= ?")
      .run(toNumber(blockNumber));
  }

  latest(): AnchorSnapshotRecord | null {
    const row = this.db
      .prepare<
        [],
        {
          anchor_block: number;
          manifest_hash: string;
          submitter: string;
          block_number: number;
          block_hash: string;
          transaction_hash: string;
          log_index: number;
        }
      >("SELECT * FROM anchor_snapshots ORDER BY anchor_block DESC LIMIT 1")
      .get();
    if (!row) return null;
    return mapSnapshot(row);
  }

  list(limit = 50): AnchorSnapshotRecord[] {
    const rows = this.db
      .prepare<
        [number],
        {
          anchor_block: number;
          manifest_hash: string;
          submitter: string;
          block_number: number;
          block_hash: string;
          transaction_hash: string;
          log_index: number;
        }
      >("SELECT * FROM anchor_snapshots ORDER BY anchor_block DESC LIMIT ?")
      .all(limit);
    return rows.map(mapSnapshot);
  }
}

function mapSnapshot(row: {
  anchor_block: number;
  manifest_hash: string;
  submitter: string;
  block_number: number;
  block_hash: string;
  transaction_hash: string;
  log_index: number;
}): AnchorSnapshotRecord {
  return {
    anchorBlock: BigInt(row.anchor_block),
    manifestHash: row.manifest_hash as Hex,
    submitter: row.submitter as Hex,
    blockNumber: BigInt(row.block_number),
    blockHash: row.block_hash as Hex,
    transactionHash: row.transaction_hash as Hex,
    logIndex: row.log_index,
  };
}

export interface RoleRotationRecord {
  roleKind:
    | "indexerSigner"
    | "anchorSubmitter"
    | "governance"
    | "registryEmergencyGuardian"
    | "guardianRole";
  previous: Hex;
  next: Hex;
  effectiveBlock: bigint;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

export class RoleRotationRepository {
  constructor(private readonly db: DB) {}

  insert(rotation: RoleRotationRecord): void {
    this.db
      .prepare(
        `INSERT INTO role_rotations(
           role_kind, previous, next, effective_block,
           block_number, block_hash, transaction_hash, log_index
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rotation.roleKind,
        rotation.previous,
        rotation.next,
        toNumber(rotation.effectiveBlock),
        toNumber(rotation.blockNumber),
        rotation.blockHash,
        rotation.transactionHash,
        rotation.logIndex,
      );
  }

  deleteAtOrAbove(blockNumber: bigint): void {
    this.db
      .prepare("DELETE FROM role_rotations WHERE block_number >= ?")
      .run(toNumber(blockNumber));
  }

  list(roleKind?: RoleRotationRecord["roleKind"], limit = 50): RoleRotationRecord[] {
    if (roleKind) {
      const rows = this.db
        .prepare<
          [string, number],
          {
            role_kind: RoleRotationRecord["roleKind"];
            previous: string;
            next: string;
            effective_block: number;
            block_number: number;
            block_hash: string;
            transaction_hash: string;
            log_index: number;
          }
        >("SELECT * FROM role_rotations WHERE role_kind = ? ORDER BY block_number DESC LIMIT ?")
        .all(roleKind, limit);
      return rows.map(mapRotation);
    }
    const rows = this.db
      .prepare<
        [number],
        {
          role_kind: RoleRotationRecord["roleKind"];
          previous: string;
          next: string;
          effective_block: number;
          block_number: number;
          block_hash: string;
          transaction_hash: string;
          log_index: number;
        }
      >("SELECT * FROM role_rotations ORDER BY block_number DESC LIMIT ?")
      .all(limit);
    return rows.map(mapRotation);
  }
}

function mapRotation(row: {
  role_kind: RoleRotationRecord["roleKind"];
  previous: string;
  next: string;
  effective_block: number;
  block_number: number;
  block_hash: string;
  transaction_hash: string;
  log_index: number;
}): RoleRotationRecord {
  return {
    roleKind: row.role_kind,
    previous: row.previous as Hex,
    next: row.next as Hex,
    effectiveBlock: BigInt(row.effective_block),
    blockNumber: BigInt(row.block_number),
    blockHash: row.block_hash as Hex,
    transactionHash: row.transaction_hash as Hex,
    logIndex: row.log_index,
  };
}
