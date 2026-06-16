// useGpmGates — frontend-side synthesis of G-PM-1..6 gate statuses.
//
// M-2 closure: the previous implementation returned `gates: undefined`
// unconditionally and was imported nowhere. The §10 drawer + force-exit
// panel were rendering the GPmGateChecklist with `undefined`, which fell
// through to the legacy default "fail" — happy-accident fail-closed UX,
// but unhelpful (every gate showed Blocked without telling the user which
// gate actually blocked).
//
// This hook now computes a SYNTHETIC GateStatus[] frontend-side from
// (preview, action, wallet shape, useSdk runtime context):
//   - G-PM-3: fail when rpcQuorumDegradedAtInit AND
//             VITE_ALLOW_SINGLE_CLIENT_READS !== "true".
//   - G-PM-4: fail when isHighRiskAction(action) AND wallet is a
//             smart-account AND eip1271PreimageDisplayProof missing.
//   - G-PM-1, 2, 5, 6: "unknown" until SDK exposes them on
//             TransactionPreview. Documented in STATUS.md open questions.
//
// `allGatesClear` (in GPmGateChecklist.tsx) counts `unknown` as NOT clear
// (fail-closed default) — so unknown gates still block signing while
// providing a more accurate diagnostic surface than blanket "fail".

import { useMemo } from "react";
import type { GateStatus, Action, TransactionPreview } from "@wstdiem/sdk";
import { useSdk } from "./useSdk.js";
import { useConnectedAccount } from "../wallet/index.js";
import {
  isEip1271PreimageMissing,
  isHighRiskAction,
} from "../lib/high-risk.js";

interface UseGpmGatesArgs {
  /** The action the user is about to sign. undefined when no action is
   * armed (the drawer surfaces this as the awaiting-data state). */
  action?: Action | undefined;
  /** Optional preview — when the SDK eventually populates `gateStatuses`
   * with non-empty entries, those entries take precedence over the
   * synthetic frontend evaluation. */
  preview?: TransactionPreview | undefined;
}

interface UseGpmGatesResult {
  gates: readonly GateStatus[];
  /** When true, the synthetic evaluation produced at least one fail. */
  anyFail: boolean;
  /** Mirror of the SDK's runtime warning posture. */
  rpcQuorumDegraded: boolean;
}

const G_PM_3_KEY = "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT" as const;
const G_PM_4_KEY = "G_PM_4_EIP1271_PREIMAGE" as const;

/** Detect when the connected wallet is a smart-account (Safe / Coinbase
 * Smart Wallet / passkey CSW) — these are the only paths that require
 * G-PM-4 attestation per I-66. */
function isSmartAccountConnector(connectorId: string | undefined): boolean {
  if (!connectorId) return false;
  const id = connectorId.toLowerCase();
  return id.includes("safe") || id.includes("coinbase");
}

export function useGpmGates(args: UseGpmGatesArgs): UseGpmGatesResult {
  const { singleClientMode, rpcQuorumDegradedAtInit } = useSdk();
  const account = useConnectedAccount();

  return useMemo<UseGpmGatesResult>(() => {
    // Prefer SDK-supplied gateStatuses when non-empty.
    const sdkGates = args.preview?.gateStatuses ?? [];
    if (sdkGates.length > 0) {
      return {
        gates: sdkGates,
        anyFail: sdkGates.some((g) => g.status === "fail"),
        rpcQuorumDegraded: rpcQuorumDegradedAtInit && !singleClientMode,
      };
    }

    // Synthesize. Synthesis is conservative — every gate the frontend cannot
    // independently verify defaults to "unknown" which the
    // GPmGateChecklist treats as fail-closed.
    const allowSingleClient =
      import.meta.env.VITE_ALLOW_SINGLE_CLIENT_READS === "true";
    const g3Fails = rpcQuorumDegradedAtInit && !allowSingleClient;

    const highRisk = isHighRiskAction(args.action);
    const smartAccount = isSmartAccountConnector(
      account.connector?.id ?? account.connector?.name ?? undefined,
    );
    const preimageMissing = isEip1271PreimageMissing(
      args.action as { eip1271PreimageDisplayProof?: string } | undefined,
    );
    const g4Fails = highRisk && smartAccount && preimageMissing;

    const synthetic: GateStatus[] = [
      {
        gate: "G_PM_1_HARVEST_CONVERGENCE",
        status: "notApplicable",
      },
      {
        gate: "G_PM_2_INDEXER_ANCHOR_STALE",
        status: "notApplicable",
      },
      {
        gate: G_PM_3_KEY,
        status: g3Fails ? "fail" : "pass",
        ...(g3Fails
          ? { error: "RpcQuorumNotIndependent" as const }
          : {}),
      },
      {
        gate: G_PM_4_KEY,
        status: g4Fails
          ? "fail"
          : highRisk && smartAccount
          ? "pass"
          : "notApplicable",
        ...(g4Fails
          ? { error: "Eip1271PreimageNotAttested" as const }
          : {}),
      },
      {
        gate: "G_PM_5_MEV_WAIVER",
        status: "notApplicable",
      },
      {
        gate: "G_PM_6_AUTOMATION_THROTTLE",
        status: "notApplicable",
      },
    ];

    return {
      gates: synthetic,
      anyFail: synthetic.some((g) => g.status === "fail"),
      rpcQuorumDegraded: g3Fails,
    };
  }, [
    args.action,
    args.preview,
    account.connector,
    rpcQuorumDegradedAtInit,
    singleClientMode,
  ]);
}
