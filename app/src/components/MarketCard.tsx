// MarketCard — D.1 full Beefy + Morpho + DeFi Saver card density.
// Synthesis A.4 / B.1 / D.1.
//
// "What I earn / what can fail / how I exit" triad per Beefy. Hover/click
// expansion reveals the deeper Morpho + DeFi Saver fields.

import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  AnchorFreshness,
  MarketId,
  ReadinessResult,
} from "@wstdiem/sdk";
import { StateBit } from "@wstdiem/sdk";
import { setBitsIn, hasUnknownBits } from "../lib/state-bits.js";
import { StatePillExpanded } from "./StatePillExpanded.js";

interface MarketCardProps {
  marketId: MarketId;
  readiness: ReadinessResult | undefined;
  /** Net loop spread APR (basis points). undefined → "—". */
  netSpreadBps?: number | undefined;
  /** HF forecast at maxLeverageBps for a fresh open. */
  hfAtMaxLeverage?: number | undefined;
  /** Automation availability badge (DeFi Saver). */
  automationAvailable?: boolean;
  /** Anchor freshness, used by the expanded state-pill panel. */
  anchor?: AnchorFreshness | undefined;
  /** LLTV in basis points (registry read). undefined → "—". */
  lltvBps?: number | undefined;
  /** Current utilization in basis points. undefined → "—". */
  utilizationBps?: number | undefined;
  /** Oracle source label (e.g. "Chainlink BASE/USD"). undefined → "—". */
  oracleSource?: string | undefined;
}

function fmtBps(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${(value / 100).toFixed(2)}%`;
}

export function MarketCard(props: MarketCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const bitmap = props.readiness?.stateBitmap;
  const auditClosed =
    bitmap !== undefined &&
    (bitmap & StateBit.AUDIT_GATE_CLOSED) === StateBit.AUDIT_GATE_CLOSED;
  const setBits = bitmap !== undefined ? setBitsIn(bitmap) : [];
  const unknownBits = bitmap !== undefined && hasUnknownBits(bitmap);
  const openBlocked = auditClosed || unknownBits;

  return (
    <article
      data-testid="market-card"
      data-expanded={expanded}
      data-market-id={props.marketId}
      className="rounded-lg border border-border bg-surface"
    >
      <header className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
        <div>
          <div className="text-sm font-semibold text-text">
            <span className="font-mono">DIEM</span> /{" "}
            <span className="font-mono">wstDIEM</span>
          </div>
          <div
            className="mt-0.5 truncate text-[10px] text-text-muted"
            title={props.marketId}
          >
            {props.marketId.slice(0, 10)}…
          </div>
        </div>

        <div
          className="text-xs text-text-muted"
          data-testid="market-card-earn"
        >
          <div className="uppercase tracking-wide text-[10px]">Earn</div>
          <div
            className={`text-sm font-semibold ${
              props.netSpreadBps !== undefined
                ? props.netSpreadBps >= 0
                  ? "text-risk-green"
                  : "text-risk-red"
                : "text-text-muted"
            }`}
          >
            {fmtBps(props.netSpreadBps)} APR
          </div>
        </div>

        <div
          className="text-xs text-text-muted"
          data-testid="market-card-fail"
        >
          <div className="uppercase tracking-wide text-[10px]">Fail state</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                auditClosed
                  ? "border-warning-border bg-warning-surface text-warning-text"
                  : "border-border bg-surface-raised text-text-muted"
              }`}
              data-testid="market-card-audit-gate"
              data-state={auditClosed ? "closed" : "open"}
            >
              <span aria-hidden="true">{auditClosed ? "✗" : "✓"}</span>
              Audit
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                unknownBits
                  ? "border-warning-border bg-warning-surface text-warning-text"
                  : setBits.length === 0
                  ? "border-border bg-surface-raised text-risk-green"
                  : "border-risk-amber/60 bg-risk-amber/10 text-risk-amber"
              }`}
              data-testid="market-card-state-pill"
            >
              <span aria-hidden="true">
                {unknownBits
                  ? "⚠"
                  : setBits.length === 0
                  ? "🟢"
                  : "🟡"}
              </span>
              State{setBits.length > 0 ? ` (${setBits.length})` : ""}
            </span>
            {props.automationAvailable !== undefined ? (
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                  props.automationAvailable
                    ? "border-border bg-surface-raised text-text-muted"
                    : "border-border bg-surface-raised text-text-muted/50"
                }`}
                data-testid="market-card-automation"
                data-available={props.automationAvailable}
              >
                <span aria-hidden="true">
                  {props.automationAvailable ? "✓" : "·"}
                </span>
                Automation
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="market-card-exit">
          <Link
            to="/loop"
            data-testid="market-card-open"
            aria-disabled={openBlocked}
            onClick={(e) => openBlocked && e.preventDefault()}
            className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            Open
          </Link>
          <Link
            to="/positions"
            data-testid="market-card-manage"
            className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-text hover:border-accent/40"
          >
            Manage
          </Link>
          <button
            type="button"
            onClick={() => setExpanded((s) => !s)}
            data-testid="market-card-toggle"
            aria-expanded={expanded}
            className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-text-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {expanded ? "Hide details" : "Details"}
          </button>
        </div>
      </header>

      {expanded ? (
        <div
          data-testid="market-card-details"
          className="space-y-3 border-t border-border px-4 py-3 text-xs"
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            <div>
              <dt className="text-text-muted">HF @ max leverage</dt>
              <dd className="font-mono text-text">
                {props.hfAtMaxLeverage !== undefined
                  ? props.hfAtMaxLeverage.toFixed(2)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Oracle source</dt>
              <dd className="font-mono text-text">
                {props.oracleSource ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Sequencer</dt>
              <dd className="font-mono text-text">
                {props.readiness?.sequencer ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Anchor</dt>
              <dd className="font-mono text-text">
                {props.readiness?.indexerAnchor.status ?? "—"}
              </dd>
            </div>
          </dl>
          <StatePillExpanded
            readiness={props.readiness}
            anchor={props.anchor ?? props.readiness?.indexerAnchor}
            fields={{
              ...(props.utilizationBps !== undefined
                ? { utilizationBps: props.utilizationBps }
                : {}),
              ...(props.lltvBps !== undefined
                ? { lltvBps: props.lltvBps }
                : {}),
            }}
          />
          {setBits.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">
                Active state bits
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {setBits.map((b) => (
                  <li
                    key={b.name}
                    title={b.plainLanguage}
                    className="inline-flex items-center gap-1 rounded-sm border border-risk-amber/60 bg-risk-amber/10 px-1.5 py-0.5 font-mono text-[10px] text-risk-amber"
                  >
                    {b.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
