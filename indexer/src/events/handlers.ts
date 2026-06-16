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
      const a = decoded.args as Record<string, unknown>;
      repos.actionSteps.insert({
        blockNumber: context.blockNumber,
        blockHash: context.blockHash,
        logIndex,
        transactionHash: txHash,
        owner: requireString(a.owner, "owner"),
        primaryType: requireNumber(a.primaryType, "primaryType"),
        actionId: requireString(a.actionId, "actionId"),
        digest: requireString(a.digest, "digest"),
        stepKind: requireNumber(a.stepKind, "stepKind"),
        stepIndex: requireNumber(a.stepIndex, "stepIndex"),
        payloadJson: JSON.stringify({
          logIndexLow: requireNumber(a.logIndexLow, "logIndexLow"),
          logIndexHigh: requireNumber(a.logIndexHigh, "logIndexHigh"),
          payload: requireString(a.payload, "payload"),
        }),
      });
      return;
    }
    case "PolicyCreated":
    case "PolicyUpdated": {
      const a = decoded.args as Record<string, unknown>;
      const owner = requireString(a.owner, "owner");
      const policyId = requireBigInt(a.policyId, "policyId");
      const policyHash =
        decoded.eventName === "PolicyCreated"
          ? requireString(a.policyHash, "policyHash")
          : requireString(a.newPolicyHash, "newPolicyHash");
      const primaryType = requireNumber(a.primaryType, "primaryType");
      const policyClass =
        decoded.eventName === "PolicyCreated" ? requireNumber(a.policyClass, "policyClass") : 0;
      const expiryBlock = requireBigInt(a.expiryBlock, "expiryBlock");
      repos.policies.upsertCreated({
        owner,
        policyId,
        primaryType,
        policyHash,
        policyClass,
        createdBlock: context.blockNumber,
        expiryBlock,
        state: "active",
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
      const a = decoded.args as Record<string, unknown>;
      repos.registryCommits.insert({
        registryVersion: requireBigInt(a.registryVersion, "registryVersion"),
        merkleRoot: requireString(a.merkleRoot, "merkleRoot"),
        committer: requireString(a.committer, "committer"),
        opCount: requireNumber(a.opCount, "opCount"),
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
