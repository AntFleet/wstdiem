// StatePillExpanded — hover/click expansion of the market state-pill.
//
// Markets wire-up closure: synthesis D.1 calls for an expansion reveal
// showing utilization / LLTV / Curve depth / vault NAV / executor codehash
// / sequencer status / oracle staleness / 24h transitions when the user
// hovers or clicks the market-card state-pill. This component renders that
// detail panel. Many of these fields are pending SDK surface; the panel
// renders the explicit pending-SDK-surface marker for missing fields.

import type { ReadinessResult, AnchorFreshness } from "@wstdiem/sdk";

interface StatePillExpandedProps {
  readiness: ReadinessResult | undefined;
  anchor: AnchorFreshness | undefined;
  /** Optional supplemental fields the parent has resolved (Phase 5 wires
   * these from the SDK as the surfaces land). */
  fields?: {
    utilizationBps?: number;
    lltvBps?: number;
    curveDepthDiem?: bigint;
    vaultNavWad?: bigint;
    executorCodehash?: string;
    oracleAgeBlocks?: number;
    transitions24h?: number;
  };
  /** Optional render variant — "panel" (default, full disclosure card)
   * or "inline" (single-row tooltip). */
  variant?: "panel" | "inline";
}

function fmtBps(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${(value / 100).toFixed(2)}%`;
}

function fmtBigint(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return value.toString();
}

function shortHash(hash: string | undefined): string {
  if (!hash) return "—";
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function StatePillExpanded(
  props: StatePillExpandedProps,
): JSX.Element {
  const f = props.fields ?? {};
  const r = props.readiness;
  const a = props.anchor;
  if (props.variant === "inline") {
    return (
      <span
        data-testid="state-pill-expanded-inline"
        className="text-[10px] text-text-muted"
      >
        utilization {fmtBps(f.utilizationBps)} · LLTV {fmtBps(f.lltvBps)} ·
        oracle age {f.oracleAgeBlocks ?? "—"} blocks
      </span>
    );
  }
  return (
    <div
      data-testid="state-pill-expanded"
      className="rounded-md border border-border bg-canvas px-3 py-2 text-xs"
    >
      <div className="mb-2 text-[10px] uppercase tracking-wide text-text-muted">
        Market detail
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <div>
          <dt className="text-text-muted">Utilization</dt>
          <dd className="font-mono text-text">{fmtBps(f.utilizationBps)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">LLTV</dt>
          <dd className="font-mono text-text">{fmtBps(f.lltvBps)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Curve depth (DIEM)</dt>
          <dd className="font-mono text-text">{fmtBigint(f.curveDepthDiem)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Vault NAV</dt>
          <dd className="font-mono text-text">{fmtBigint(f.vaultNavWad)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Executor codehash</dt>
          <dd
            className="font-mono text-text break-all"
            title={f.executorCodehash}
          >
            {shortHash(f.executorCodehash)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Sequencer</dt>
          <dd className="font-mono text-text">{r?.sequencer ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Oracle age (blocks)</dt>
          <dd className="font-mono text-text">{f.oracleAgeBlocks ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Anchor</dt>
          <dd className="font-mono text-text">{a?.status ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">24h transitions</dt>
          <dd className="font-mono text-text">{f.transitions24h ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">RPC quorum</dt>
          <dd className="font-mono text-text">
            {r?.rpcQuorum
              ? `${r.rpcQuorum.matchedFamilies.length}/${r.rpcQuorum.size}`
              : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] text-text-muted">
        Fields marked "—" are pending SDK surface. Phase 5 wires the
        utilization / LLTV / Curve depth / vault NAV / executor codehash /
        24h-transitions from the SDK as the readers land.
      </p>
    </div>
  );
}
