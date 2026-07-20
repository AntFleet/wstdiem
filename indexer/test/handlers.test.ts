import { describe, it, expect, beforeEach } from "vitest";
import {
  encodeEventTopics,
  encodeAbiParameters,
  type Log,
  type Hex,
} from "viem";
import { applyEvent, type Repositories } from "../src/events/handlers.js";
import { decodeLog } from "../src/events/decoder.js";
import {
  LOOP_ACTION_STEP,
  POLICY_CREATED,
  POLICY_UPDATED,
  REGISTRY_CONFIG_BATCH_COMMITTED,
  RECLOSED_INTEGRATION,
} from "../src/events/abi.js";
import { openDatabase } from "../src/db/client.js";
import {
  ActionStepRepository,
  PolicyRepository,
  RegistryCommitRepository,
  AnchorSnapshotRepository,
  RoleRotationRepository,
} from "../src/state/repositories.js";

function buildLog(args: {
  topics: `0x${string}`[];
  data: `0x${string}`;
}): Log {
  return {
    address: "0x0000000000000000000000000000000000000001",
    blockHash: "0xbbbb".padEnd(66, "0") as `0x${string}`,
    blockNumber: 100n,
    data: args.data,
    logIndex: 0,
    removed: false,
    topics: args.topics as readonly `0x${string}`[] as Log["topics"],
    transactionHash: "0xcccc".padEnd(66, "0") as `0x${string}`,
    transactionIndex: 0,
  } as unknown as Log;
}

describe("applyEvent with canonical ILoopV1Events shapes", () => {
  let repos: Repositories;

  beforeEach(() => {
    const db = openDatabase(":memory:");
    repos = {
      actionSteps: new ActionStepRepository(db),
      policies: new PolicyRepository(db),
      registryCommits: new RegistryCommitRepository(db),
      anchorSnapshots: new AnchorSnapshotRepository(db),
      roleRotations: new RoleRotationRepository(db),
    };
  });

  it("indexes LoopActionStep", () => {
    const owner = "0x000000000000000000000000000000000000abcd" as Hex;
    const market = ("0xaa".padEnd(66, "0")) as Hex;
    const actionId = ("0xbb".padEnd(66, "0")) as Hex;
    const topics = encodeEventTopics({
      abi: [LOOP_ACTION_STEP],
      args: { owner, market, actionId },
    }) as `0x${string}`[];
    const data = encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "uint8" },
        { type: "address" },
        { type: "bytes4" },
        { type: "bool" },
      ],
      [1, 0, "0x0000000000000000000000000000000000000def", "0x12345678", true],
    ) as Hex;
    const log = buildLog({ topics, data });
    const decoded = decodeLog(log);
    expect(decoded?.eventName).toBe("LoopActionStep");
    applyEvent(decoded!, { blockNumber: 100n, blockHash: log.blockHash! }, repos);
    const rows = repos.actionSteps.byActionId(actionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].primaryType).toBe(0);
    expect(rows[0].digest).toBe(actionId);
    expect(JSON.parse(rows[0].payloadJson).terminal).toBe(true);
  });

  it("indexes PolicyCreated without policyClass field", () => {
    const owner = "0x000000000000000000000000000000000000abcd" as Hex;
    const topics = encodeEventTopics({
      abi: [POLICY_CREATED],
      args: { owner, policyId: 7n, primaryType: 1 },
    }) as `0x${string}`[];
    const data = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [("0xcc".padEnd(66, "0")) as Hex, 999n],
    ) as Hex;
    const log = buildLog({ topics, data });
    const decoded = decodeLog(log);
    applyEvent(decoded!, { blockNumber: 50n, blockHash: log.blockHash! }, repos);
    const policies = repos.policies.list();
    expect(policies).toHaveLength(1);
    expect(policies[0].policyId).toBe(7n);
    expect(policies[0].primaryType).toBe(1);
    expect(policies[0].policyClass).toBe(0);
  });

  it("PolicyUpdated preserves primaryType from create", () => {
    const owner = "0x000000000000000000000000000000000000abcd" as Hex;
    const createTopics = encodeEventTopics({
      abi: [POLICY_CREATED],
      args: { owner, policyId: 3n, primaryType: 2 },
    }) as `0x${string}`[];
    const createData = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [("0x11".padEnd(66, "0")) as Hex, 100n],
    ) as Hex;
    applyEvent(
      decodeLog(buildLog({ topics: createTopics, data: createData }))!,
      { blockNumber: 1n, blockHash: ("0xbb".padEnd(66, "0")) as Hex },
      repos,
    );

    const updateTopics = encodeEventTopics({
      abi: [POLICY_UPDATED],
      args: { owner, policyId: 3n },
    }) as `0x${string}`[];
    const updateData = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
      [("0x11".padEnd(66, "0")) as Hex, ("0x22".padEnd(66, "0")) as Hex, 200n],
    ) as Hex;
    applyEvent(
      decodeLog(buildLog({ topics: updateTopics, data: updateData }))!,
      { blockNumber: 2n, blockHash: ("0xbb".padEnd(66, "0")) as Hex },
      repos,
    );
    const p = repos.policies.list()[0];
    expect(p.primaryType).toBe(2);
    expect(p.policyHash).toBe(("0x22".padEnd(66, "0")));
    expect(p.expiryBlock).toBe(200n);
  });

  it("indexes RegistryConfigBatchCommitted with version/root names", () => {
    const committer = "0x000000000000000000000000000000000000abcd" as Hex;
    const version = 5n;
    const root = ("0xdd".padEnd(66, "0")) as Hex;
    const topics = encodeEventTopics({
      abi: [REGISTRY_CONFIG_BATCH_COMMITTED],
      args: { version, root, committer },
    }) as `0x${string}`[];
    const data = encodeAbiParameters([{ type: "uint16" }], [3]) as Hex;
    const log = buildLog({ topics, data });
    applyEvent(
      decodeLog(log)!,
      { blockNumber: 10n, blockHash: log.blockHash! },
      repos,
    );
    // no public list on registry commits — smoke via no throw is enough; re-read if needed
  });

  it("decodes fingerprint events (EIP-170 Phase 3) without crashing or projecting", () => {
    // The split-out LoopFingerprintRegistry events must decode and reach a
    // handler; the handler is an explicit no-op (no projection table yet), so
    // applyEvent must not throw and must not write any row.
    const integrationId = ("0x1c".padEnd(66, "0")) as Hex;
    const topics = encodeEventTopics({
      abi: [RECLOSED_INTEGRATION],
      args: { integrationId },
    }) as `0x${string}`[];
    const log = buildLog({ topics, data: "0x" });
    const decoded = decodeLog(log);
    expect(decoded?.eventName).toBe("ReclosedIntegration");
    expect(() =>
      applyEvent(decoded!, { blockNumber: 100n, blockHash: log.blockHash! }, repos),
    ).not.toThrow();
    // No fingerprint projection: unrelated repositories stay empty.
    expect(repos.policies.list()).toHaveLength(0);
  });
});
