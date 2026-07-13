/**
 * ABI fragments for the events the indexer subscribes to.
 *
 * Canonical shapes from `contracts/v2/interfaces/ILoopV1Events.sol`.
 * topic0 is keccak256 of the type signature only; **indexed flags must also
 * match** forge artifacts so decodeEventLog succeeds on live logs.
 * Guarded by `scripts/event-abi-parity.mjs` + CI.
 */
import type { AbiEvent } from "viem";

export const LOOP_ACTION_STEP: AbiEvent = {
  type: "event",
  name: "LoopActionStep",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "market", type: "bytes32", indexed: true },
    { name: "actionId", type: "bytes32", indexed: true },
    { name: "stepIndex", type: "uint8", indexed: false },
    { name: "primaryType", type: "uint8", indexed: false },
    { name: "target", type: "address", indexed: false },
    { name: "selector", type: "bytes4", indexed: false },
    { name: "terminal", type: "bool", indexed: false },
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
    { name: "expiryBlock", type: "uint256", indexed: false },
  ],
};

export const POLICY_UPDATED: AbiEvent = {
  type: "event",
  name: "PolicyUpdated",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "policyId", type: "uint64", indexed: true },
    { name: "oldPolicyHash", type: "bytes32", indexed: false },
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
    { name: "version", type: "uint256", indexed: true },
    { name: "root", type: "bytes32", indexed: true },
    { name: "committer", type: "address", indexed: true },
    { name: "opsCount", type: "uint16", indexed: false },
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
