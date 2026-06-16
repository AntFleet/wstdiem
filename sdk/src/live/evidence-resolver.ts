// Evidence resolver — caller-supplied hook to fetch real EvidenceSource
// entries the SDK binds into the action digest + calldata. PR-14 audit M-4
// closure for the residual indexer-trust + empty-bundle hole.
//
// The SDK does not own the data side: it would need its own indexer query
// path or direct on-chain reads of every canonical source. PR-14 leaves
// that integration to the consumer (typically the React-hooks layer in
// PR-15+) but pins the contract surface so the SDK can validate the
// caller-supplied evidence against the registry's required set and
// fail-closed when no resolver is supplied for an action that needs one.

import type { ActionEvidence, EvidenceSource } from "../types/evidence.js";
import type { PrimaryType } from "../types/enums.js";
import type { Address, BlockNumber, MarketId } from "../types/branded.js";

export interface EvidenceResolverInput {
  primaryType: PrimaryType;
  market: MarketId;
  owner: Address;
  blockNumber: BlockNumber;
  /**
   * Required source-id hashes from `registry.requiredEvidenceSourceSet`.
   * The resolver MUST return at least one EvidenceSource for each id;
   * extra entries are ignored.
   */
  requiredSourceIds: ReadonlyArray<`0x${string}`>;
}

export interface EvidenceResolverOutput {
  /** Caller-supplied EvidenceSource entries. The SDK sorts + validates
   * + hashes them per I-70 before binding into the digest. */
  sources: ReadonlyArray<EvidenceSource>;
  /** Optional pre-existing actionId / evidenceSetId. When omitted the SDK
   * derives a fresh actionId from the action + block. */
  actionId?: `0x${string}`;
  evidenceSetId?: `0x${string}`;
  /** Optional state bitmap to bind. Defaults to 0. */
  stateBitmap?: number;
}

export type EvidenceResolver = (
  input: EvidenceResolverInput,
) => Promise<EvidenceResolverOutput>;

/**
 * Convenience for the common case: build an EvidenceResolverOutput from a
 * known-good list of sources with no override fields. The SDK will derive
 * the actionId from the action envelope.
 */
export function evidenceFromSources(
  sources: ReadonlyArray<EvidenceSource>,
): EvidenceResolverOutput {
  return { sources };
}

/** Sentinel to verify a returned bundle satisfies a required-source-id set. */
export function assertCoversRequiredSet(
  sources: ReadonlyArray<EvidenceSource>,
  requiredSourceIds: ReadonlyArray<`0x${string}`>,
): void {
  const provided = new Set(
    sources.map((s) => (s as { sourceIdHash?: `0x${string}` }).sourceIdHash ?? "0x0"),
  );
  const missing = requiredSourceIds.filter((id) => !provided.has(id));
  if (missing.length > 0) {
    throw new Error(
      `EvidenceResolver returned a bundle missing required source ids: ${missing.join(",")}`,
    );
  }
}

// Re-export from a single point so the config import works cleanly.
export type { ActionEvidence };
