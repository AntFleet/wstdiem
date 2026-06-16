// D.5 Evidence — Spark six-category taxonomy + state-bit grid + audit-gate
// top + parameter disclosure + export. Synthesis B.5 / D.5.
//
// This screen is the lowest-novelty Phase 1 surface — every cell pulls from
// SDK reads the live SDK already implements. It also doubles as the canonical
// reference for §13.4 disclosure categories.

import { useQuery } from "@tanstack/react-query";
import { useSdk } from "../hooks/useSdk.js";
import { useMarketContext } from "../hooks/useMarketContext.js";
import { useReadiness } from "../hooks/useReadiness.js";
import { useStateBitmap } from "../hooks/useStateBitmap.js";
import { useAnchorFreshness } from "../hooks/useAnchorFreshness.js";
import { StateBitGrid } from "../components/StateBitGrid.js";
import {
  RiskCategoryCard,
  RISK_CATEGORY_META,
} from "../components/RiskCategoryTable.js";
import { FingerprintTable } from "../components/FingerprintTable.js";
import {
  ParameterDisclosureTable,
  PHASE_1_DISCLOSED_PARAMETERS,
} from "../components/ParameterDisclosureTable.js";
import { EvidenceExportButton } from "../components/EvidenceExportButton.js";
import { IncidentHistory } from "../components/IncidentHistory.js";
import { StateBit } from "@wstdiem/sdk";

const BUILD_HASH = (import.meta.env.VITE_BUILD_HASH as string | undefined) ?? "dev";

export function Evidence(): JSX.Element {
  const { sdk, chainId, indexerBaseUrl, singleClientMode } = useSdk();
  const { activeMarket } = useMarketContext();
  const readinessQuery = useReadiness({ market: activeMarket });
  const stateBitmapQuery = useStateBitmap(activeMarket);
  const anchorQuery = useAnchorFreshness();

  const fingerprintsQuery = useQuery({
    queryKey: ["fingerprints", activeMarket ?? "no-market"],
    queryFn: async () => {
      if (!activeMarket) throw new Error("market required");
      return sdk.getExternalProtocolFingerprints(activeMarket);
    },
    enabled: Boolean(activeMarket),
    retry: false,
  });

  const evidenceBundleQuery = useQuery({
    queryKey: ["evidence-bundle", activeMarket ?? "no-market"],
    queryFn: async () => {
      if (!activeMarket) throw new Error("market required");
      return sdk.getMarketEvidence(activeMarket);
    },
    enabled: Boolean(activeMarket),
    retry: false,
  });

  const canonicalErrorsQuery = useQuery({
    queryKey: ["canonical-errors"],
    queryFn: () => sdk.getCanonicalErrors(),
    retry: false,
  });

  const bitmap = stateBitmapQuery.data?.stateBitmap;
  const auditClosed =
    bitmap !== undefined &&
    (bitmap & StateBit.AUDIT_GATE_CLOSED) === StateBit.AUDIT_GATE_CLOSED;
  const quorum = readinessQuery.data?.rpcQuorum;

  return (
    <div className="space-y-6" data-testid="evidence-screen">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">Evidence</h2>
          <p className="text-sm text-text-muted">
            The full disclosure surface the §13.4 acceptance row "evidence
            download" maps to. Read-only.
          </p>
        </div>
        <EvidenceExportButton
          bundle={evidenceBundleQuery.data}
          filename={`wstdiem-evidence-${activeMarket?.slice(2, 10) ?? "unknown"}`}
        />
      </header>

      <section
        data-testid="audit-gate-summary"
        className={`rounded-lg border px-4 py-3 ${
          auditClosed
            ? "border-warning-border bg-warning-surface text-warning-text"
            : "border-border bg-surface text-text"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true">{auditClosed ? "✗" : "✓"}</span>
          Audit gate {auditClosed ? "closed" : "open"}
        </div>
        <p className="mt-1 text-xs opacity-90">
          {auditClosed
            ? "All actions blocked except Revoke. Reclose-condition checklist follows the §5.4 conditions; PR-16 follow-up surfaces per-condition green/red."
            : "All registry-recognised actions are eligible for the bitmap-derived predicates below."}
        </p>
      </section>

      <section data-testid="state-bit-grid-section">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text">
          State bitmap
        </h3>
        <StateBitGrid bitmap={bitmap} />
        <p className="mt-2 text-xs text-text-muted">
          11 named bits + 5 reserved (uint16 layout). Unknown high bits trigger
          a fail-closed posture per synthesis §G15.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <RiskCategoryCard id="frontend" {...RISK_CATEGORY_META.frontend}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-text-muted">Build hash</dt>
            <dd className="font-mono text-text">{BUILD_HASH}</dd>
            <dt className="text-text-muted">Indexer endpoint</dt>
            <dd className="font-mono text-text break-all">{indexerBaseUrl}</dd>
            <dt className="text-text-muted">Chain id</dt>
            <dd className="font-mono text-text">{chainId}</dd>
            <dt className="text-text-muted">Single-client mode</dt>
            <dd className="font-mono text-text">
              {singleClientMode ? "yes (dev only)" : "no"}
            </dd>
          </dl>
        </RiskCategoryCard>

        <RiskCategoryCard id="contract" {...RISK_CATEGORY_META.contract}>
          <FingerprintTable
            fingerprints={fingerprintsQuery.data}
            isLoading={fingerprintsQuery.isLoading}
            error={fingerprintsQuery.error as Error | null}
          />
        </RiskCategoryCard>

        <RiskCategoryCard id="market" {...RISK_CATEGORY_META.market}>
          {readinessQuery.isLoading ? (
            <div className="text-sm text-text-muted">Resolving readiness…</div>
          ) : readinessQuery.isError ? (
            <div className="text-sm text-warning-text">
              Readiness fetch failed (fail-closed):{" "}
              {readinessQuery.error?.message}
            </div>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-text-muted">Block</dt>
              <dd className="font-mono text-text">
                {readinessQuery.data?.blockNumber.toString() ?? "—"}
              </dd>
              <dt className="text-text-muted">Sequencer</dt>
              <dd className="font-mono text-text">
                {readinessQuery.data?.sequencer ?? "—"}
              </dd>
              <dt className="text-text-muted">Sources tracked</dt>
              <dd className="font-mono text-text">
                {readinessQuery.data?.sources.length ?? 0}
              </dd>
            </dl>
          )}
        </RiskCategoryCard>

        <RiskCategoryCard
          id="liquidation"
          {...RISK_CATEGORY_META.liquidation}
        >
          <p className="text-xs text-text-muted">
            Per-position HF range and recent Morpho liquidations land in Phase
            4 (D.3 Positions). Phase 1 surfaces the read-side primitives only.
          </p>
        </RiskCategoryCard>

        <RiskCategoryCard id="technology" {...RISK_CATEGORY_META.technology}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-text-muted">Anchor status</dt>
            <dd className="font-mono text-text">
              {anchorQuery.data?.status ?? "—"}
            </dd>
            <dt className="text-text-muted">Last anchored</dt>
            <dd className="font-mono text-text">
              {anchorQuery.data?.lastAnchoredBlock.toString() ?? "—"}
            </dd>
            <dt className="text-text-muted">Max stale</dt>
            <dd className="font-mono text-text">
              {anchorQuery.data?.anchorMaxStaleBlocks ?? "—"} blocks
            </dd>
            <dt className="text-text-muted">Emergency mult.</dt>
            <dd className="font-mono text-text">
              {anchorQuery.data?.anchorEmergencyMultiplier ?? "—"}×
            </dd>
            <dt className="text-text-muted">RPC quorum</dt>
            <dd className="font-mono text-text">
              {quorum
                ? `${quorum.matchedFamilies.length}/${quorum.size} (${quorum.status})`
                : "—"}
            </dd>
            <dt className="text-text-muted">Provider families</dt>
            <dd className="font-mono text-text">
              {quorum?.providerFamilies.join(", ") || "—"}
            </dd>
          </dl>
          {/* m-do-7 / D9-2 closure: EmergencyGuardian state-transition log.
              Placeholder until SDK surface lands. */}
          <div className="mt-3 border-t border-border/60 pt-3">
            <IncidentHistory />
          </div>
        </RiskCategoryCard>

        <RiskCategoryCard id="governance" {...RISK_CATEGORY_META.governance}>
          <ParameterDisclosureTable
            parameters={PHASE_1_DISCLOSED_PARAMETERS}
          />
          <p className="mt-2 text-xs text-text-muted">
            Phase 1 fallback set. Full per-parameter resolution (current value,
            owner address, last-changed block) requires LoopRegistry surface
            extension — PR-16 follow-up.
          </p>
        </RiskCategoryCard>
      </div>

      <section data-testid="canonical-errors-section">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text">
          Canonical errors (§5.5 selector parity)
        </h3>
        {canonicalErrorsQuery.isLoading ? (
          <div className="text-sm text-text-muted">Loading registry…</div>
        ) : canonicalErrorsQuery.isError ? (
          <div className="text-sm text-warning-text">
            Canonical error registry fetch failed.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-muted">
            {canonicalErrorsQuery.data?.length ?? 0} canonical errors registered.
            Phase 3 surfaces the full table in the §10 Failure Conditions
            section; Phase 5 builds a top-level browser here.
          </div>
        )}
      </section>
    </div>
  );
}
