// I-70 evidence canonical-set encoder per the SDK type definitions §A2.
//
// Rules:
//   1. Sort by (sourceIdHash, sourceAddress) strictly ascending.
//   2. Unique — no two entries share the same (sourceIdHash, sourceAddress).
//   3. Exact set per action class per §A2 (caller supplies the expected set).
//   4. Address-bound — sourceAddress must match registry canonical for the id.
//   5. evidenceBundleHash = keccak256(abi.encode(EVIDENCE_BUNDLE_TYPEHASH,
//      actionId, evidenceSetId, owner, market, blockNumber, stateBitmap,
//      keccak256(abi.encode(sources)))).

import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import type { Address, BlockNumber, Bytes32, Hex, MarketId, StateBitmap } from "../types/branded.js";
import { SOURCE_ID_HASHES } from "../types/evidence.js";
import type {
  EvidenceSource,
  EvidenceSourceId,
  ActionEvidence,
} from "../types/evidence.js";
import { SOURCE_STATUS_U8 } from "../types/enums.js";
import { EVIDENCE_BUNDLE_TYPEHASH } from "../eip712/typehashes.js";

const EVIDENCE_SOURCES_PARAMS = parseAbiParameters(
  "(bytes32 sourceId,address sourceAddress,uint8 status,uint256 lastUpdateBlock,bytes32 valueHash)[]",
);

const EVIDENCE_BUNDLE_PARAMS = parseAbiParameters(
  "bytes32, bytes32, bytes32, address, bytes32, uint256, uint16, bytes32",
);

export interface EvidenceValidationError {
  kind:
    | "EvidenceUnsorted"
    | "EvidenceSourceUnexpected"
    | "EvidenceSourceMissing"
    | "EvidenceSourceAddressMismatch"
    | "DuplicateSource";
  index?: number;
  detail: string;
}

export class EvidenceSetError extends Error {
  readonly errors: EvidenceValidationError[];
  constructor(errors: EvidenceValidationError[]) {
    super(`evidence set invalid: ${errors.map((e) => e.kind).join(", ")}`);
    this.errors = errors;
    this.name = "EvidenceSetError";
  }
}

function lcCompareHex(a: Hex, b: Hex): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al < bl) return -1;
  if (al > bl) return 1;
  return 0;
}

function sourceKey(source: EvidenceSource): [Hex, Hex] {
  // sourceIdHash mirrors the bytes32 the contract reads; sourceAddress is the
  // tiebreaker per §A2.
  return [source.sourceIdHash as Hex, source.sourceAddress as Hex];
}

/** Sort sources by (sourceIdHash, sourceAddress) strictly ascending. */
export function sortSources(sources: readonly EvidenceSource[]): EvidenceSource[] {
  return [...sources].sort((a, b) => {
    const [aHash, aAddr] = sourceKey(a);
    const [bHash, bAddr] = sourceKey(b);
    const byId = lcCompareHex(aHash, bHash);
    if (byId !== 0) return byId;
    return lcCompareHex(aAddr, bAddr);
  });
}

/** Throws if `sources` is not strict-ascending by (sourceIdHash, sourceAddress). */
export function assertSourcesSorted(sources: readonly EvidenceSource[]): void {
  for (let i = 1; i < sources.length; i++) {
    const prev = sources[i - 1];
    const curr = sources[i];
    if (!prev || !curr) continue;
    const [pHash, pAddr] = sourceKey(prev);
    const [cHash, cAddr] = sourceKey(curr);
    const byId = lcCompareHex(pHash, cHash);
    const ord = byId !== 0 ? byId : lcCompareHex(pAddr, cAddr);
    if (ord >= 0) {
      throw new EvidenceSetError([
        {
          kind: ord === 0 ? "DuplicateSource" : "EvidenceUnsorted",
          index: i,
          detail: `position ${i} is not strictly greater than ${i - 1}`,
        },
      ]);
    }
  }
}

export interface RequiredSourceSpec {
  sourceId: EvidenceSourceId;
  /** Canonical registry-pinned address for this source. */
  sourceAddress: Address;
}

export interface ExactSetValidationInput {
  sources: readonly EvidenceSource[];
  required: readonly RequiredSourceSpec[];
}

/** Validate that the source set is exactly the required spec, sorted, unique,
 * with address binding. Returns the validated (immutable) source list on
 * success, throws EvidenceSetError on any violation. */
export function validateExactSet(
  input: ExactSetValidationInput,
): readonly EvidenceSource[] {
  const sorted = sortSources(input.sources);
  const errors: EvidenceValidationError[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;
    if (
      prev.sourceIdHash.toLowerCase() === curr.sourceIdHash.toLowerCase() &&
      prev.sourceAddress.toLowerCase() === curr.sourceAddress.toLowerCase()
    ) {
      errors.push({
        kind: "DuplicateSource",
        index: i,
        detail: `duplicate (sourceId=${curr.sourceId}, sourceAddress=${curr.sourceAddress})`,
      });
    }
  }

  const requiredKey = (s: RequiredSourceSpec): string =>
    `${SOURCE_ID_HASHES[s.sourceId].toLowerCase()}|${s.sourceAddress.toLowerCase()}`;
  const providedKey = (s: EvidenceSource): string =>
    `${s.sourceIdHash.toLowerCase()}|${s.sourceAddress.toLowerCase()}`;

  const requiredSet = new Set(input.required.map(requiredKey));
  const providedSet = new Set(sorted.map(providedKey));

  for (const spec of input.required) {
    if (!providedSet.has(requiredKey(spec))) {
      errors.push({
        kind: "EvidenceSourceMissing",
        detail: `required source missing: ${spec.sourceId}@${spec.sourceAddress}`,
      });
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (!s) continue;
    if (!requiredSet.has(providedKey(s))) {
      const idMatchExpected = input.required.find(
        (r) => SOURCE_ID_HASHES[r.sourceId].toLowerCase() === s.sourceIdHash.toLowerCase(),
      );
      if (idMatchExpected) {
        errors.push({
          kind: "EvidenceSourceAddressMismatch",
          index: i,
          detail: `${s.sourceId}: provided=${s.sourceAddress} expected=${idMatchExpected.sourceAddress}`,
        });
      } else {
        errors.push({
          kind: "EvidenceSourceUnexpected",
          index: i,
          detail: `${s.sourceId}@${s.sourceAddress} not in required set`,
        });
      }
    }

    if (s.sourceIdHash.toLowerCase() !== SOURCE_ID_HASHES[s.sourceId].toLowerCase()) {
      errors.push({
        kind: "EvidenceSourceUnexpected",
        index: i,
        detail: `sourceIdHash for ${s.sourceId} disagrees with canonical preimage`,
      });
    }
  }

  if (errors.length > 0) throw new EvidenceSetError(errors);
  return sorted;
}

/** Compute the keccak256(abi.encode(sources)) value the contract uses as the
 * sourcesHash field of the evidence bundle struct. */
export function hashSources(sources: readonly EvidenceSource[]): Hex {
  const tuples = sources.map((s) => ({
    sourceId: s.sourceIdHash,
    sourceAddress: s.sourceAddress,
    status: SOURCE_STATUS_U8[s.status],
    lastUpdateBlock: BigInt(s.lastUpdateBlock),
    valueHash: s.valueHash,
  }));
  return keccak256(encodeAbiParameters(EVIDENCE_SOURCES_PARAMS, [tuples])) as Hex;
}

export interface EvidenceBundleInputs {
  actionId: Bytes32;
  evidenceSetId: Bytes32;
  owner: Address;
  market: MarketId;
  blockNumber: BlockNumber;
  stateBitmap: StateBitmap;
  sources: readonly EvidenceSource[];
}

/** Compute evidenceBundleHash from a (sorted, validated) source set per the
 * canonical encoding rule. Caller is expected to have validated the set; this
 * function does NOT re-sort or re-validate. */
export function deriveEvidenceBundleHash(inputs: EvidenceBundleInputs): Hex {
  const sourcesHash = hashSources(inputs.sources);
  return keccak256(
    encodeAbiParameters(EVIDENCE_BUNDLE_PARAMS, [
      EVIDENCE_BUNDLE_TYPEHASH,
      inputs.actionId,
      inputs.evidenceSetId,
      inputs.owner,
      inputs.market,
      BigInt(inputs.blockNumber),
      Number(inputs.stateBitmap),
      sourcesHash,
    ]),
  );
}

/** Build an ActionEvidence with sorted sources + derived bundleHash. */
export function buildActionEvidence(
  inputs: Omit<ActionEvidence, "evidenceBundleHash">,
): ActionEvidence {
  const sorted = sortSources(inputs.sources);
  const evidenceBundleHash = deriveEvidenceBundleHash({
    actionId: inputs.actionId,
    evidenceSetId: inputs.evidenceSetId,
    owner: inputs.owner,
    market: inputs.market,
    blockNumber: inputs.blockNumber,
    stateBitmap: inputs.stateBitmap,
    sources: sorted,
  }) as Bytes32;
  return { ...inputs, sources: sorted, evidenceBundleHash };
}
