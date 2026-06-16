// AnchorFreshness classifier per the SDK type definitions + PROTOCOL.md F-7.
// Phase 1 cadence: 100 blocks; emergency multiplier: 3 (=> emergencyStale at
// 300 blocks). The SDK refuses to sign when status != "fresh" via G-PM-2.

import type { BlockNumber } from "../types/branded.js";
import type { AnchorFreshness } from "../types/readiness.js";

export const DEFAULT_ANCHOR_MAX_STALE_BLOCKS = 100;
export const DEFAULT_ANCHOR_EMERGENCY_MULTIPLIER = 3;

export interface AnchorClassifierInputs {
  lastAnchoredBlock: BlockNumber;
  currentBlock: BlockNumber;
  anchorMaxStaleBlocks?: number;
  anchorEmergencyMultiplier?: number;
}

export function classifyAnchorFreshness(
  inputs: AnchorClassifierInputs,
): AnchorFreshness {
  const anchorMaxStaleBlocks =
    inputs.anchorMaxStaleBlocks ?? DEFAULT_ANCHOR_MAX_STALE_BLOCKS;
  const anchorEmergencyMultiplier =
    inputs.anchorEmergencyMultiplier ?? DEFAULT_ANCHOR_EMERGENCY_MULTIPLIER;
  const lag = inputs.currentBlock - inputs.lastAnchoredBlock;
  const stale = BigInt(anchorMaxStaleBlocks);
  const emergencyStale = BigInt(anchorMaxStaleBlocks * anchorEmergencyMultiplier);

  if (lag <= stale) {
    return {
      lastAnchoredBlock: inputs.lastAnchoredBlock,
      anchorMaxStaleBlocks,
      anchorEmergencyMultiplier,
      status: "fresh",
    };
  }
  if (lag <= emergencyStale) {
    return {
      lastAnchoredBlock: inputs.lastAnchoredBlock,
      anchorMaxStaleBlocks,
      anchorEmergencyMultiplier,
      status: "degraded",
      error: "IndexerAnchorStale",
    };
  }
  return {
    lastAnchoredBlock: inputs.lastAnchoredBlock,
    anchorMaxStaleBlocks,
    anchorEmergencyMultiplier,
    status: "emergencyStale",
    error: "IndexerAnchorStale",
  };
}
