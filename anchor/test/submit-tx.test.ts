import { describe, it, expect, vi } from "vitest";

/**
 * Unit-level contract for the production anchor path: we always submit via
 * submitStateSnapshotWithBlockHash and refuse zero/missing hashes.
 *
 * Full RPC + wallet integration is covered by the foundry LoopAnchorRegistry
 * tests; this suite locks the TS entrypoint's fail-closed policy.
 */

describe("submitStateSnapshot (blockhash path)", () => {
  it("module exports submitStateSnapshot", async () => {
    const mod = await import("../src/submitter/tx.js");
    expect(typeof mod.submitStateSnapshot).toBe("function");
  });

  it("refuses submission when RPC returns no block hash", async () => {
    const { submitStateSnapshot } = await import("../src/submitter/tx.js");
    const publicClient = {
      getBlock: vi.fn(async () => ({ hash: null })),
      simulateContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };
    await expect(
      submitStateSnapshot({
        config: {
          chainId: 8453,
          rpcUrl: "http://127.0.0.1:8545",
          rpcFallbackUrls: [],
          indexerApiUrl: "http://127.0.0.1:8080",
          registryAddress: "0x" + "11".repeat(20),
          anchorRegistryAddress: "0x" + "22".repeat(20),
          // anvil default key
          submitterPrivateKey:
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
          minIndexerLagBlocks: 1n,
          pollIntervalMs: 15_000,
          txConfirmationBlocks: 2,
          logLevel: "info",
        } as never,
        publicClient: publicClient as never,
        blockNumber: 10n,
        manifestHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
      }),
    ).rejects.toThrow(/no hash for block/);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });
});
