// EventTimeline — LoopActionStarted → LoopActionStep → LoopActionCompleted.
// Synthesis D.3. Phase 4 ships the structural timeline; Phase 5 wires
// the indexer subscription via sdk.decodeLoopEvent.

export interface TimelineEvent {
  id: string;
  /** Display name (e.g. "LoopActionStarted"). */
  kind: string;
  /** Block number when the event was indexed. */
  blockNumber: bigint;
  /** Transaction hash. */
  txHash: string;
  /** Decoded params as JSON-serializable record. */
  params: Record<string, unknown>;
  /** Whether the event has reached finality on Base. */
  finalized: boolean;
}

interface EventTimelineProps {
  events: readonly TimelineEvent[];
  isLoading: boolean;
}

function truncateHash(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export function EventTimeline(props: EventTimelineProps): JSX.Element {
  if (props.isLoading) {
    return (
      <section
        data-testid="event-timeline-loading"
        className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted"
      >
        Loading event history…
      </section>
    );
  }
  return (
    <section
      data-testid="event-timeline"
      className="rounded-lg border border-border bg-surface px-4 py-3"
    >
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text">
        Event timeline
      </h3>
      {props.events.length === 0 ? (
        <p className="text-xs text-text-muted">
          No events indexed for this position yet. Sign an authorization to
          start the LoopActionStarted → LoopActionStep → LoopActionCompleted
          envelope.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {props.events.map((e) => (
            <li
              key={e.id}
              data-testid={`event-row-${e.id}`}
              data-finalized={e.finalized}
              className="flex items-start gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs"
            >
              <span
                aria-hidden="true"
                className={`mt-1 inline-block h-2 w-2 rounded-full ${
                  e.finalized ? "bg-risk-green" : "bg-risk-amber"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-text">{e.kind}</span>
                  <span className="font-mono text-[10px] text-text-muted">
                    block {e.blockNumber.toString()}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-text-muted">
                  tx: {truncateHash(e.txHash)}
                  {e.finalized ? " · finalized" : " · pending"}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
