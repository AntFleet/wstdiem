import { request } from "undici";
import type { Hex } from "viem";

export interface IndexerHead {
  lastIndexedBlock: bigint;
  lastIndexedBlockHash: Hex;
}

export interface RegistryCommitSummary {
  registryVersion: bigint;
  merkleRoot: Hex;
}

export interface SnapshotSummary {
  anchorBlock: bigint;
  manifestHash: Hex;
  submitter: Hex;
}

export interface IndexerSnapshot {
  head: IndexerHead;
  registry: RegistryCommitSummary | null;
  latestSnapshot: SnapshotSummary | null;
}

export class IndexerClient {
  constructor(private readonly baseUrl: string) {}

  async fetchSnapshot(): Promise<IndexerSnapshot> {
    const [healthRes, registryRes, snapshotRes] = await Promise.all([
      this.get<{ head?: unknown }>("/health"),
      this.get<{ latest?: unknown }>("/registry/latest"),
      this.get<{ latest?: unknown }>("/snapshots/latest"),
    ]);
    const head = parseHead(healthRes.head);
    const registry = parseRegistry(registryRes.latest ?? null);
    const latestSnapshot = parseSnapshot(snapshotRes.latest ?? null);
    return { head, registry, latestSnapshot };
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await request(url, { method: "GET" });
    if (res.statusCode >= 400) {
      throw new Error(`Indexer ${path} returned ${res.statusCode}`);
    }
    const body = (await res.body.json()) as unknown;
    return body as T;
  }
}

interface RawHead {
  lastIndexedBlock: string;
  lastIndexedBlockHash: Hex;
}

function parseHead(raw: unknown): IndexerHead {
  if (!raw || typeof raw !== "object") {
    throw new Error("Indexer /health head missing");
  }
  const r = raw as RawHead;
  return {
    lastIndexedBlock: BigInt(r.lastIndexedBlock),
    lastIndexedBlockHash: r.lastIndexedBlockHash,
  };
}

function parseRegistry(raw: unknown): RegistryCommitSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { registryVersion?: string; merkleRoot?: Hex };
  if (!r.registryVersion || !r.merkleRoot) return null;
  return {
    registryVersion: BigInt(r.registryVersion),
    merkleRoot: r.merkleRoot,
  };
}

function parseSnapshot(raw: unknown): SnapshotSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { anchorBlock?: string; manifestHash?: Hex; submitter?: Hex };
  if (!r.anchorBlock || !r.manifestHash || !r.submitter) return null;
  return {
    anchorBlock: BigInt(r.anchorBlock),
    manifestHash: r.manifestHash,
    submitter: r.submitter,
  };
}
