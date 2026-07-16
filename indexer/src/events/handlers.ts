import type { Hex, Log } from "viem";
import type {
  AnchorSnapshotRepository,
  ActionStepRepository,
  PolicyRepository,
  RegistryCommitRepository,
  RoleRotationRepository,
  RoleRotationRecord,
} from "../state/repositories.js";
import type { DecodedEvent } from "./decoder.js";

export interface Repositories {
  actionSteps: ActionStepRepository;
  policies: PolicyRepository;
  registryCommits: RegistryCommitRepository;
  anchorSnapshots: AnchorSnapshotRepository;
  roleRotations: RoleRotationRepository;
}

export interface BlockContext {
  blockNumber: bigint;
  blockHash: Hex;
}

const requireString = (v: unknown, field: string): Hex => {
  if (typeof v !== "string") throw new Error(`Expected ${field} to be a hex string`);
  return v as Hex;
};

const requireBigInt = (v: unknown, field: string): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  throw new Error(`Expected ${field} to be a numeric value`);
};

const requireNumber = (v: unknown, field: string): number => {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") {
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${field} exceeds safe integer`);
    }
    return Number(v);
  }
  throw new Error(`Expected ${field} to be a numeric value`);
};

const logIndexOf = (log: Log): number => log.logIndex ?? 0;

const transactionHashOf = (log: Log): Hex => {
  if (!log.transactionHash) {
    throw new Error("Log missing transactionHash; pending logs are not indexed");
  }
  return log.transactionHash;
};

export function applyEvent(
  decoded: DecodedEvent,
  context: BlockContext,
  repos: Repositories,
): void {
  const log = decoded.log;
  const txHash = transactionHashOf(log);
  const logIndex = logIndexOf(log);

  switch (decoded.eventName) {
    case "LoopActionStep": {
      // ILoopV1Events: (owner, market, actionId, stepIndex, primaryType, target, selector, terminal)
      // Authorization emits digest into the actionId slot (topic for the step identity).
      const a = decoded.args as Record<string, unknown>;
      const actionId = requireString(a.actionId, "actionId");
      repos.actionSteps.insert({
        blockNumber: context.blockNumber,
        blockHash: context.blockHash,
        logIndex,
        transactionHash: txHash,
        owner: requireString(a.owner, "owner"),
        primaryType: requireNumber(a.primaryType, "primaryType"),
        actionId,
        digest: actionId,
        stepKind: 0,
        stepIndex: requireNumber(a.stepIndex, "stepIndex"),
        payloadJson: JSON.stringify({
          market: requireString(a.market, "market"),
          target: requireString(a.target, "target"),
          selector: requireString(a.selector, "selector"),
          terminal: Boolean(a.terminal),
        }),
      });
      return;
    }
    case "PolicyCreated": {
      // Phase-1 event has no policyClass; store 0 until a class field is added on-chain.
      const a = decoded.args as Record<string, unknown>;
      repos.policies.upsertCreated({
        owner: requireString(a.owner, "owner"),
        policyId: requireBigInt(a.policyId, "policyId"),
        primaryType: requireNumber(a.primaryType, "primaryType"),
        policyHash: requireString(a.policyHash, "policyHash"),
        policyClass: 0,
        createdBlock: context.blockNumber,
        expiryBlock: requireBigInt(a.expiryBlock, "expiryBlock"),
        state: "active",
      });
      return;
    }
    case "PolicyUpdated": {
      // PolicyUpdated has no primaryType; preserve existing row fields.
      const a = decoded.args as Record<string, unknown>;
      repos.policies.upsertUpdated({
        owner: requireString(a.owner, "owner"),
        policyId: requireBigInt(a.policyId, "policyId"),
        policyHash: requireString(a.newPolicyHash, "newPolicyHash"),
        expiryBlock: requireBigInt(a.expiryBlock, "expiryBlock"),
      });
      return;
    }
    case "PolicyRevoking": {
      const a = decoded.args as Record<string, unknown>;
      repos.policies.markRevoking(
        requireString(a.owner, "owner"),
        requireBigInt(a.policyId, "policyId"),
        requireBigInt(a.revocationBlock, "revocationBlock"),
      );
      return;
    }
    case "PolicyRevoked": {
      const a = decoded.args as Record<string, unknown>;
      repos.policies.markRevoked(
        requireString(a.owner, "owner"),
        requireBigInt(a.policyId, "policyId"),
        context.blockNumber,
      );
      return;
    }
    case "RegistryConfigBatchCommitted": {
      // Event fields: version, root, committer, opsCount (all but opsCount indexed).
      const a = decoded.args as Record<string, unknown>;
      repos.registryCommits.insert({
        registryVersion: requireBigInt(a.version, "version"),
        merkleRoot: requireString(a.root, "root"),
        committer: requireString(a.committer, "committer"),
        opCount: requireNumber(a.opsCount, "opsCount"),
        blockNumber: context.blockNumber,
        blockHash: context.blockHash,
        transactionHash: txHash,
        logIndex,
      });
      return;
    }
    case "StateSnapshotAccepted": {
      const a = decoded.args as Record<string, unknown>;
      repos.anchorSnapshots.insert({
        anchorBlock: requireBigInt(a.blockNumber, "blockNumber"),
        manifestHash: requireString(a.manifestHash, "manifestHash"),
        submitter: requireString(a.submitter, "submitter"),
        blockNumber: context.blockNumber,
        blockHash: context.blockHash,
        transactionHash: txHash,
        logIndex,
      });
      return;
    }
    case "IndexerSignerRotated":
    case "AnchorSubmitterRotated":
    case "GovernanceRoleChanged":
    case "RegistryEmergencyGuardianChanged":
    case "GuardianRoleRotated": {
      const a = decoded.args as Record<string, unknown>;
      const roleKind = roleKindFor(decoded.eventName);
      const { previous, next } = previousNextFor(decoded.eventName, a);
      const effectiveBlock =
        decoded.eventName === "GovernanceRoleChanged" ||
        decoded.eventName === "GuardianRoleRotated"
          ? context.blockNumber
          : requireBigInt(a.effectiveBlock, "effectiveBlock");
      repos.roleRotations.insert({
        roleKind,
        previous,
        next,
        effectiveBlock,
        blockNumber: context.blockNumber,
        blockHash: context.blockHash,
        transactionHash: txHash,
        logIndex,
      });
      return;
    }
    default:
      // Unknown / unsubscribed event -- ignore.
      return;
  }
}

function roleKindFor(eventName: string): RoleRotationRecord["roleKind"] {
  switch (eventName) {
    case "IndexerSignerRotated":
      return "indexerSigner";
    case "AnchorSubmitterRotated":
      return "anchorSubmitter";
    case "GovernanceRoleChanged":
      return "governance";
    case "RegistryEmergencyGuardianChanged":
      return "registryEmergencyGuardian";
    case "GuardianRoleRotated":
      return "guardianRole";
    default:
      throw new Error(`Unknown role-rotation event: ${eventName}`);
  }
}

function previousNextFor(
  eventName: string,
  args: Record<string, unknown>,
): { previous: Hex; next: Hex } {
  const pick = (a: string, b: string) => ({
    previous: requireString(args[a], a),
    next: requireString(args[b], b),
  });
  switch (eventName) {
    case "IndexerSignerRotated":
      return pick("oldKey", "newKey");
    case "AnchorSubmitterRotated":
      return pick("oldSubmitter", "newSubmitter");
    case "GovernanceRoleChanged":
      return pick("oldGovernance", "newGovernance");
    case "RegistryEmergencyGuardianChanged":
    case "GuardianRoleRotated":
      return pick("oldGuardian", "newGuardian");
    default:
      throw new Error(`Unknown role-rotation event: ${eventName}`);
  }
}
