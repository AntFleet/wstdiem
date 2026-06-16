import { describe, it, expect } from "vitest";
import { encodeEventTopics, encodeAbiParameters, keccak256, toHex, type Log } from "viem";
import { decodeLog } from "../src/events/decoder.js";
import { STATE_SNAPSHOT_ACCEPTED, REGISTRY_EMERGENCY_GUARDIAN_CHANGED } from "../src/events/abi.js";

function buildLog(args: {
  abi: typeof STATE_SNAPSHOT_ACCEPTED;
  topics: `0x${string}`[];
  data: `0x${string}`;
}): Log {
  return {
    address: "0x0000000000000000000000000000000000000001",
    blockHash: "0xbbbb".padEnd(66, "0") as `0x${string}`,
    blockNumber: 100n,
    data: args.data,
    logIndex: 0,
    removed: false,
    topics: args.topics as readonly `0x${string}`[] as Log["topics"],
    transactionHash: "0xcccc".padEnd(66, "0") as `0x${string}`,
    transactionIndex: 0,
  } as unknown as Log;
}

describe("decodeLog", () => {
  it("decodes StateSnapshotAccepted", () => {
    const blockNumber = 12345n;
    const manifestHash = ("0xab".padEnd(66, "0")) as `0x${string}`;
    const submitter = "0x000000000000000000000000000000000000abcd" as `0x${string}`;
    const topics = encodeEventTopics({
      abi: [STATE_SNAPSHOT_ACCEPTED],
      args: { blockNumber, manifestHash, submitter },
    }) as `0x${string}`[];
    const log = buildLog({ abi: STATE_SNAPSHOT_ACCEPTED, topics, data: "0x" });
    const decoded = decodeLog(log);
    expect(decoded).not.toBeNull();
    expect(decoded?.eventName).toBe("StateSnapshotAccepted");
    expect((decoded?.args as Record<string, unknown>).blockNumber).toBe(blockNumber);
    expect((decoded?.args as Record<string, unknown>).manifestHash).toBe(manifestHash);
  });

  it("decodes RegistryEmergencyGuardianChanged with effectiveBlock data field", () => {
    const oldGuardian = "0x000000000000000000000000000000000000abcd" as `0x${string}`;
    const newGuardian = "0x000000000000000000000000000000000000abce" as `0x${string}`;
    const effectiveBlock = 999n;
    const topics = encodeEventTopics({
      abi: [REGISTRY_EMERGENCY_GUARDIAN_CHANGED],
      args: { oldGuardian, newGuardian },
    }) as `0x${string}`[];
    const data = encodeAbiParameters([{ type: "uint256" }], [effectiveBlock]) as `0x${string}`;
    const log = buildLog({ abi: REGISTRY_EMERGENCY_GUARDIAN_CHANGED, topics, data });
    const decoded = decodeLog(log);
    expect(decoded?.eventName).toBe("RegistryEmergencyGuardianChanged");
    expect((decoded?.args as Record<string, unknown>).effectiveBlock).toBe(effectiveBlock);
  });

  it("returns null for unknown topic0", () => {
    const log = buildLog({
      abi: STATE_SNAPSHOT_ACCEPTED,
      topics: [keccak256(toHex("UnknownEvent()")) as `0x${string}`],
      data: "0x",
    });
    const decoded = decodeLog(log);
    expect(decoded).toBeNull();
  });
});
