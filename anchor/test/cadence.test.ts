import { describe, it, expect } from "vitest";
import { decideSubmit } from "../src/submitter/cadence.js";

describe("decideSubmit", () => {
  it("submits initial snapshot when no prior anchor exists and lag is sufficient", () => {
    const decision = decideSubmit({
      currentBlock: 1_000n,
      lastSubmittedAnchorBlock: null,
      cadenceBlocks: 100n,
      minIndexerLagBlocks: 1n,
      indexedBlock: 999n,
    });
    expect(decision.shouldSubmit).toBe(true);
    expect(decision.candidateAnchorBlock).toBe(999n);
  });

  it("skips when indexer lag is below minimum", () => {
    const decision = decideSubmit({
      currentBlock: 1_000n,
      lastSubmittedAnchorBlock: null,
      cadenceBlocks: 100n,
      minIndexerLagBlocks: 5n,
      indexedBlock: 999n,
    });
    expect(decision.shouldSubmit).toBe(false);
    expect(decision.reason).toMatch(/indexer lag/);
  });

  it("skips when cadence gap below threshold", () => {
    const decision = decideSubmit({
      currentBlock: 2_000n,
      lastSubmittedAnchorBlock: 1_950n,
      cadenceBlocks: 100n,
      minIndexerLagBlocks: 1n,
      indexedBlock: 1_990n,
    });
    expect(decision.shouldSubmit).toBe(false);
    expect(decision.reason).toMatch(/cadence gap/);
  });

  it("submits when cadence gap satisfied", () => {
    const decision = decideSubmit({
      currentBlock: 2_500n,
      lastSubmittedAnchorBlock: 2_000n,
      cadenceBlocks: 100n,
      minIndexerLagBlocks: 1n,
      indexedBlock: 2_499n,
    });
    expect(decision.shouldSubmit).toBe(true);
    expect(decision.candidateAnchorBlock).toBe(2_499n);
  });

  it("equal cadence gap is submittable (>= boundary)", () => {
    const decision = decideSubmit({
      currentBlock: 1_101n,
      lastSubmittedAnchorBlock: 1_000n,
      cadenceBlocks: 100n,
      minIndexerLagBlocks: 1n,
      indexedBlock: 1_100n,
    });
    expect(decision.shouldSubmit).toBe(true);
  });
});
