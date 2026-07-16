// Bit registries for the per-bit checklist component.
//
// Canonical names + plain-language copy are owned by the SDK
// (`decodeAcknowledgedRisks` / ForceExitRiskBit registry). This module
// adapts them into the PerBitChecklist BitDescriptor shape so the UI does
// not drift from the protocol bit map.

import {
  ForceExitRiskBit,
  MevWaiverBit,
  decodeAcknowledgedRisks,
  decodeMevWaiverBits,
} from "@wstdiem/sdk";
import type { BitDescriptor } from "../components/PerBitChecklist.js";

/** All known Force-Exit risk bits (for checklist registry). */
export const FORCE_EXIT_RISK_BITS: readonly BitDescriptor[] =
  decodeAcknowledgedRisks(
    ForceExitRiskBit.LOOSE_SLIPPAGE |
      ForceExitRiskBit.STALE_ORACLE_OVERRIDE |
      ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH |
      ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE |
      ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE,
  ).known.map((b) => ({
    mask: b.bit,
    name: b.name,
    plainLanguage: b.plainLanguage,
  }));

/** MEV waiver bits per PROTOCOL.md §6.5 / SDK MevWaiverBit. */
export const MEV_WAIVER_BITS: readonly BitDescriptor[] = decodeMevWaiverBits(
  MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN |
    MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN |
    MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN,
).known.map((b) => ({
  mask: b.bit,
  name: b.name,
  plainLanguage: b.plainLanguage,
}));
