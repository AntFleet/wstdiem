// G-PM-1 .. G-PM-6 post-matrix gate evaluators per the SDK type definitions §A1
// cross-cutting envelope rows + §A5 GateStatus.
//
// Each gate is a pure function the SDK runs before producing a signed digest;
// any "fail" stops signing with the named FailClosedErrorName.

import type {
  Address,
  BasisPoints,
  BlockNumber,
  Bytes32,
} from "../types/branded.js";
import type {
  AnchorFreshness,
  GateStatus,
  RpcQuorumStatus,
} from "../types/readiness.js";
import type {
  ExecutionKind,
  MevProtectionMode,
  PrimaryType,
} from "../types/enums.js";
import { MevWaiverBit } from "../types/enums.js";
import { isHighRiskByDigest } from "../preimage/i66.js";

export interface G1HarvestInputs {
  primaryType: PrimaryType;
  isRiskIncreasing: boolean;
  currentBlock: BlockNumber;
  lastHarvestBlock: BlockNumber;
  harvestCoolingBlocks: number;
}

/** G-PM-1: risk-increasing actions inside the harvest cooling window. */
export function evaluateG1HarvestConvergence(inputs: G1HarvestInputs): GateStatus {
  if (!inputs.isRiskIncreasing) {
    return { gate: "G_PM_1_HARVEST_CONVERGENCE", status: "notApplicable" };
  }
  const blocksSince = inputs.currentBlock - inputs.lastHarvestBlock;
  if (blocksSince <= BigInt(inputs.harvestCoolingBlocks)) {
    return {
      gate: "G_PM_1_HARVEST_CONVERGENCE",
      status: "fail",
      error: "HarvestConvergencePending",
    };
  }
  return { gate: "G_PM_1_HARVEST_CONVERGENCE", status: "pass" };
}

export interface G2AnchorInputs {
  anchor: AnchorFreshness;
}

/** G-PM-2: indexer anchor stale or emergency-stale. */
export function evaluateG2IndexerAnchor(inputs: G2AnchorInputs): GateStatus {
  if (inputs.anchor.status === "fresh") {
    return { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "pass" };
  }
  return {
    gate: "G_PM_2_INDEXER_ANCHOR_STALE",
    status: "fail",
    error: "IndexerAnchorStale",
  };
}

export interface G3RpcQuorumInputs {
  quorum: RpcQuorumStatus;
}

/** G-PM-3: RPC quorum not independent across provider families. */
export function evaluateG3RpcQuorum(inputs: G3RpcQuorumInputs): GateStatus {
  if (inputs.quorum.status === "ok") {
    return { gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT", status: "pass" };
  }
  if (inputs.quorum.status === "notIndependent") {
    return {
      gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT",
      status: "fail",
      error: "RpcQuorumNotIndependent",
    };
  }
  if (inputs.quorum.status === "degraded") {
    return {
      gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT",
      status: "fail",
      error: "RpcQuorumDegraded",
    };
  }
  return {
    gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT",
    status: "fail",
    error: "BlockInconsistent",
  };
}

export interface G4PreimageInputs {
  primaryType: PrimaryType;
  maxDebtIncrease?: bigint;
  isUnderlyingHighRisk?: boolean;
  signerOnAllowList: boolean;
  preimageProof?: Bytes32;
}

/** G-PM-4: EIP-1271 preimage attestation required for high-risk smart-wallet
 * paths unless signer is registry-allow-listed. */
export function evaluateG4Eip1271Preimage(inputs: G4PreimageInputs): GateStatus {
  const opts: Parameters<typeof isHighRiskByDigest>[0] = { primaryType: inputs.primaryType };
  if (inputs.maxDebtIncrease !== undefined) opts.maxDebtIncrease = inputs.maxDebtIncrease;
  if (inputs.isUnderlyingHighRisk !== undefined) opts.isUnderlyingHighRisk = inputs.isUnderlyingHighRisk;
  const highRisk = isHighRiskByDigest(opts);
  if (!highRisk || inputs.signerOnAllowList) {
    return { gate: "G_PM_4_EIP1271_PREIMAGE", status: "notApplicable" };
  }
  if (
    !inputs.preimageProof ||
    inputs.preimageProof ===
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return {
      gate: "G_PM_4_EIP1271_PREIMAGE",
      status: "fail",
      error: "Eip1271PreimageNotAttested",
    };
  }
  return { gate: "G_PM_4_EIP1271_PREIMAGE", status: "pass" };
}

export type SubmissionChannel =
  | "OWNER_DIRECT_MEMPOOL"
  | "PUBLIC_MEMPOOL"
  | "PRIVATE_BUILDER"
  | "SEQUENCER_DIRECT";

export interface G5MevWaiverInputs {
  signedMode: MevProtectionMode;
  observedChannel: SubmissionChannel;
  signedWaiverBits: number;
  builderKeyAvailable: boolean;
}

/** G-PM-5: MEV mode / waiver bit must be consistent with the observed
 * submission channel; required waiver bits must be set. */
export function evaluateG5MevWaiver(inputs: G5MevWaiverInputs): GateStatus {
  const { signedMode, observedChannel, signedWaiverBits, builderKeyAvailable } = inputs;

  if (signedMode === "PUBLIC") {
    if (observedChannel === "PUBLIC_MEMPOOL" || observedChannel === "OWNER_DIRECT_MEMPOOL") {
      const requires = MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN;
      if ((signedWaiverBits & requires) === 0) {
        return {
          gate: "G_PM_5_MEV_WAIVER",
          status: "fail",
          error: "MevWaiverMissing",
        };
      }
      return { gate: "G_PM_5_MEV_WAIVER", status: "pass" };
    }
    return { gate: "G_PM_5_MEV_WAIVER", status: "fail", error: "MevModeMismatch" };
  }

  if (signedMode === "PRIVATE_BUILDER") {
    if (observedChannel === "PRIVATE_BUILDER") {
      return { gate: "G_PM_5_MEV_WAIVER", status: "pass" };
    }
    if (observedChannel === "SEQUENCER_DIRECT") {
      if ((signedWaiverBits & MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN) === 0) {
        return {
          gate: "G_PM_5_MEV_WAIVER",
          status: "fail",
          error: "MevWaiverMissing",
        };
      }
      return { gate: "G_PM_5_MEV_WAIVER", status: "pass" };
    }
    if (!builderKeyAvailable) {
      if ((signedWaiverBits & MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN) === 0) {
        return {
          gate: "G_PM_5_MEV_WAIVER",
          status: "fail",
          error: "KeeperBuilderOutage",
        };
      }
      return { gate: "G_PM_5_MEV_WAIVER", status: "pass" };
    }
    return { gate: "G_PM_5_MEV_WAIVER", status: "fail", error: "MevModeMismatch" };
  }

  if (signedMode === "SEQUENCER_DIRECT_FAILOPEN") {
    if (observedChannel === "SEQUENCER_DIRECT") {
      return { gate: "G_PM_5_MEV_WAIVER", status: "pass" };
    }
    return { gate: "G_PM_5_MEV_WAIVER", status: "fail", error: "MevModeMismatch" };
  }

  // SEALED_AUCTION: Phase G; treat as not applicable for Phase 1 evaluation but
  // surface as fail so callers don't accidentally submit through a public path.
  return { gate: "G_PM_5_MEV_WAIVER", status: "fail", error: "MevModeMismatch" };
}

export interface G6AutomationThrottleInputs {
  executionKind: ExecutionKind;
  failedAttemptsInWindow: number;
  maxFailedAttemptsPerWindow: number;
  callerAllowed: boolean;
}

/** G-PM-6: per-policy permissionless throttle + caller-allow-list. */
export function evaluateG6AutomationThrottle(
  inputs: G6AutomationThrottleInputs,
): GateStatus {
  if (inputs.executionKind !== "KEEPER_PERMISSIONLESS") {
    return { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "notApplicable" };
  }
  if (!inputs.callerAllowed) {
    return {
      gate: "G_PM_6_AUTOMATION_THROTTLE",
      status: "fail",
      error: "CallerNotAllowed",
    };
  }
  if (inputs.failedAttemptsInWindow >= inputs.maxFailedAttemptsPerWindow) {
    return {
      gate: "G_PM_6_AUTOMATION_THROTTLE",
      status: "fail",
      error: "AutomationAttemptThrottled",
    };
  }
  return { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "pass" };
}

export interface PostMatrixGateInputs {
  g1?: G1HarvestInputs;
  g2?: G2AnchorInputs;
  g3?: G3RpcQuorumInputs;
  g4?: G4PreimageInputs;
  g5?: G5MevWaiverInputs;
  g6?: G6AutomationThrottleInputs;
}

/** Runs every supplied gate evaluator and returns the result list. Missing
 * inputs produce a notApplicable status for that gate. */
export function evaluatePostMatrixGates(inputs: PostMatrixGateInputs): GateStatus[] {
  const results: GateStatus[] = [];
  results.push(
    inputs.g1
      ? evaluateG1HarvestConvergence(inputs.g1)
      : { gate: "G_PM_1_HARVEST_CONVERGENCE", status: "notApplicable" },
  );
  results.push(
    inputs.g2
      ? evaluateG2IndexerAnchor(inputs.g2)
      : { gate: "G_PM_2_INDEXER_ANCHOR_STALE", status: "notApplicable" },
  );
  results.push(
    inputs.g3
      ? evaluateG3RpcQuorum(inputs.g3)
      : { gate: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT", status: "notApplicable" },
  );
  results.push(
    inputs.g4
      ? evaluateG4Eip1271Preimage(inputs.g4)
      : { gate: "G_PM_4_EIP1271_PREIMAGE", status: "notApplicable" },
  );
  results.push(
    inputs.g5
      ? evaluateG5MevWaiver(inputs.g5)
      : { gate: "G_PM_5_MEV_WAIVER", status: "notApplicable" },
  );
  results.push(
    inputs.g6
      ? evaluateG6AutomationThrottle(inputs.g6)
      : { gate: "G_PM_6_AUTOMATION_THROTTLE", status: "notApplicable" },
  );
  return results;
}

/** True iff every gate is pass or notApplicable.
 *
 * SECURITY NOTE: notApplicable is treated as pass; a caller that omits a
 * required gate input (e.g. omits `g2` because the indexer reader returned
 * undefined) gets notApplicable for that gate, which gatesAllPass accepts.
 * For pre-sign safety, callers should use `gatesAllPassStrict` and name the
 * gates that MUST have inputs supplied (anchor staleness for any signed action,
 * preimage attestation for any high-risk action, etc.). */
export function gatesAllPass(statuses: readonly GateStatus[]): boolean {
  return statuses.every((s) => s.status !== "fail");
}

/** True iff every status is "pass" for every required GateId AND every other
 * status is pass or notApplicable. Fails the call when a required gate is
 * notApplicable, closing the missing-input-as-bypass attack. */
export function gatesAllPassStrict(
  statuses: readonly GateStatus[],
  requiredGates: readonly GateStatus["gate"][],
): boolean {
  if (statuses.some((s) => s.status === "fail")) return false;
  const required = new Set(requiredGates);
  for (const s of statuses) {
    if (required.has(s.gate) && s.status !== "pass") return false;
  }
  return true;
}
