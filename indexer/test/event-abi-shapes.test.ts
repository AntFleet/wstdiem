import { describe, it, expect } from "vitest";
import { toEventSelector } from "viem";
import {
  LOOP_ACTION_STEP,
  POLICY_CREATED,
  POLICY_UPDATED,
  REGISTRY_CONFIG_BATCH_COMMITTED,
  EXTERNAL_FINGERPRINT_UPDATE_QUEUED,
  EXTERNAL_FINGERPRINT_UPDATE_APPLIED,
  RECLOSED_INTEGRATION,
  INDEXER_ABI,
} from "../src/events/abi.js";

function sig(event: (typeof INDEXER_ABI)[number]): string {
  const types = event.inputs.map((i) => i.type).join(",");
  return `${event.name}(${types})`;
}

describe("indexer event ABI shapes (topic0 vs ILoopV1Events)", () => {
  it("LoopActionStep matches on-chain signature", () => {
    expect(sig(LOOP_ACTION_STEP)).toBe(
      "LoopActionStep(address,bytes32,bytes32,uint8,uint8,address,bytes4,bool)",
    );
    expect(toEventSelector(sig(LOOP_ACTION_STEP))).toBe(
      "0xf2636491f56ac06d68318c545444b3788082032644680d6c71a842c718176ff3",
    );
  });

  it("PolicyCreated matches on-chain signature", () => {
    expect(sig(POLICY_CREATED)).toBe("PolicyCreated(address,uint64,uint8,bytes32,uint256)");
    expect(toEventSelector(sig(POLICY_CREATED))).toBe(
      "0xaf44faf1e99d076d716f9b9de2fd11ec67df9415c676373e804157f52c3213f9",
    );
  });

  it("PolicyUpdated matches on-chain signature", () => {
    expect(sig(POLICY_UPDATED)).toBe("PolicyUpdated(address,uint64,bytes32,bytes32,uint256)");
  });

  it("RegistryConfigBatchCommitted has indexed version/root/committer", () => {
    expect(sig(REGISTRY_CONFIG_BATCH_COMMITTED)).toBe(
      "RegistryConfigBatchCommitted(uint256,bytes32,address,uint16)",
    );
    const indexed = REGISTRY_CONFIG_BATCH_COMMITTED.inputs.filter((i) => i.indexed).map((i) => i.name);
    expect(indexed).toEqual(["version", "root", "committer"]);
  });

  it("fingerprint events (EIP-170 Phase 3) match LoopFingerprintRegistry signatures", () => {
    expect(sig(EXTERNAL_FINGERPRINT_UPDATE_QUEUED)).toBe(
      "ExternalFingerprintUpdateQueued(bytes32,bytes32,uint256)",
    );
    expect(toEventSelector(sig(EXTERNAL_FINGERPRINT_UPDATE_QUEUED))).toBe(
      "0x80ec304a9829ff759b11ec7638d8c0d1380503a8716aac7c3ddc6996460fe6e0",
    );
    expect(sig(EXTERNAL_FINGERPRINT_UPDATE_APPLIED)).toBe(
      "ExternalFingerprintUpdateApplied(bytes32,bytes32)",
    );
    expect(toEventSelector(sig(EXTERNAL_FINGERPRINT_UPDATE_APPLIED))).toBe(
      "0xfc601e760e1764cd7300fb41be12116471bc93573e0e4acbfc6b361991a23c60",
    );
    expect(sig(RECLOSED_INTEGRATION)).toBe("ReclosedIntegration(bytes32)");
    expect(toEventSelector(sig(RECLOSED_INTEGRATION))).toBe(
      "0x7dcfba71ea7161e2ff77fb23a6e5d325569af295d3ec0766f7e28b6bbf273bb0",
    );
    // integrationId is the sole indexed topic on all three.
    expect(EXTERNAL_FINGERPRINT_UPDATE_QUEUED.inputs.filter((i) => i.indexed).map((i) => i.name)).toEqual([
      "integrationId",
    ]);
  });

  it("INDEXER_ABI has no duplicate event names", () => {
    const names = INDEXER_ABI.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
