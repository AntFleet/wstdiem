// FingerprintTable — Contract category table per integration.
// Synthesis B.5 / D.5 — address + EXTCODEHASH + ExternalProtocolFingerprint.

import type { ExternalProtocolFingerprint } from "@wstdiem/sdk";

interface FingerprintTableProps {
  fingerprints: readonly ExternalProtocolFingerprint[] | undefined;
  isLoading: boolean;
  error?: Error | null;
}

const STATUS_LABEL: Record<ExternalProtocolFingerprint["status"], string> = {
  match: "✓ verified",
  drift: "✗ drift",
  pendingUpdate: "⏳ pending update",
};

const STATUS_CLASS: Record<ExternalProtocolFingerprint["status"], string> = {
  match: "text-risk-green",
  drift: "text-risk-red",
  pendingUpdate: "text-risk-amber",
};

function truncate(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function FingerprintTable(
  props: FingerprintTableProps,
): JSX.Element {
  if (props.isLoading) {
    return (
      <div className="text-sm text-text-muted" data-testid="fingerprint-loading">
        Resolving registry-pinned fingerprints…
      </div>
    );
  }
  if (props.error) {
    return (
      <div
        className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning-text"
        data-testid="fingerprint-error"
      >
        Fingerprint fetch failed (fail-closed): {props.error.message}
      </div>
    );
  }
  const rows = props.fingerprints ?? [];
  if (rows.length === 0) {
    return (
      <div className="text-sm text-text-muted" data-testid="fingerprint-empty">
        No fingerprints registered for this market.
      </div>
    );
  }
  return (
    <table
      data-testid="fingerprint-table"
      className="w-full text-left text-xs"
    >
      <thead className="text-text-muted">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Integration</th>
          <th className="py-1.5 pr-3 font-medium">Address</th>
          <th className="py-1.5 pr-3 font-medium">Fingerprint</th>
          <th className="py-1.5 pr-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="font-mono text-text">
        {rows.map((row) => (
          <tr
            key={`${row.integrationKind}-${row.sourceAddress}`}
            className="border-t border-border/60"
            data-testid={`fingerprint-row-${row.integrationKind}`}
          >
            <td className="py-1.5 pr-3">{row.integrationKind}</td>
            <td className="py-1.5 pr-3" title={row.sourceAddress}>
              {truncate(row.sourceAddress)}
            </td>
            <td className="py-1.5 pr-3" title={row.fingerprint}>
              {truncate(row.fingerprint)}
            </td>
            <td className={`py-1.5 pr-3 ${STATUS_CLASS[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
