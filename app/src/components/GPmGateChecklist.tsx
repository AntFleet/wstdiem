// GPmGateChecklist — G-PM-1..6 status checklist next to the sign button.
// Synthesis B.2 pre-sign gates.
//
// Renders one row per gate with the SDK's reported status. The sign button
// must remain disabled until every gate is `pass` (or `notApplicable` —
// notApplicable counts as pass for gates that don't apply to this action).

import type { GateStatus, GateId } from "@wstdiem/sdk";

interface GateMeta {
  id: GateId;
  label: string;
  plainLanguage: string;
}

export const GATE_REGISTRY: readonly GateMeta[] = [
  {
    id: "G_PM_1_HARVEST_CONVERGENCE",
    label: "G-PM-1 Harvest convergence",
    plainLanguage:
      "Risk-increasing actions wait for the registry harvest to converge (I-69). Repay-only flows skip this gate.",
  },
  {
    id: "G_PM_2_INDEXER_ANCHOR_STALE",
    label: "G-PM-2 Indexer anchor freshness",
    plainLanguage:
      "Refuse to sign when the indexer anchor is older than anchorMaxStaleBlocks (F-7).",
  },
  {
    id: "G_PM_3_RPC_QUORUM_NOT_INDEPENDENT",
    label: "G-PM-3 RPC quorum independence",
    plainLanguage:
      "At least 2 distinct provider families must agree on the read state (I-68).",
  },
  {
    id: "G_PM_4_EIP1271_PREIMAGE",
    label: "G-PM-4 EIP-1271 preimage attestation",
    plainLanguage:
      "High-risk policies signed via smart-account require an attested preimage display proof (I-66).",
  },
  {
    id: "G_PM_5_MEV_WAIVER",
    label: "G-PM-5 MEV waiver coverage",
    plainLanguage:
      "Submission channel needs a matching mevWaiverBit signed into the action (F-2).",
  },
  {
    id: "G_PM_6_AUTOMATION_THROTTLE",
    label: "G-PM-6 Automation throttle / allow-list",
    plainLanguage:
      "Permissionless callers must be on the allow-list and within the failed-attempt throttle window (I-72).",
  },
];

interface GPmGateChecklistProps {
  /** GateStatus per gate as returned by sdk.getReadiness or synthesized by
   * useGpmGates. undefined → not yet evaluated (loading). Missing rows
   * render as "unknown" rather than "fail" (M-2 closure: distinguishes
   * "SDK has not reported on this gate" from "this gate has failed"). */
  gates: readonly GateStatus[] | undefined;
}

/** UI-side status extension. The SDK type only knows pass/fail/notApplicable;
 * "unknown" is the frontend's pending-SDK-surface signal. */
type DisplayStatus = GateStatus["status"] | "unknown";

const STATUS_LABEL: Record<DisplayStatus, string> = {
  pass: "Pass",
  fail: "Blocked",
  notApplicable: "Not applicable",
  unknown: "Pending evaluation",
};

const STATUS_CLASS: Record<DisplayStatus, string> = {
  pass: "text-risk-green border-risk-green/40 bg-risk-green/10",
  fail: "text-risk-red border-risk-red/40 bg-risk-red/10",
  notApplicable: "text-text-muted border-border bg-surface-raised",
  unknown: "text-text-muted border-border bg-surface-raised",
};

const STATUS_ICON: Record<DisplayStatus, string> = {
  pass: "✓",
  fail: "✗",
  notApplicable: "·",
  unknown: "?",
};

const STATUS_LEGEND: Record<DisplayStatus, string> = {
  pass: "Gate passed (or not applicable to this action).",
  fail: "Gate failed — sign is blocked until resolved.",
  notApplicable: "Gate not applicable to this action.",
  unknown:
    "Gate evaluation pending SDK surface — treated as fail-closed (sign blocked).",
};

export function GPmGateChecklist(
  props: GPmGateChecklistProps,
): JSX.Element {
  // Build a map once so a single pass renders each row.
  const lookup = new Map<string, GateStatus>();
  for (const g of props.gates ?? []) {
    lookup.set(g.gate, g);
  }
  // Detect which display statuses are currently present so the legend
  // renders only relevant entries.
  const seenStatuses = new Set<DisplayStatus>();
  return (
    <div
      data-testid="gpm-gate-checklist"
      className="space-y-1.5"
      role="group"
      aria-label="Pre-sign gates"
    >
      {GATE_REGISTRY.map((gate) => {
        const row = lookup.get(gate.id);
        const status: DisplayStatus = row?.status ?? "unknown";
        seenStatuses.add(status);
        const error = row?.error;
        return (
          <div
            key={gate.id}
            data-testid={`gpm-gate-row-${gate.id}`}
            data-status={status}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${STATUS_CLASS[status]}`}
          >
            <span aria-hidden="true" className="mt-0.5 font-mono">
              {STATUS_ICON[status]}
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{gate.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide">
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <p className="mt-0.5 opacity-90">{gate.plainLanguage}</p>
              {error ? (
                <p className="mt-1 font-mono text-[11px]">SDK error: {error}</p>
              ) : null}
            </div>
          </div>
        );
      })}
      <ul
        data-testid="gpm-gate-legend"
        className="mt-2 grid grid-cols-1 gap-1 text-[10px] text-text-muted sm:grid-cols-2"
      >
        {(["pass", "notApplicable", "fail", "unknown"] as DisplayStatus[]).map(
          (s) => (
            <li
              key={s}
              data-testid={`gpm-gate-legend-${s}`}
              data-status={s}
              className="flex items-center gap-1.5"
            >
              <span aria-hidden="true" className="font-mono">
                {STATUS_ICON[s]}
              </span>
              <span>
                <code className="font-mono">{STATUS_LABEL[s]}</code> —{" "}
                {STATUS_LEGEND[s]}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/** Pure helper: returns true when every gate is pass or notApplicable.
 *  Missing rows + explicit "unknown" rows both count as NOT clear — the
 *  fail-closed default keeps the sign button disabled until the SDK
 *  reports on every gate. */
export function allGatesClear(
  gates: readonly GateStatus[] | undefined,
): boolean {
  if (!gates) return false;
  return GATE_REGISTRY.every((g) => {
    const status = gates.find((x) => x.gate === g.id)?.status;
    return status === "pass" || status === "notApplicable";
  });
}
