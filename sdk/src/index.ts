// @wstdiem/sdk — v0.1.0-rc1 entrypoint. Isomorphic (browser + Node 20+).
//
// Surface (per the SDK type definitions):
//   - Branded ID types, Action union, EvidenceSource discriminated union
//   - EIP-712 typehash constants + domain separator + per-action digest builder
//   - ActionEvidence canonical-set encoder (I-70) + EVIDENCE_BUNDLE_TYPEHASH derivation
//   - I-66 EIP-1271 preimage attestation builder
//   - G-PM-1..G-PM-6 post-matrix gate evaluators
//   - FailClosedErrorName registry with bytes4 selector decoding
//   - ExternalProtocolFingerprint + AnchorFreshness classifiers
//   - Live WstdiemSdk implementation (PR-12): viem PublicClient + indexer HTTP
//   - WstdiemSdk interface (full §A5 surface)

export * from "./types/index.js";
export * from "./errors/index.js";
export * from "./eip712/index.js";
export * from "./evidence/index.js";
export * from "./preimage/index.js";
export * from "./gates/index.js";
export * from "./anchor/index.js";
export * from "./external/index.js";
export type { WstdiemSdk } from "./sdk.js";
export * from "./live/index.js";
