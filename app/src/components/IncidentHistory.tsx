// IncidentHistory — D.5 Evidence: EmergencyGuardian state-transition log.
//
// m-do-7 / D9-2 closure (visual QA): the prior D.5 Technology category did
// not surface the incident-history sub-section synthesis §B.5 mandates.
// This component renders a placeholder card listing what will land once
// the SDK exposes EmergencyGuardian state-transition events via
// `decodeLoopEvent` over the indexer subscription.

interface IncidentTransition {
  /** Block number at which the transition fired. */
  block: bigint;
  /** Previous state. */
  from: "NONE" | "INVESTIGATING" | "MITIGATING" | "RESOLVED";
  /** New state. */
  to: "NONE" | "INVESTIGATING" | "MITIGATING" | "RESOLVED";
  /** Optional incident id / reason from the guardian event. */
  reason?: string;
}

interface IncidentHistoryProps {
  /** Sorted descending by block. undefined → loading; [] → no incidents. */
  transitions?: ReadonlyArray<IncidentTransition>;
}

export function IncidentHistory(
  props: IncidentHistoryProps,
): JSX.Element {
  const transitions = props.transitions;
  return (
    <section
      data-testid="incident-history"
      className="space-y-2"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Incident history (EmergencyGuardian)
      </h4>
      {transitions === undefined ? (
        <div
          data-testid="incident-history-pending"
          className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-text-muted"
        >
          Incident history (EmergencyGuardian state transitions) — pending
          SDK surface. The SDK currently exposes
          <code className="font-mono"> getAnchorFreshness</code> but not a
          paginated state-transition feed; the indexer's{" "}
          <code className="font-mono">/events</code> subscription will
          stream <code className="font-mono">EmergencyGuardian</code>{" "}
          state-transition events once the SDK round-trip lands.
        </div>
      ) : transitions.length === 0 ? (
        <div
          data-testid="incident-history-empty"
          className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-text-muted"
        >
          No incidents recorded.
        </div>
      ) : (
        <ol
          data-testid="incident-history-list"
          className="space-y-1 text-xs"
        >
          {transitions.map((t) => (
            <li
              key={`${t.block.toString()}-${t.from}-${t.to}`}
              data-testid={`incident-history-row-${t.block.toString()}`}
              className="rounded-md border border-border bg-surface-raised px-3 py-1.5"
            >
              <div className="font-mono">
                block {t.block.toString()}: {t.from} → {t.to}
              </div>
              {t.reason ? (
                <div className="mt-0.5 text-text-muted">{t.reason}</div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
