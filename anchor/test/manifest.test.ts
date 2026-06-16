import { describe, it, expect } from "vitest";
import { computeManifestHash, manifestInputFrom } from "../src/manifest/computer.js";

describe("computeManifestHash", () => {
  it("returns deterministic hash for identical inputs", () => {
    const input = {
      chainId: 8453,
      indexedBlockNumber: 47_000_000n,
      indexedBlockHash: "0xa".padEnd(66, "b") as `0x${string}`,
      registryVersion: 1n,
      registryMerkleRoot: "0xc".padEnd(66, "d") as `0x${string}`,
    };
    const a = computeManifestHash(input);
    const b = computeManifestHash(input);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it("changes when any single field changes", () => {
    const base = {
      chainId: 8453,
      indexedBlockNumber: 47_000_000n,
      indexedBlockHash: "0xa".padEnd(66, "b") as `0x${string}`,
      registryVersion: 1n,
      registryMerkleRoot: "0xc".padEnd(66, "d") as `0x${string}`,
    };
    const baseline = computeManifestHash(base);
    expect(computeManifestHash({ ...base, chainId: 84531 })).not.toBe(baseline);
    expect(computeManifestHash({ ...base, indexedBlockNumber: base.indexedBlockNumber + 1n })).not.toBe(baseline);
    expect(
      computeManifestHash({ ...base, indexedBlockHash: ("0xf".padEnd(66, "0") as `0x${string}`) }),
    ).not.toBe(baseline);
    expect(computeManifestHash({ ...base, registryVersion: 2n })).not.toBe(baseline);
    expect(
      computeManifestHash({
        ...base,
        registryMerkleRoot: ("0xe".padEnd(66, "0") as `0x${string}`),
      }),
    ).not.toBe(baseline);
  });
});

describe("manifestInputFrom", () => {
  it("uses zero defaults when registry commit is absent", () => {
    const snapshot = {
      head: {
        lastIndexedBlock: 1_000n,
        lastIndexedBlockHash: "0xab".padEnd(66, "0") as `0x${string}`,
      },
      registry: null,
      latestSnapshot: null,
    };
    const input = manifestInputFrom(snapshot, 31337);
    expect(input.registryVersion).toBe(0n);
    expect(input.registryMerkleRoot).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
  });
});
