// Typed HTTP wrapper around the PR-10 indexer API.
//
// Source-of-truth for response shapes: indexer/src/state/repositories.ts.
// The indexer serializes bigints as strings (see indexer/src/api/server.ts).
// This client converts back to bigint at the type boundary so SDK callers
// receive properly-typed values.

import type { Address, BlockNumber, Hex, MarketId, PolicyId } from "../types/branded.js";
import { asBlockNumber, asPolicyId } from "../types/branded.js";

export interface IndexerHealthResponse {
  status: "ok";
  chainId: number;
  head: { lastIndexedBlock: BlockNumber; lastIndexedBlockHash: Hex } | null;
}

/** Action step record per PR-10 ActionStepRecord. */
export interface IndexerActionStep {
  blockNumber: BlockNumber;
  blockHash: Hex;
  logIndex: number;
  transactionHash: Hex;
  owner: Address;
  primaryType: number;
  actionId: Hex;
  digest: Hex;
  stepKind: number;
  stepIndex: number;
  payloadJson: string;
}

export interface IndexerActionsResponse {
  actionId: Hex;
  steps: IndexerActionStep[];
}

/** Policy row per PR-10 PolicyRecord. Note: indexer does NOT track `market`
 * per policy (PR-10 schema scope). SDK callers filtering by market must
 * resolve via ActionStep history or supply at sign time. */
export interface IndexerPolicyRow {
  owner: Address;
  policyId: PolicyId;
  primaryType: number;
  policyHash: Hex;
  policyClass: number;
  createdBlock: BlockNumber;
  expiryBlock: BlockNumber;
  state: "active" | "revoking" | "revoked";
  revokeInitiatedBlock?: BlockNumber;
  revokeFinalizedBlock?: BlockNumber;
}

export interface IndexerRegistryCommit {
  registryVersion: bigint;
  merkleRoot: Hex;
  committer: Address;
  opCount: number;
  blockNumber: BlockNumber;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

/** Anchor snapshot per PR-10 AnchorSnapshotRecord. The `anchorBlock` field
 * is the block being anchored; `blockNumber` is the L1 inclusion block. */
export interface IndexerSnapshot {
  anchorBlock: BlockNumber;
  manifestHash: Hex;
  submitter: Address;
  blockNumber: BlockNumber;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

export type IndexerRoleKind =
  | "indexerSigner"
  | "anchorSubmitter"
  | "governance"
  | "registryEmergencyGuardian"
  | "guardianRole";

export interface IndexerRoleRotation {
  roleKind: IndexerRoleKind;
  previous: Address;
  next: Address;
  effectiveBlock: BlockNumber;
  blockNumber: BlockNumber;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
}

export interface IndexerClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** PR-14: registered indexer signing key (typically read from
   * `registry.indexerSigningKey()` at app start). When set, every GET
   * response is verified against the X-Indexer-Signature header. */
  signingKey?: Address;
  /** Caller-supplied signature verifier so the SDK doesn't pin a specific
   * crypto scheme. Recovers the signing address from `message` + `signature`.
   * Typical implementation:
   *   `({ message, signature }) => viem.recoverMessageAddress({ message, signature })`
   */
  verifier?: (opts: { message: string; signature: Hex }) => Promise<Address>;
}

function parseBigInt(v: unknown, field: string): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "string") {
    if (v === "" || /[^0-9-]/.test(v.replace(/^-/, ""))) {
      throw new Error(`indexer returned non-numeric string for ${field}: ${v}`);
    }
    try {
      return BigInt(v);
    } catch {
      throw new Error(`indexer returned unparseable bigint for ${field}: ${v}`);
    }
  }
  if (typeof v === "number" && Number.isInteger(v)) {
    return BigInt(v);
  }
  throw new Error(`indexer returned ${typeof v} for ${field}: ${String(v)}`);
}

function brandBlockNumber(v: unknown, field: string): BlockNumber {
  return asBlockNumber(parseBigInt(v, field));
}

function brandPolicyId(v: unknown, field: string): PolicyId {
  return asPolicyId(parseBigInt(v, field));
}

function requireArray<T>(v: unknown, field: string): T[] {
  if (!Array.isArray(v)) {
    throw new IndexerHttpError(
      200,
      JSON.stringify(v ?? null),
      `indexer ${field}: expected array, got ${typeof v}`,
    );
  }
  return v as T[];
}

export class IndexerHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "IndexerHttpError";
  }
}

export class IndexerClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  /**
   * PR-14: optional registered indexer signing key. When set, every GET
   * response is verified against the `X-Indexer-Signature` header so an
   * attacker cannot serve up forged JSON even if they win a network MITM
   * or compromise the indexer host. Without the header (or with a wrong
   * signature) the SDK throws `IndexerSignatureMissing` / `IndexerSignatureMismatch`.
   */
  private readonly signingKey: Address | undefined;
  private readonly verifier:
    | ((opts: { message: string; signature: Hex }) => Promise<Address>)
    | undefined;

  constructor(opts: IndexerClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetcher = opts.fetch ?? fetch;
    this.signingKey = opts.signingKey;
    this.verifier = opts.verifier;
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetcher(url, { method: "GET" });
    const text = await res.text();
    if (!res.ok) {
      throw new IndexerHttpError(res.status, text, `indexer ${path} → ${res.status}`);
    }
    // PR-14 audit residual + compliance H-1 closure: verify the
    // X-Indexer-Signature header against the registry-pinned signing key.
    //
    // The signed message format is `WSTDIEM_INDEXER_V1\n${path}\n${text}` so
    // an attacker cannot replay a valid /snapshots/latest body as the
    // response to /actions?actionId=0xdeadbeef. The path is part of the
    // signed envelope.
    //
    // Skipped when no key configured (backwards compat). When configured but
    // the header is missing / wrong / verifier absent, the SDK refuses the
    // data. Signing-key value is intentionally NOT included in error
    // messages (adversarial M-7: avoid leaking the key value to log
    // aggregators when the SDK is misconfigured).
    if (this.signingKey) {
      if (!this.verifier) {
        throw new IndexerHttpError(
          res.status,
          text,
          `indexer signingKey configured but no verifier supplied to IndexerClient`,
        );
      }
      const sigHeader = res.headers.get("x-indexer-signature");
      if (!sigHeader) {
        throw new IndexerHttpError(
          res.status,
          text,
          `indexer ${path} response missing X-Indexer-Signature header`,
        );
      }
      try {
        const canonicalMessage = `WSTDIEM_INDEXER_V1\n${path}\n${text}`;
        const recovered = await this.verifier({
          message: canonicalMessage,
          signature: sigHeader as Hex,
        });
        if (recovered.toLowerCase() !== this.signingKey.toLowerCase()) {
          throw new IndexerHttpError(
            res.status,
            text,
            `indexer ${path} signature recovered=${recovered} does not match expected signer`,
          );
        }
      } catch (err) {
        if (err instanceof IndexerHttpError) throw err;
        throw new IndexerHttpError(
          res.status,
          text,
          `indexer ${path} signature verification error`,
        );
      }
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new IndexerHttpError(res.status, text, `indexer ${path} returned non-JSON`);
    }
  }

  async health(): Promise<IndexerHealthResponse> {
    const raw = await this.get<{
      status?: string;
      chainId?: number;
      head?: { lastIndexedBlock: string; lastIndexedBlockHash: Hex } | null;
    }>("/health");
    if (raw.status !== "ok") {
      throw new IndexerHttpError(200, JSON.stringify(raw), `indexer /health status=${raw.status}`);
    }
    if (typeof raw.chainId !== "number") {
      throw new IndexerHttpError(200, JSON.stringify(raw), `indexer /health missing chainId`);
    }
    return {
      status: "ok",
      chainId: raw.chainId,
      head: raw.head
        ? {
            lastIndexedBlock: brandBlockNumber(raw.head.lastIndexedBlock, "health.head.lastIndexedBlock"),
            lastIndexedBlockHash: raw.head.lastIndexedBlockHash,
          }
        : null,
    };
  }

  async actions(actionId: Hex): Promise<IndexerActionsResponse> {
    const raw = await this.get<{
      actionId: Hex;
      steps?: Array<{
        blockNumber: string;
        blockHash: Hex;
        logIndex: number | string;
        transactionHash: Hex;
        owner: Address;
        primaryType: number | string;
        actionId: Hex;
        digest: Hex;
        stepKind: number | string;
        stepIndex: number | string;
        payloadJson: string;
      }>;
    }>(`/actions?actionId=${encodeURIComponent(actionId)}`);
    const stepsArr = requireArray<NonNullable<typeof raw.steps>[number]>(raw.steps ?? [], "/actions.steps");
    return {
      actionId: raw.actionId,
      steps: stepsArr.map((s) => ({
        blockNumber: brandBlockNumber(s.blockNumber, "actionStep.blockNumber"),
        blockHash: s.blockHash,
        logIndex: Number(s.logIndex),
        transactionHash: s.transactionHash,
        owner: s.owner,
        primaryType: Number(s.primaryType),
        actionId: s.actionId,
        digest: s.digest,
        stepKind: Number(s.stepKind),
        stepIndex: Number(s.stepIndex),
        payloadJson: s.payloadJson,
      })),
    };
  }

  async policies(): Promise<IndexerPolicyRow[]> {
    const raw = await this.get<{
      policies?: Array<{
        owner: Address;
        policyId: string;
        primaryType: number | string;
        policyHash: Hex;
        policyClass: number | string;
        createdBlock: string;
        expiryBlock: string;
        state: "active" | "revoking" | "revoked";
        revokeInitiatedBlock?: string | null;
        revokeFinalizedBlock?: string | null;
      }>;
    }>("/policies");
    const arr = requireArray<NonNullable<typeof raw.policies>[number]>(raw.policies, "/policies.policies");
    return arr.map((p) => ({
      owner: p.owner,
      policyId: brandPolicyId(p.policyId, "policy.policyId"),
      primaryType: Number(p.primaryType),
      policyHash: p.policyHash,
      policyClass: Number(p.policyClass),
      createdBlock: brandBlockNumber(p.createdBlock, "policy.createdBlock"),
      expiryBlock: brandBlockNumber(p.expiryBlock, "policy.expiryBlock"),
      state: p.state,
      ...(p.revokeInitiatedBlock !== undefined && p.revokeInitiatedBlock !== null
        ? { revokeInitiatedBlock: brandBlockNumber(p.revokeInitiatedBlock, "policy.revokeInitiatedBlock") }
        : {}),
      ...(p.revokeFinalizedBlock !== undefined && p.revokeFinalizedBlock !== null
        ? { revokeFinalizedBlock: brandBlockNumber(p.revokeFinalizedBlock, "policy.revokeFinalizedBlock") }
        : {}),
    }));
  }

  async registryLatest(): Promise<IndexerRegistryCommit | null> {
    const raw = await this.get<{
      latest:
        | null
        | {
            registryVersion: string;
            merkleRoot: Hex;
            committer: Address;
            opCount: number | string;
            blockNumber: string;
            blockHash: Hex;
            transactionHash: Hex;
            logIndex: number | string;
          };
    }>("/registry/latest");
    if (!raw.latest) return null;
    return this.parseRegistryCommit(raw.latest);
  }

  async registryCommits(limit?: number): Promise<IndexerRegistryCommit[]> {
    const q = limit !== undefined ? `?limit=${limit}` : "";
    const raw = await this.get<{
      commits?: Array<{
        registryVersion: string;
        merkleRoot: Hex;
        committer: Address;
        opCount: number | string;
        blockNumber: string;
        blockHash: Hex;
        transactionHash: Hex;
        logIndex: number | string;
      }>;
    }>(`/registry/commits${q}`);
    const arr = requireArray<NonNullable<typeof raw.commits>[number]>(raw.commits, "/registry/commits.commits");
    return arr.map((c) => this.parseRegistryCommit(c));
  }

  private parseRegistryCommit(c: {
    registryVersion: string;
    merkleRoot: Hex;
    committer: Address;
    opCount: number | string;
    blockNumber: string;
    blockHash: Hex;
    transactionHash: Hex;
    logIndex: number | string;
  }): IndexerRegistryCommit {
    return {
      registryVersion: parseBigInt(c.registryVersion, "registryCommit.registryVersion"),
      merkleRoot: c.merkleRoot,
      committer: c.committer,
      opCount: Number(c.opCount),
      blockNumber: brandBlockNumber(c.blockNumber, "registryCommit.blockNumber"),
      blockHash: c.blockHash,
      transactionHash: c.transactionHash,
      logIndex: Number(c.logIndex),
    };
  }

  async snapshotsLatest(): Promise<IndexerSnapshot | null> {
    const raw = await this.get<{ latest: null | RawSnapshot }>("/snapshots/latest");
    if (!raw.latest) return null;
    return this.parseSnapshot(raw.latest);
  }

  async snapshots(limit?: number): Promise<IndexerSnapshot[]> {
    const q = limit !== undefined ? `?limit=${limit}` : "";
    const raw = await this.get<{ snapshots?: RawSnapshot[] }>(`/snapshots${q}`);
    const arr = requireArray<RawSnapshot>(raw.snapshots, "/snapshots.snapshots");
    return arr.map((s) => this.parseSnapshot(s));
  }

  private parseSnapshot(s: RawSnapshot): IndexerSnapshot {
    return {
      anchorBlock: brandBlockNumber(s.anchorBlock, "snapshot.anchorBlock"),
      manifestHash: s.manifestHash,
      submitter: s.submitter,
      blockNumber: brandBlockNumber(s.blockNumber, "snapshot.blockNumber"),
      blockHash: s.blockHash,
      transactionHash: s.transactionHash,
      logIndex: Number(s.logIndex),
    };
  }

  async roleRotations(opts?: { kind?: IndexerRoleKind; limit?: number }): Promise<IndexerRoleRotation[]> {
    const params = new URLSearchParams();
    if (opts?.kind) params.set("kind", opts.kind);
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    const q = params.toString();
    const raw = await this.get<{ rotations?: RawRoleRotation[] }>(
      `/roles/rotations${q ? `?${q}` : ""}`,
    );
    const arr = requireArray<RawRoleRotation>(raw.rotations, "/roles/rotations.rotations");
    return arr.map((r) => ({
      roleKind: r.roleKind,
      previous: r.previous,
      next: r.next,
      effectiveBlock: brandBlockNumber(r.effectiveBlock, "roleRotation.effectiveBlock"),
      blockNumber: brandBlockNumber(r.blockNumber, "roleRotation.blockNumber"),
      blockHash: r.blockHash,
      transactionHash: r.transactionHash,
      logIndex: Number(r.logIndex),
    }));
  }
}

interface RawSnapshot {
  anchorBlock: string;
  manifestHash: Hex;
  submitter: Address;
  blockNumber: string;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number | string;
}

interface RawRoleRotation {
  roleKind: IndexerRoleKind;
  previous: Address;
  next: Address;
  effectiveBlock: string;
  blockNumber: string;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number | string;
}
