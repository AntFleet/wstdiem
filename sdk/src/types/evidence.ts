// EvidenceSource discriminated union + ActionEvidence + StateBit per
// the SDK type definitions (lines 588-652) and §A2 canonical schedule.

import type {
  Address,
  Bytes32,
  BlockNumber,
  MarketId,
  StateBitmap,
  BasisPoints,
  UnixSeconds,
} from "./branded.js";
import type { SourceStatus } from "./enums.js";
// Re-export so consumers that import evidence types can also pull SourceStatus
// from this module (it is the canonical status type for EvidenceSource).
export type { SourceStatus } from "./enums.js";

// Canonical sourceId labels per §A2. The preimage suffix is appended to
// "wstdiem.source." and hashed via keccak256 to produce the on-chain bytes32.
// See SOURCE_ID_HASHES below for pinned values matching the contract snapshot
// at test/foundry/v2/snapshots/sourceIds.json.

export type EvidenceSourceId =
  | "harvest-event"
  | "morpho-position"
  | "chainlink-feed"
  | "sequencer-uptime"
  | "vault-nav"
  | "external-protocol-fingerprint"
  | "curve-quote";

export const EVIDENCE_SOURCE_IDS: readonly EvidenceSourceId[] = [
  "harvest-event",
  "morpho-position",
  "chainlink-feed",
  "sequencer-uptime",
  "vault-nav",
  "external-protocol-fingerprint",
  "curve-quote",
] as const;

// Pinned keccak256("wstdiem.source.<label>") values. The encoder MUST recompute
// these from the canonical preimage at module load and assert parity; see
// src/evidence/sourceIds.ts.
export const SOURCE_ID_HASHES: Record<EvidenceSourceId, Bytes32> = {
  "morpho-position":
    "0x4572e563d333c7c905811411af5189452e337a48560e391102fd73e6145d19e4",
  "vault-nav":
    "0x4accd06ade91ccf01d8a83bd5e4fd7d94ac8ac13470f2df8a1a9c568a935829f",
  "chainlink-feed":
    "0xec5adf640ecb17c79d036d9acecb40e1eca6e23d52daf087aa2b6e5411c37278",
  "curve-quote":
    "0x3c23e543081ccc283e55ac0a6b70fad7ba6fff38442b23f88681ae1b059a34b3",
  "sequencer-uptime":
    "0x4dffde18d10c49ab00615120c262970f39d158df51a8c6e1fbe07a51ce68ada8",
  "harvest-event":
    "0xe0ae42df22d3bb227e56e47ce0c42f373ca2ad2e133e9b927cb22ceb04aa1067",
  "external-protocol-fingerprint":
    "0xdfa655c0e685077e5f5785b06545671383302adada35d41ba71149ee27cca2cb",
};

export interface BaseEvidenceSource {
  sourceId: EvidenceSourceId;
  sourceIdHash: Bytes32;
  sourceAddress: Address;
  status: SourceStatus;
  lastUpdateBlock: BlockNumber;
  valueHash: Bytes32;
}

export interface MorphoPositionValue {
  collateral: bigint;
  borrowShares: bigint;
  supplyShares: bigint;
}

export interface VaultNavValue {
  convertToAssets1e18: bigint;
  totalSupply: bigint;
  totalAssets: bigint;
}

export interface ChainlinkFeedValue {
  answer: bigint;
  updatedAt: UnixSeconds;
  roundId: bigint;
}

export interface CurveQuoteValue {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  priceImpactBps: BasisPoints;
}

export type SequencerStatus = "up" | "down" | "gracePeriod";

export interface SequencerUptimeValue {
  status: SequencerStatus;
  startedAt: UnixSeconds;
  updatedAt: UnixSeconds;
}

export interface HarvestEventValue {
  lastHarvestBlock: BlockNumber;
  topic0: Bytes32;
  feeRouter: Address;
}

export interface ExternalProtocolFingerprintValue {
  fingerprintRoot: Bytes32;
  integrationIds: readonly Bytes32[];
}

export type EvidenceSource =
  | (BaseEvidenceSource & { sourceId: "morpho-position"; value: MorphoPositionValue })
  | (BaseEvidenceSource & { sourceId: "vault-nav"; value: VaultNavValue })
  | (BaseEvidenceSource & { sourceId: "chainlink-feed"; value: ChainlinkFeedValue })
  | (BaseEvidenceSource & { sourceId: "curve-quote"; value: CurveQuoteValue })
  | (BaseEvidenceSource & { sourceId: "sequencer-uptime"; value: SequencerUptimeValue })
  | (BaseEvidenceSource & { sourceId: "harvest-event"; value: HarvestEventValue })
  | (BaseEvidenceSource & {
      sourceId: "external-protocol-fingerprint";
      value: ExternalProtocolFingerprintValue;
    });

// StateBit per §A5 line 639 + §A reconciliation table (uint16 layout).
// KNOWN_STATE_MASK = (1 << 11) - 1; unknown high bits fail closed per G15.

export enum StateBit {
  AUDIT_GATE_CLOSED = 1 << 0,
  CONFIG_INTEGRITY_FAILURE = 1 << 1,
  PAUSE_OPEN_INCREASE = 1 << 2,
  ORACLE_DEGRADED = 1 << 3,
  CURVE_LIQUIDITY_INSUFFICIENT = 1 << 4,
  FLASH_LIQUIDITY_UNAVAILABLE = 1 << 5,
  MORPHO_OWNER_EVIDENCE_MISSING = 1 << 6,
  SEQUENCER_DOWN_OR_GRACE = 1 << 7,
  INCIDENT_INVESTIGATING = 1 << 8,
  INCIDENT_MITIGATING = 1 << 9,
  VAULT_EVIDENCE_MISSING = 1 << 10,
}

export const KNOWN_STATE_MASK = (1 << 11) - 1; // 0x07FF

// On-chain struct: actionId, evidenceSetId, owner, market, blockNumber,
// stateBitmap, sources. evidenceBundleHash is NOT a struct field — it's the
// derived value returned alongside for parity. See deriveEvidenceBundleHash.

export interface ActionEvidence {
  actionId: Bytes32;
  evidenceSetId: Bytes32;
  owner: Address;
  market: MarketId;
  blockNumber: BlockNumber;
  stateBitmap: StateBitmap;
  sources: readonly EvidenceSource[];
  /** Derived from keccak256(abi.encode(EVIDENCE_BUNDLE_TYPEHASH, ...)).
   * Returned by builders for parity audit; NOT part of the on-chain struct shape.
   * See sdk/src/evidence/encoder.ts for the derivation. */
  evidenceBundleHash: Bytes32;
}
