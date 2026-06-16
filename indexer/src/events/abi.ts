/**
 * ABI fragments for the events the indexer subscribes to.
 *
 * Sourced from `contracts/v2/interfaces/ILoopV1Events.sol`. Kept as a literal AbiEvent[]
 * so viem's decodeEventLog can match on topic0.
 */
import type { AbiEvent } from "viem";

export const LOOP_ACTION_STEP: AbiEvent = {
  type: "event",
  name: "LoopActionStep",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "primaryType", type: "uint8", indexed: true },
    { name: "actionId", type: "bytes32", indexed: true },
    { name: "digest", type: "bytes32", indexed: false },
    { name: "stepKind", type: "uint8", indexed: false },
    { name: "stepIndex", type: "uint16", indexed: false },
    { name: "logIndexLow", type: "uint16", indexed: false },
    { name: "logIndexHigh", type: "uint16", indexed: false },
    { name: "payload", type: "bytes", indexed: false },
  ],
};

export const POLICY_CREATED: AbiEvent = {
  type: "event",
  name: "PolicyCreated",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "policyId", type: "uint64", indexed: true },
    { name: "primaryType", type: "uint8", indexed: true },
    { name: "policyHash", type: "bytes32", indexed: false },
    { name: "policyClass", type: "uint8", indexed: false },
    { name: "expiryBlock", type: "uint256", indexed: false },
  ],
};

export const POLICY_UPDATED: AbiEvent = {
  type: "event",
  name: "PolicyUpdated",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "policyId", type: "uint64", indexed: true },
    { name: "primaryType", type: "uint8", indexed: false },
    { name: "previousPolicyHash", type: "bytes32", indexed: false },
    { name: "newPolicyHash", type: "bytes32", indexed: false },
    { name: "expiryBlock", type: "uint256", indexed: false },
  ],
};

export const POLICY_REVOKING: AbiEvent = {
  type: "event",
  name: "PolicyRevoking",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "policyId", type: "uint64", indexed: true },
    { name: "revocationBlock", type: "uint256", indexed: false },
  ],
};

export const POLICY_REVOKED: AbiEvent = {
  type: "event",
  name: "PolicyRevoked",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "policyId", type: "uint64", indexed: true },
  ],
};

export const REGISTRY_CONFIG_BATCH_COMMITTED: AbiEvent = {
  type: "event",
  name: "RegistryConfigBatchCommitted",
  inputs: [
    { name: "registryVersion", type: "uint256", indexed: false },
    { name: "merkleRoot", type: "bytes32", indexed: false },
    { name: "committer", type: "address", indexed: false },
    { name: "opCount", type: "uint16", indexed: false },
  ],
};

export const STATE_SNAPSHOT_ACCEPTED: AbiEvent = {
  type: "event",
  name: "StateSnapshotAccepted",
  inputs: [
    { name: "blockNumber", type: "uint256", indexed: true },
    { name: "manifestHash", type: "bytes32", indexed: true },
    { name: "submitter", type: "address", indexed: true },
  ],
};

export const INDEXER_SIGNER_ROTATED: AbiEvent = {
  type: "event",
  name: "IndexerSignerRotated",
  inputs: [
    { name: "oldKey", type: "address", indexed: true },
    { name: "newKey", type: "address", indexed: true },
    { name: "effectiveBlock", type: "uint256", indexed: false },
  ],
};

export const ANCHOR_SUBMITTER_ROTATED: AbiEvent = {
  type: "event",
  name: "AnchorSubmitterRotated",
  inputs: [
    { name: "oldSubmitter", type: "address", indexed: true },
    { name: "newSubmitter", type: "address", indexed: true },
    { name: "effectiveBlock", type: "uint256", indexed: false },
  ],
};

export const GOVERNANCE_ROLE_CHANGED: AbiEvent = {
  type: "event",
  name: "GovernanceRoleChanged",
  inputs: [
    { name: "oldGovernance", type: "address", indexed: true },
    { name: "newGovernance", type: "address", indexed: true },
  ],
};

export const REGISTRY_EMERGENCY_GUARDIAN_CHANGED: AbiEvent = {
  type: "event",
  name: "RegistryEmergencyGuardianChanged",
  inputs: [
    { name: "oldGuardian", type: "address", indexed: true },
    { name: "newGuardian", type: "address", indexed: true },
    { name: "effectiveBlock", type: "uint256", indexed: false },
  ],
};

export const GUARDIAN_ROLE_ROTATED: AbiEvent = {
  type: "event",
  name: "GuardianRoleRotated",
  inputs: [
    { name: "oldGuardian", type: "address", indexed: true },
    { name: "newGuardian", type: "address", indexed: true },
  ],
};

export const INDEXER_ABI: AbiEvent[] = [
  LOOP_ACTION_STEP,
  POLICY_CREATED,
  POLICY_UPDATED,
  POLICY_REVOKING,
  POLICY_REVOKED,
  REGISTRY_CONFIG_BATCH_COMMITTED,
  STATE_SNAPSHOT_ACCEPTED,
  INDEXER_SIGNER_ROTATED,
  ANCHOR_SUBMITTER_ROTATED,
  GOVERNANCE_ROLE_CHANGED,
  REGISTRY_EMERGENCY_GUARDIAN_CHANGED,
  GUARDIAN_ROLE_ROTATED,
];
