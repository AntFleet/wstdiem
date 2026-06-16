// Bit registries for the per-bit checklist component.
//
// Source of truth for the bit-name maps the SDK enums encode (`ForceExitRiskBit`,
// `MevWaiverBit`). The plain-language descriptions live here because they're
// UI copy — the SDK pins the canonical names.

import { ForceExitRiskBit, MevWaiverBit } from "@wstdiem/sdk";
import type { BitDescriptor } from "../components/PerBitChecklist.js";

/** Force-Exit `acknowledgedRisks` bits per PROTOCOL.md §6.3 / SDK ForceExitRiskBit. */
export const FORCE_EXIT_RISK_BITS: readonly BitDescriptor[] = [
  {
    mask: ForceExitRiskBit.LOOSE_SLIPPAGE,
    name: "LOOSE_SLIPPAGE",
    plainLanguage:
      "Accept a wider slippage band than the normal exit allows. The loop may close at a worse price than a standard Exit.",
  },
  {
    mask: ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
    name: "STALE_ORACLE_OVERRIDE",
    plainLanguage:
      "Force-Exit even though the Chainlink oracle is stale. The HF and liquidation distance shown may not reflect current market price.",
  },
  {
    mask: ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH,
    name: "INSUFFICIENT_CURVE_DEPTH",
    plainLanguage:
      "Force-Exit even though Curve liquidity is below the configured swap depth. Expect material price impact.",
  },
  {
    mask: ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE,
    name: "SEQUENCER_DOWN_OVERRIDE",
    plainLanguage:
      "Force-Exit during Base sequencer downtime / grace. Submission via fallback channel may take longer to confirm.",
  },
  {
    mask: ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE,
    name: "VAULT_EVIDENCE_OVERRIDE",
    plainLanguage:
      "Force-Exit even though wstDIEM vault NAV evidence is stale. Collateral valuation may be inaccurate.",
  },
];

/** MEV waiver bits per PROTOCOL.md §6.5 / SDK MevWaiverBit. */
export const MEV_WAIVER_BITS: readonly BitDescriptor[] = [
  {
    mask: MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN,
    name: "PUBLIC_MEMPOOL_OPT_IN",
    plainLanguage:
      "Allow submission via the public mempool. Sandwich-attack exposure increases; only accept when the policy is short-lived or the chosen builder is unavailable.",
  },
  {
    mask: MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN,
    name: "SEQUENCER_DIRECT_FALLBACK_OPT_IN",
    plainLanguage:
      "Allow the keeper to fall back to direct sequencer submission if the private builder is unreachable.",
  },
  {
    mask: MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN,
    name: "BUILDER_KEY_OUTAGE_OPT_IN",
    plainLanguage:
      "Allow submission to continue when the configured private builder key has been rotated out without the policy refresh.",
  },
];
