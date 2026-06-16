/**
 * SQLite schema for the WSTDIEM indexer.
 *
 * Tables are written as raw SQL DDL because better-sqlite3 is the storage engine
 * and the schema is small enough that an ORM adds more complexity than value.
 * Migrations are forward-only and identified by monotonic integer versions.
 */
export const MIGRATIONS: { version: number; description: string; sql: string }[] = [
  {
    version: 1,
    description: "initial schema",
    sql: `
      CREATE TABLE IF NOT EXISTS head_tracker (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_indexed_block INTEGER NOT NULL,
        last_indexed_block_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS block_index (
        block_number INTEGER PRIMARY KEY,
        block_hash TEXT NOT NULL,
        parent_hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_block_index_hash ON block_index(block_hash);

      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS action_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_number INTEGER NOT NULL,
        block_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        transaction_hash TEXT NOT NULL,
        owner TEXT NOT NULL,
        primary_type INTEGER NOT NULL,
        action_id TEXT NOT NULL,
        digest TEXT NOT NULL,
        step_kind INTEGER NOT NULL,
        step_index INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE(transaction_hash, log_index)
      );
      CREATE INDEX IF NOT EXISTS idx_action_steps_action_id ON action_steps(action_id);
      CREATE INDEX IF NOT EXISTS idx_action_steps_owner ON action_steps(owner);
      CREATE INDEX IF NOT EXISTS idx_action_steps_block ON action_steps(block_number);

      CREATE TABLE IF NOT EXISTS policies (
        owner TEXT NOT NULL,
        policy_id INTEGER NOT NULL,
        primary_type INTEGER NOT NULL,
        policy_hash TEXT NOT NULL,
        policy_class INTEGER NOT NULL,
        created_block INTEGER NOT NULL,
        expiry_block INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('active','revoking','revoked')),
        revoke_initiated_block INTEGER,
        revoke_finalized_block INTEGER,
        PRIMARY KEY(owner, policy_id)
      );
      CREATE INDEX IF NOT EXISTS idx_policies_state ON policies(state);
      CREATE INDEX IF NOT EXISTS idx_policies_owner ON policies(owner);

      CREATE TABLE IF NOT EXISTS registry_commits (
        registry_version INTEGER PRIMARY KEY,
        merkle_root TEXT NOT NULL,
        committer TEXT NOT NULL,
        op_count INTEGER NOT NULL,
        block_number INTEGER NOT NULL,
        block_hash TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS anchor_snapshots (
        anchor_block INTEGER NOT NULL,
        manifest_hash TEXT NOT NULL,
        submitter TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        block_hash TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        PRIMARY KEY(anchor_block, manifest_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_anchor_snapshots_block ON anchor_snapshots(block_number);

      CREATE TABLE IF NOT EXISTS role_rotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_kind TEXT NOT NULL,
        previous TEXT NOT NULL,
        next TEXT NOT NULL,
        effective_block INTEGER NOT NULL,
        block_number INTEGER NOT NULL,
        block_hash TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_role_rotations_kind ON role_rotations(role_kind);
      CREATE INDEX IF NOT EXISTS idx_role_rotations_block ON role_rotations(block_number);
    `,
  },
];
