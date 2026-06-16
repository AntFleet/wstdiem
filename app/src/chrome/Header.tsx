// Header — persistent nav strip + HF strip + audit-gate badge + state-pill +
// wallet + theme toggle. Synthesis §D, lines 336-344.
//
// The HF and state-bit summary read from a marketContext-bound source for
// Phase 1: when no Phase 1 market is configured (or no read has resolved),
// the strip surfaces the "—" sentinel + "Awaiting indexer / RPC" indicator
// rather than silently rendering zeros.
//
// M-4 closure: persistent HF gauge sits in the strip. The gauge reads the
// active market + connected owner and renders the worst HF across the
// user's positions. Synthesis §D anchor: HF is the single most-repeated
// convergence across Aave/Spark/Morpho/Summer.fi/DeFi Saver (synthesis A.1).

import { Link, NavLink } from "react-router-dom";
import { useStateBitmap } from "../hooks/useStateBitmap.js";
import { useAnchorFreshness } from "../hooks/useAnchorFreshness.js";
import { usePositions } from "../hooks/usePositions.js";
import { useSdk } from "../hooks/useSdk.js";
import { useConnectedAccount } from "../wallet/index.js";
import { HealthFactorGauge } from "../components/HealthFactorGauge.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { WalletPill } from "./WalletPill.js";
import { setBitsIn, hasUnknownBits } from "../lib/state-bits.js";
import type { MarketId } from "@wstdiem/sdk";
import { StateBit } from "@wstdiem/sdk";

const ROUTES: ReadonlyArray<{ to: string; label: string; testid: string }> = [
  { to: "/markets", label: "Markets", testid: "nav-markets" },
  { to: "/loop", label: "Loop", testid: "nav-loop" },
  { to: "/positions", label: "Positions", testid: "nav-positions" },
  { to: "/automation", label: "Automation", testid: "nav-automation" },
  { to: "/evidence", label: "Evidence", testid: "nav-evidence" },
];

interface HeaderProps {
  /** Phase 1 market id; when undefined, the state-bit + audit-gate strip
   * shows the awaiting-data state. */
  market?: MarketId | undefined;
}

function navClassName({ isActive }: { isActive: boolean }): string {
  return `inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${
    isActive
      ? "bg-surface-raised text-text"
      : "text-text-muted hover:text-text hover:bg-surface-raised/50"
  }`;
}

export function Header(props: HeaderProps): JSX.Element {
  const {
    singleClientMode,
    rpcQuorumDegradedAtInit,
    indexerSignatureVerificationDisabled,
  } = useSdk();
  const stateBitmapQuery = useStateBitmap(props.market);
  const anchorQuery = useAnchorFreshness();
  const account = useConnectedAccount();
  // M-4 closure: persistent HF gauge in the strip. Phase 1 ships ONE
  // market; the gauge reads the (owner, activeMarket) pair. When more
  // markets land in Phase 5, hoist this to walk every (owner, market) pair
  // and surface the worst HF.
  const positionQuery = usePositions({
    market: props.market,
    owner: account.address,
  });
  const positionHfWad = positionQuery.data?.healthFactorWad;

  const bitmap = stateBitmapQuery.data?.stateBitmap;
  const auditClosed =
    bitmap !== undefined &&
    (bitmap & StateBit.AUDIT_GATE_CLOSED) === StateBit.AUDIT_GATE_CLOSED;
  const setBits = bitmap !== undefined ? setBitsIn(bitmap) : [];
  const unknownBits = bitmap !== undefined && hasUnknownBits(bitmap);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-base font-semibold tracking-tight text-text"
            data-testid="brand-mark"
          >
            wstDIEM
          </a>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {ROUTES.map((r) => (
              <NavLink
                key={r.to}
                to={r.to}
                className={navClassName}
                data-testid={r.testid}
              >
                {r.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <WalletPill />
        </div>
      </div>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 border-t border-border/60 px-4 py-1.5 text-xs">
        {/* M-4 closure: persistent HF gauge sits first per synthesis §D
            anchor ordering. Sentinel rendered explicitly when the read has
            not resolved (HEALTH_INDETERMINATE) per §10 mandatory
            disclosure. Click target: when a connected user has a position
            with a resolved HF, the gauge navigates to /positions; otherwise
            it is non-interactive. */}
        {account.isConnected && positionHfWad !== undefined ? (
          <Link
            to="/positions"
            data-testid="header-hf-gauge"
            data-interactive="true"
            aria-label="Open positions"
            className="rounded-md focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <HealthFactorGauge
              size="sm"
              healthFactorWad={positionHfWad}
              showSentinelOnIndeterminate
            />
          </Link>
        ) : (
          <span data-testid="header-hf-gauge" data-interactive="false">
            <HealthFactorGauge
              size="sm"
              healthFactorWad={positionHfWad}
              showSentinelOnIndeterminate
            />
          </span>
        )}

        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 ${
            auditClosed
              ? "border-warning-border bg-warning-surface text-warning-text"
              : "border-border bg-surface-raised text-text-muted"
          }`}
          data-testid="audit-gate-badge"
          data-state={auditClosed ? "closed" : "open"}
        >
          <span aria-hidden="true">{auditClosed ? "✗" : "✓"}</span>
          <span>Audit gate: {auditClosed ? "closed" : "open"}</span>
        </span>

        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 ${
            unknownBits
              ? "border-warning-border bg-warning-surface text-warning-text"
              : setBits.length === 0
              ? "border-border bg-surface-raised text-risk-green"
              : "border-risk-amber/60 bg-risk-amber/10 text-risk-amber"
          }`}
          data-testid="state-pill"
          data-bits={setBits.length}
        >
          <span aria-hidden="true">
            {unknownBits ? "⚠" : setBits.length === 0 ? "🟢" : "🟡"}
          </span>
          <span>
            State:{" "}
            {bitmap === undefined
              ? "awaiting indexer"
              : unknownBits
              ? "unknown bits set"
              : setBits.length === 0
              ? "all green"
              : `${setBits.length} bit${setBits.length > 1 ? "s" : ""} set`}
          </span>
        </span>

        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-0.5 text-text-muted"
          data-testid="anchor-pill"
          data-status={anchorQuery.data?.status ?? "unknown"}
        >
          <span aria-hidden="true">
            {anchorQuery.data?.status === "fresh"
              ? "🟢"
              : anchorQuery.data?.status === "degraded"
              ? "🟡"
              : anchorQuery.data?.status === "emergencyStale"
              ? "🔴"
              : "·"}
          </span>
          <span>Anchor: {anchorQuery.data?.status ?? "—"}</span>
        </span>

        {singleClientMode ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-risk-amber/60 bg-risk-amber/10 px-2 py-0.5 text-risk-amber"
            data-testid="single-client-warning"
            title="VITE_ALLOW_SINGLE_CLIENT_READS=true — DEV ONLY. Production deployments fail-close on this posture."
          >
            <span aria-hidden="true">⚠</span>
            <span>Single-client reads (dev)</span>
          </span>
        ) : null}

        {!singleClientMode && rpcQuorumDegradedAtInit ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-risk-red/60 bg-risk-red/10 px-2 py-0.5 text-risk-red"
            data-testid="quorum-degraded-warning"
            title="Fewer than 2 distinct provider families configured. G-PM-3 will block signing."
          >
            <span aria-hidden="true">⚠</span>
            <span>RPC quorum: 1 family</span>
          </span>
        ) : null}

        {indexerSignatureVerificationDisabled ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-risk-amber/60 bg-risk-amber/10 px-2 py-0.5 text-risk-amber"
            data-testid="indexer-key-warning"
            title="VITE_INDEXER_PUBKEY unset — indexer signatures NOT verified. Dev only; production boot fails closed on this posture (PR-14 H-3)."
          >
            <span aria-hidden="true">⚠</span>
            <span>Indexer signature verification disabled (dev only)</span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
