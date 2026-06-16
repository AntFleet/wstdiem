import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase, type DB } from "../src/db/client.js";
import {
  ActionStepRepository,
  AnchorSnapshotRepository,
  BlockRepository,
  HeadRepository,
  PolicyRepository,
  RegistryCommitRepository,
  RoleRotationRepository,
} from "../src/state/repositories.js";

describe("repositories", () => {
  let db: DB;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("head repository round-trips state", () => {
    const heads = new HeadRepository(db);
    expect(heads.get()).toBeNull();
    heads.set({
      lastIndexedBlock: 100n,
      lastIndexedBlockHash: "0xab".padEnd(66, "0") as `0x${string}`,
    });
    const got = heads.get();
    expect(got?.lastIndexedBlock).toBe(100n);
    heads.set({
      lastIndexedBlock: 101n,
      lastIndexedBlockHash: "0xcd".padEnd(66, "0") as `0x${string}`,
    });
    expect(heads.get()?.lastIndexedBlock).toBe(101n);
  });

  it("block repository upserts and deletes at or above", () => {
    const blocks = new BlockRepository(db);
    for (let n = 1n; n <= 5n; n += 1n) {
      blocks.upsert({
        number: n,
        hash: `0xa${n.toString(16).padStart(63, "0")}` as `0x${string}`,
        parentHash: `0xb${(n - 1n).toString(16).padStart(63, "0")}` as `0x${string}`,
        timestamp: BigInt(1700_000_000) + n,
      });
    }
    expect(blocks.get(3n)?.number).toBe(3n);
    blocks.deleteAtOrAbove(4n);
    expect(blocks.get(3n)).not.toBeNull();
    expect(blocks.get(4n)).toBeNull();
    expect(blocks.get(5n)).toBeNull();
  });

  it("policy lifecycle: created -> revoking -> revoked", () => {
    const policies = new PolicyRepository(db);
    const owner = "0x0000000000000000000000000000000000000001" as `0x${string}`;
    policies.upsertCreated({
      owner,
      policyId: 5n,
      primaryType: 0,
      policyHash: "0xab".padEnd(66, "0") as `0x${string}`,
      policyClass: 0,
      createdBlock: 100n,
      expiryBlock: 1000n,
      state: "active",
    });
    expect(policies.list()[0]?.state).toBe("active");
    policies.markRevoking(owner, 5n, 200n);
    expect(policies.list()[0]?.state).toBe("revoking");
    policies.markRevoked(owner, 5n, 300n);
    expect(policies.list()[0]?.state).toBe("revoked");
    expect(policies.list()[0]?.revokeFinalizedBlock).toBe(300n);
  });

  it("registry commits list newest first and respect deletion cutoff", () => {
    const commits = new RegistryCommitRepository(db);
    for (let v = 1n; v <= 3n; v += 1n) {
      commits.insert({
        registryVersion: v,
        merkleRoot: `0x${v.toString(16).padStart(64, "0")}` as `0x${string}`,
        committer: "0x0000000000000000000000000000000000000099" as `0x${string}`,
        opCount: Number(v),
        blockNumber: 100n + v,
        blockHash: `0xaa${v.toString(16).padStart(62, "0")}` as `0x${string}`,
        transactionHash: `0xbb${v.toString(16).padStart(62, "0")}` as `0x${string}`,
        logIndex: 0,
      });
    }
    const latest = commits.latest();
    expect(latest?.registryVersion).toBe(3n);
    expect(commits.list().length).toBe(3);
    commits.deleteAtOrAbove(102n);
    expect(commits.latest()?.registryVersion).toBe(1n);
  });

  it("anchor snapshots are insertable and listable", () => {
    const snapshots = new AnchorSnapshotRepository(db);
    snapshots.insert({
      anchorBlock: 500n,
      manifestHash: ("0xab".padEnd(66, "0")) as `0x${string}`,
      submitter: "0x0000000000000000000000000000000000000077" as `0x${string}`,
      blockNumber: 510n,
      blockHash: ("0xcc".padEnd(66, "0")) as `0x${string}`,
      transactionHash: ("0xdd".padEnd(66, "0")) as `0x${string}`,
      logIndex: 2,
    });
    expect(snapshots.latest()?.anchorBlock).toBe(500n);
    snapshots.deleteAtOrAbove(509n);
    expect(snapshots.latest()).toBeNull();
  });

  it("role rotations log per kind", () => {
    const rotations = new RoleRotationRepository(db);
    rotations.insert({
      roleKind: "indexerSigner",
      previous: "0x0000000000000000000000000000000000000010" as `0x${string}`,
      next: "0x0000000000000000000000000000000000000011" as `0x${string}`,
      effectiveBlock: 100n,
      blockNumber: 100n,
      blockHash: ("0xab".padEnd(66, "0")) as `0x${string}`,
      transactionHash: ("0xcd".padEnd(66, "0")) as `0x${string}`,
      logIndex: 0,
    });
    rotations.insert({
      roleKind: "registryEmergencyGuardian",
      previous: "0x0000000000000000000000000000000000000020" as `0x${string}`,
      next: "0x0000000000000000000000000000000000000021" as `0x${string}`,
      effectiveBlock: 200n,
      blockNumber: 200n,
      blockHash: ("0xef".padEnd(66, "0")) as `0x${string}`,
      transactionHash: ("0x12".padEnd(66, "0")) as `0x${string}`,
      logIndex: 0,
    });
    expect(rotations.list().length).toBe(2);
    expect(rotations.list("indexerSigner").length).toBe(1);
    expect(rotations.list("guardianRole").length).toBe(0);
  });

  it("action steps are unique on (transactionHash, logIndex)", () => {
    const steps = new ActionStepRepository(db);
    const owner = "0x0000000000000000000000000000000000000003" as `0x${string}`;
    const actionId = ("0xab".padEnd(66, "0")) as `0x${string}`;
    const step = {
      blockNumber: 100n,
      blockHash: ("0xcc".padEnd(66, "0")) as `0x${string}`,
      logIndex: 1,
      transactionHash: ("0xdd".padEnd(66, "0")) as `0x${string}`,
      owner,
      primaryType: 0,
      actionId,
      digest: ("0xee".padEnd(66, "0")) as `0x${string}`,
      stepKind: 1,
      stepIndex: 0,
      payloadJson: "{}",
    };
    steps.insert(step);
    steps.insert(step); // duplicate -- should be ignored by UNIQUE(transactionHash, logIndex)
    expect(steps.byActionId(actionId).length).toBe(1);
  });
});
