import { describe, it, expect } from "vitest";
import {
  evaluateG1HarvestConvergence,
  evaluateG2IndexerAnchor,
  evaluateG3RpcQuorum,
  evaluateG4Eip1271Preimage,
  evaluateG5MevWaiver,
  evaluateG6AutomationThrottle,
  evaluatePostMatrixGates,
  gatesAllPass,
} from "../src/gates/post-matrix.js";
import { asBlockNumber } from "../src/types/branded.js";
import { MevWaiverBit } from "../src/types/enums.js";
import { classifyAnchorFreshness } from "../src/anchor/freshness.js";

describe("G-PM-1 harvest convergence", () => {
  it("passes when not risk-increasing", () => {
    const s = evaluateG1HarvestConvergence({
      primaryType: "Exit",
      isRiskIncreasing: false,
      currentBlock: asBlockNumber(100n),
      lastHarvestBlock: asBlockNumber(50n),
      harvestCoolingBlocks: 30,
    });
    expect(s.status).toBe("notApplicable");
  });

  it("fails inside cooling window", () => {
    const s = evaluateG1HarvestConvergence({
      primaryType: "Open",
      isRiskIncreasing: true,
      currentBlock: asBlockNumber(70n),
      lastHarvestBlock: asBlockNumber(50n),
      harvestCoolingBlocks: 30,
    });
    expect(s.status).toBe("fail");
    expect(s.error).toBe("HarvestConvergencePending");
  });

  it("passes outside cooling window", () => {
    const s = evaluateG1HarvestConvergence({
      primaryType: "Open",
      isRiskIncreasing: true,
      currentBlock: asBlockNumber(85n),
      lastHarvestBlock: asBlockNumber(50n),
      harvestCoolingBlocks: 30,
    });
    expect(s.status).toBe("pass");
  });
});

describe("G-PM-2 indexer anchor stale", () => {
  it("passes when anchor fresh", () => {
    const anchor = classifyAnchorFreshness({
      lastAnchoredBlock: asBlockNumber(100n),
      currentBlock: asBlockNumber(150n),
      anchorMaxStaleBlocks: 100,
    });
    const s = evaluateG2IndexerAnchor({ anchor });
    expect(s.status).toBe("pass");
  });

  it("fails when anchor degraded", () => {
    const anchor = classifyAnchorFreshness({
      lastAnchoredBlock: asBlockNumber(100n),
      currentBlock: asBlockNumber(250n),
      anchorMaxStaleBlocks: 100,
      anchorEmergencyMultiplier: 3,
    });
    const s = evaluateG2IndexerAnchor({ anchor });
    expect(s.status).toBe("fail");
    expect(s.error).toBe("IndexerAnchorStale");
  });
});

describe("G-PM-3 RPC quorum independence", () => {
  it("passes when ok", () => {
    const s = evaluateG3RpcQuorum({
      quorum: { threshold: 2, size: 3, providerFamilies: ["alchemy", "infura"], matchedFamilies: ["alchemy", "infura"], maxRpcBlockLagBlocks: 5, quorumTimeoutMs: 5000, status: "ok" },
    });
    expect(s.status).toBe("pass");
  });

  it("fails on notIndependent", () => {
    const s = evaluateG3RpcQuorum({
      quorum: { threshold: 2, size: 3, providerFamilies: ["alchemy", "alchemy"], matchedFamilies: ["alchemy", "alchemy"], maxRpcBlockLagBlocks: 5, quorumTimeoutMs: 5000, status: "notIndependent" },
    });
    expect(s.status).toBe("fail");
    expect(s.error).toBe("RpcQuorumNotIndependent");
  });
});

describe("G-PM-4 EIP-1271 preimage", () => {
  it("notApplicable when not high-risk", () => {
    const s = evaluateG4Eip1271Preimage({ primaryType: "Exit", signerOnAllowList: false });
    expect(s.status).toBe("notApplicable");
  });

  it("notApplicable when signer on allow-list", () => {
    const s = evaluateG4Eip1271Preimage({ primaryType: "Open", signerOnAllowList: true });
    expect(s.status).toBe("notApplicable");
  });

  it("fails when high-risk + no proof + not allow-listed", () => {
    const s = evaluateG4Eip1271Preimage({ primaryType: "Open", signerOnAllowList: false });
    expect(s.status).toBe("fail");
    expect(s.error).toBe("Eip1271PreimageNotAttested");
  });

  it("passes when high-risk + proof provided", () => {
    const s = evaluateG4Eip1271Preimage({
      primaryType: "Open",
      signerOnAllowList: false,
      preimageProof: ("0x" + "aa".repeat(32)) as `0x${string}`,
    });
    expect(s.status).toBe("pass");
  });
});

describe("G-PM-5 MEV waiver", () => {
  it("PRIVATE_BUILDER -> private builder channel passes", () => {
    const s = evaluateG5MevWaiver({
      signedMode: "PRIVATE_BUILDER",
      observedChannel: "PRIVATE_BUILDER",
      signedWaiverBits: 0,
      builderKeyAvailable: true,
    });
    expect(s.status).toBe("pass");
  });

  it("PUBLIC -> public mempool without opt-in fails", () => {
    const s = evaluateG5MevWaiver({
      signedMode: "PUBLIC",
      observedChannel: "PUBLIC_MEMPOOL",
      signedWaiverBits: 0,
      builderKeyAvailable: true,
    });
    expect(s.status).toBe("fail");
    expect(s.error).toBe("MevWaiverMissing");
  });

  it("PUBLIC -> public mempool with opt-in passes", () => {
    const s = evaluateG5MevWaiver({
      signedMode: "PUBLIC",
      observedChannel: "PUBLIC_MEMPOOL",
      signedWaiverBits: MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN,
      builderKeyAvailable: true,
    });
    expect(s.status).toBe("pass");
  });

  it("PRIVATE_BUILDER -> sequencer-direct fallback without opt-in fails", () => {
    const s = evaluateG5MevWaiver({
      signedMode: "PRIVATE_BUILDER",
      observedChannel: "SEQUENCER_DIRECT",
      signedWaiverBits: 0,
      builderKeyAvailable: true,
    });
    expect(s.status).toBe("fail");
    expect(s.error).toBe("MevWaiverMissing");
  });
});

describe("G-PM-6 automation throttle", () => {
  it("notApplicable for OWNER_DIRECT", () => {
    const s = evaluateG6AutomationThrottle({
      executionKind: "OWNER_DIRECT",
      failedAttemptsInWindow: 0,
      maxFailedAttemptsPerWindow: 5,
      callerAllowed: true,
    });
    expect(s.status).toBe("notApplicable");
  });

  it("fails when caller not allowed", () => {
    const s = evaluateG6AutomationThrottle({
      executionKind: "KEEPER_PERMISSIONLESS",
      failedAttemptsInWindow: 0,
      maxFailedAttemptsPerWindow: 5,
      callerAllowed: false,
    });
    expect(s.error).toBe("CallerNotAllowed");
  });

  it("fails when at throttle limit", () => {
    const s = evaluateG6AutomationThrottle({
      executionKind: "KEEPER_PERMISSIONLESS",
      failedAttemptsInWindow: 5,
      maxFailedAttemptsPerWindow: 5,
      callerAllowed: true,
    });
    expect(s.error).toBe("AutomationAttemptThrottled");
  });

  it("passes inside throttle limit", () => {
    const s = evaluateG6AutomationThrottle({
      executionKind: "KEEPER_PERMISSIONLESS",
      failedAttemptsInWindow: 0,
      maxFailedAttemptsPerWindow: 5,
      callerAllowed: true,
    });
    expect(s.status).toBe("pass");
  });
});

describe("evaluatePostMatrixGates + gatesAllPass", () => {
  it("with no inputs, all gates are notApplicable and pass", () => {
    const results = evaluatePostMatrixGates({});
    expect(results).toHaveLength(6);
    expect(gatesAllPass(results)).toBe(true);
  });

  it("one fail makes gatesAllPass false", () => {
    const results = evaluatePostMatrixGates({
      g4: { primaryType: "Open", signerOnAllowList: false },
    });
    expect(gatesAllPass(results)).toBe(false);
  });
});
