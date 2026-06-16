// ExternalProtocolFingerprint classifier per the SDK type definitions
// (I-71 / I-78 ConfigIntegrityFailure). The SDK reads liveBaseline data from
// the indexer and compares against registry-pinned tolerance bands.

import type {
  Address,
  BasisPoints,
  Bytes32,
} from "../types/branded.js";
import type {
  ExternalProtocolFingerprint,
  FingerprintIntegrationKind,
  FingerprintStatus,
  FingerprintSubCause,
} from "../types/readiness.js";

export interface FingerprintToleranceBand {
  target: bigint;
  maxDriftBps?: BasisPoints;
  maxStalenessSeconds?: number;
}

export interface FingerprintClassifierInputs {
  integrationId: Bytes32;
  integrationKind: FingerprintIntegrationKind;
  sourceAddress: Address;
  /** Currently-observed bytes32 fingerprint (e.g. registry value). */
  liveFingerprint: Bytes32;
  /** Registry-pinned expected fingerprint. */
  expectedFingerprint: Bytes32;
  /** Optional tolerance band; absent => hard-equality only. */
  tolerance?: FingerprintToleranceBand;
  /** When the live read was taken. Used with tolerance.maxStalenessSeconds. */
  observedAtSeconds?: number;
  nowSeconds?: number;
  /** Set to "pendingUpdate" when registry has a queued timelocked update. */
  pendingUpdate?: boolean;
}

function subCauseFor(kind: FingerprintIntegrationKind): FingerprintSubCause {
  switch (kind) {
    case "CurvePool": return "curve-pool";
    case "UniswapV3Pool": return "uniswap-pool";
    case "ChainlinkFeed": return "chainlink-feed";
    case "SequencerFeed": return "sequencer-feed";
    case "WstDiemVault": return "wstdiem-vault";
    case "MorphoMarket": return "morpho-market";
  }
}

export function classifyFingerprint(
  inputs: FingerprintClassifierInputs,
): ExternalProtocolFingerprint {
  const subCause = subCauseFor(inputs.integrationKind);
  let status: FingerprintStatus;

  if (inputs.pendingUpdate) {
    status = "pendingUpdate";
  } else if (
    inputs.liveFingerprint.toLowerCase() === inputs.expectedFingerprint.toLowerCase()
  ) {
    status = "match";
  } else {
    status = "drift";
  }

  if (
    inputs.tolerance?.maxStalenessSeconds !== undefined &&
    inputs.observedAtSeconds !== undefined &&
    inputs.nowSeconds !== undefined &&
    inputs.nowSeconds - inputs.observedAtSeconds > inputs.tolerance.maxStalenessSeconds
  ) {
    status = "drift";
  }

  return {
    integrationId: inputs.integrationId,
    integrationKind: inputs.integrationKind,
    sourceAddress: inputs.sourceAddress,
    fingerprint: inputs.liveFingerprint,
    status,
    ...(inputs.tolerance ? { tolerance: inputs.tolerance } : {}),
    subCause,
  };
}

/** True iff any fingerprint in the bundle is drift or pendingUpdate. */
export function hasDrift(prints: readonly ExternalProtocolFingerprint[]): boolean {
  return prints.some((p) => p.status !== "match");
}
