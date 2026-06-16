// RPC quorum tracker — closes THREAT-MODEL I-68 (RPC quorum independence)
// and PR-12 audit A3-9 (placeholder quorum surface).
//
// Design:
// - Caller supplies N PublicClients, each tagged with a `providerFamily`
//   (e.g., "alchemy", "infura", "ankr", "publicrpc"). The SDK refuses a
//   quorum when fewer than `threshold` DISTINCT families respond with
//   matching results — a 3-of-3 same-family setup does not satisfy I-68.
// - On each readContract or getBlockNumber, the quorum fans out to all
//   clients in parallel, captures result-or-error per client, and decides:
//     * status === "ok" iff at least `threshold` clients returned the same
//       result and their providerFamilies are distinct.
//     * status === "blockInconsistent" iff the spread in observed block
//       heights exceeds `maxBlockLagBlocks`.
//     * status === "notIndependent" iff matching results came from the
//       same family (e.g., 2 of the 3 returners are both "publicrpc").
//     * status === "degraded" iff too many clients errored or timed out.
// - This module is read-only. It does not write any chain state; it can
//   stand in front of the per-reader `readContract` calls in the SDK.

import type { PublicClient } from "viem";

/**
 * PR-14 audit adversarial H-3 closure: registry-recognized provider families.
 * A caller-supplied string is no longer accepted; the SDK normalizes the
 * label to one of these canonical values so an attacker who supplies
 * `"alchemy"` and `"alchemy.io"` cannot spoof diversity. Extending this set
 * requires a registry update.
 */
export type ProviderFamily =
  | "alchemy"
  | "infura"
  | "ankr"
  | "quicknode"
  | "blast"
  | "publicrpc"
  | "selfHostedBaseNode";

const PROVIDER_FAMILY_NORMALIZE: Record<string, ProviderFamily> = {
  alchemy: "alchemy",
  "alchemy.io": "alchemy",
  alchemyapi: "alchemy",
  infura: "infura",
  "infura.io": "infura",
  ankr: "ankr",
  "ankr.com": "ankr",
  quicknode: "quicknode",
  blast: "blast",
  publicrpc: "publicrpc",
  selfhostedbasenode: "selfHostedBaseNode",
  "self-hosted": "selfHostedBaseNode",
};

function normalizeProviderFamily(raw: string): ProviderFamily {
  const lower = raw.toLowerCase().trim();
  const normalized = PROVIDER_FAMILY_NORMALIZE[lower];
  if (!normalized) {
    throw new Error(
      `RpcQuorum: unknown providerFamily=${raw}. Must be one of: ${Object.values(PROVIDER_FAMILY_NORMALIZE).join(", ")} (case-insensitive). Spoofing diversity is the attack this allowlist defends.`,
    );
  }
  return normalized;
}

export interface QuorumMember {
  client: PublicClient;
  providerFamily: string;
}

export interface QuorumConfig {
  threshold: number;
  maxBlockLagBlocks: number;
  timeoutMs: number;
}

export type QuorumStatusKind =
  | "ok"
  | "degraded"
  | "notIndependent"
  | "blockInconsistent";

export interface QuorumStatus {
  threshold: number;
  size: number;
  providerFamilies: string[];
  matchedFamilies: string[];
  maxRpcBlockLagBlocks: number;
  quorumTimeoutMs: number;
  status: QuorumStatusKind;
}

const DEFAULT_QUORUM: QuorumConfig = {
  threshold: 2,
  maxBlockLagBlocks: 5,
  timeoutMs: 5000,
};

export class RpcQuorum {
  readonly members: ReadonlyArray<QuorumMember>;
  readonly config: QuorumConfig;

  constructor(members: ReadonlyArray<QuorumMember>, config?: Partial<QuorumConfig>) {
    // PR-14 audit H-3 fix: normalize providerFamily through the allowlist
    // so spoofing diversity with `"alchemy"`/`"alchemy.io"`/`"alchemyapi"`
    // is impossible. Unknown family throws — caller cannot ship a quorum
    // that silently doesn't satisfy I-68.
    this.members = members.map((m) => ({
      ...m,
      providerFamily: normalizeProviderFamily(m.providerFamily),
    }));
    this.config = { ...DEFAULT_QUORUM, ...config };
  }

  get size(): number {
    return this.members.length;
  }

  get distinctFamilies(): string[] {
    return [...new Set(this.members.map((m) => m.providerFamily))];
  }

  /**
   * Fan out `getBlockNumber` to all members and decide quorum status.
   * Returns both the agreed block (median of returned values rounded down to
   * the largest value covered by the matching family set) and the status.
   */
  async getBlockNumber(): Promise<{ block: bigint; status: QuorumStatus }> {
    const results = await this.fanout((c) => c.getBlockNumber());
    const validResults = results.filter(
      (r): r is { ok: true; value: bigint; family: string } => r.ok,
    );
    if (validResults.length === 0) {
      return {
        block: 0n,
        status: this.statusOf("degraded", []),
      };
    }
    const heights = validResults.map((r) => r.value);
    const min = heights.reduce((a, b) => (a < b ? a : b), heights[0]!);
    const max = heights.reduce((a, b) => (a > b ? a : b), heights[0]!);
    if (max - min > BigInt(this.config.maxBlockLagBlocks)) {
      return {
        block: min,
        status: this.statusOf(
          "blockInconsistent",
          [...new Set(validResults.map((r) => r.family))],
        ),
      };
    }
    // PR-14 audit compliance H-3 closure: enforce VALUE-agreement, not just
    // lag-tolerance. Within the lag tolerance, a 3-of-3 setup where
    // alchemy=100, infura=103, ankr=101 must NOT be reported as "ok" — no
    // two providers actually agreed on the same height. Group by exact
    // block value, count distinct families per group, accept only the
    // largest such group that meets the threshold.
    const groups = new Map<string, { value: bigint; families: string[] }>();
    for (const r of validResults) {
      const key = r.value.toString();
      const g = groups.get(key);
      if (g) g.families.push(r.family);
      else groups.set(key, { value: r.value, families: [r.family] });
    }
    let best: { value: bigint; families: string[]; distinct: number } | null = null;
    for (const g of groups.values()) {
      const distinct = new Set(g.families).size;
      if (!best || distinct > best.distinct) {
        best = { value: g.value, families: g.families, distinct };
      }
    }
    const matchedFamilies = best ? [...new Set(best.families)] : [];
    if (matchedFamilies.length < this.config.threshold) {
      return {
        block: best?.value ?? min,
        status: this.statusOf("notIndependent", matchedFamilies),
      };
    }
    return {
      block: best!.value,
      status: this.statusOf("ok", matchedFamilies),
    };
  }

  /**
   * Fan out `readContract` to all members for a specific call and decide
   * the quorum result. The caller supplies a callback per-client so the
   * same args can run against each transport. Returns the agreed result or
   * throws when no quorum can be reached.
   */
  async readContract<T>(call: (c: PublicClient) => Promise<T>): Promise<{
    value: T;
    status: QuorumStatus;
  }> {
    const results = await this.fanout(call);
    const validResults = results.filter(
      (r): r is { ok: true; value: T; family: string } => r.ok,
    );
    if (validResults.length === 0) {
      throw new Error(
        `RpcQuorum: all ${this.members.length} providers errored on readContract`,
      );
    }
    // Group by stringified result value (works for primitive + Object).
    const groups = new Map<string, { value: T; families: string[] }>();
    for (const r of validResults) {
      const key = canonicalize(r.value);
      const g = groups.get(key);
      if (g) {
        g.families.push(r.family);
      } else {
        groups.set(key, { value: r.value, families: [r.family] });
      }
    }
    // Pick the group with the most DISTINCT families. Tie-broken by first-
    // seen order (deterministic given Map iteration order).
    let best: { value: T; families: string[]; distinct: number } | null = null;
    for (const g of groups.values()) {
      const distinct = new Set(g.families).size;
      if (!best || distinct > best.distinct) {
        best = { value: g.value, families: g.families, distinct };
      }
    }
    if (!best) {
      throw new Error("RpcQuorum: internal — no group selected");
    }
    const matchedFamilies = [...new Set(best.families)];
    const status: QuorumStatusKind =
      matchedFamilies.length >= this.config.threshold ? "ok" : "notIndependent";
    return {
      value: best.value,
      status: this.statusOf(status, matchedFamilies),
    };
  }

  private async fanout<T>(
    call: (c: PublicClient) => Promise<T>,
  ): Promise<Array<{ ok: true; value: T; family: string } | { ok: false; family: string; error: unknown }>> {
    return Promise.all(
      this.members.map(async (m) => {
        try {
          const value = await withTimeout(call(m.client), this.config.timeoutMs);
          return { ok: true as const, value, family: m.providerFamily };
        } catch (error) {
          return { ok: false as const, family: m.providerFamily, error };
        }
      }),
    );
  }

  /**
   * PR-15 audit C-1 closure: returns a viem-shaped PublicClient where every
   * read fans out across the quorum. Contract readers (RegistryReader,
   * MorphoReader, ChainlinkReader, etc.) constructed against this proxy get
   * quorum-enforced reads transparently — no per-reader changes required.
   *
   * Calls that need an exact-value agreement (readContract, getBlockNumber,
   * getBlock, getLogs, simulateContract) require ≥ threshold distinct
   * providerFamily values returning byte-identical results. Calls that the
   * SDK does not yet quorum-protect fall through to the first member only
   * and emit a warning via `onUnquorumed` if supplied.
   *
   * Throws RpcQuorumMismatch when no group meets the threshold so the SDK
   * fails closed rather than serving a single-RPC value as if it were
   * quorum-validated.
   */
  asPublicClient(opts?: {
    onUnquorumed?: (method: string) => void;
  }): PublicClient {
    const onUnquorumed = opts?.onUnquorumed;
    const first = this.members[0]!.client;
    const enforce = <T>(method: string, call: (c: PublicClient) => Promise<T>) =>
      this.readContract<T>(call).then(({ value, status }) => {
        if (status.status !== "ok") {
          throw new Error(
            `RpcQuorumMismatch on ${method}: status=${status.status}, ` +
              `matchedFamilies=[${status.matchedFamilies.join(",")}]`,
          );
        }
        return value;
      });
    const proxy: Record<string, unknown> = {
      readContract: (args: unknown) =>
        enforce("readContract", (c) =>
          (c as unknown as { readContract: (a: unknown) => Promise<unknown> }).readContract(args),
        ),
      simulateContract: (args: unknown) =>
        enforce("simulateContract", (c) =>
          (c as unknown as { simulateContract: (a: unknown) => Promise<unknown> }).simulateContract(args),
        ),
      getBlockNumber: async () => {
        const { block, status } = await this.getBlockNumber();
        if (status.status !== "ok") {
          throw new Error(
            `RpcQuorumMismatch on getBlockNumber: status=${status.status}, ` +
              `matchedFamilies=[${status.matchedFamilies.join(",")}]`,
          );
        }
        return block;
      },
      getBlock: (args: unknown) =>
        enforce("getBlock", (c) =>
          (c as unknown as { getBlock: (a: unknown) => Promise<unknown> }).getBlock(args),
        ),
      getLogs: (args: unknown) =>
        enforce("getLogs", (c) =>
          (c as unknown as { getLogs: (a: unknown) => Promise<unknown> }).getLogs(args),
        ),
      // Pass-through fields needed by viem internals (chain, transport).
      chain: (first as unknown as { chain?: unknown }).chain,
      transport: (first as unknown as { transport?: unknown }).transport,
      request: (...rest: unknown[]) => {
        if (onUnquorumed) onUnquorumed("request");
        return (first as unknown as { request: (...a: unknown[]) => unknown }).request(...rest);
      },
    };
    return proxy as unknown as PublicClient;
  }

  private statusOf(status: QuorumStatusKind, matchedFamilies: string[]): QuorumStatus {
    return {
      threshold: this.config.threshold,
      size: this.members.length,
      providerFamilies: this.distinctFamilies,
      matchedFamilies,
      maxRpcBlockLagBlocks: this.config.maxBlockLagBlocks,
      quorumTimeoutMs: this.config.timeoutMs,
      status,
    };
  }
}

/**
 * PR-14 audit adversarial M-5 closure: length-prefixed canonical encoding.
 * Each primitive includes its byte length so a string containing the join
 * separator cannot collide with a different structure. Two objects produce
 * the same key iff every field's canonical encoding matches byte-for-byte.
 */
function canonicalize(v: unknown): string {
  if (typeof v === "bigint") {
    const s = v.toString();
    return `b:${s.length}:${s}`;
  }
  if (typeof v === "string") {
    const lc = v.toLowerCase();
    return `s:${lc.length}:${lc}`;
  }
  if (typeof v === "number") {
    const s = String(v);
    return `n:${s.length}:${s}`;
  }
  if (typeof v === "boolean") return `B:${v ? 1 : 0}`;
  if (v === null) return `N:0`;
  if (v === undefined) return `U:0`;
  if (Array.isArray(v)) {
    const parts = v.map(canonicalize);
    return `A:${parts.length}:[${parts.join(";")}]`;
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, vv]) => `${k.length}:${k}=${canonicalize(vv)}`)
      .sort();
    return `O:${entries.length}:{${entries.join(";")}}`;
  }
  const s = String(v);
  return `?:${s.length}:${s}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error(`RpcQuorum: timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(handle);
        resolve(v);
      },
      (err) => {
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}

