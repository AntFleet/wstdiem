// StateBitmapBanner — persistent global banner under the nav.
//
// Appears when:
//   - AUDIT_GATE_CLOSED is set (synthesis C.5)
//   - Any incident bit is set (INCIDENT_INVESTIGATING / INCIDENT_MITIGATING)
//   - Any other named state-bit is set (per synthesis C.3)
//
// Synthesis G.3 mandates SHAPE-changes on state transition (not just color) to
// defeat banner blindness. We render distinct shapes per severity bucket:
//   - Audit-gate closed: full-width bar with diamond left-cap.
//   - Incident: full-width bar with circle left-cap + pulsing dot.
//   - Other named bits: full-width bar with square left-cap.

import { StateBit } from "@wstdiem/sdk";
import { setBitsIn, hasUnknownBits } from "../lib/state-bits.js";
import { describeBitForBanner } from "../lib/state-bit-matrix.js";

interface StateBitmapBannerProps {
  bitmap: number | undefined;
}

type Severity = "audit-gate" | "incident" | "named" | "unknown" | "none";

function classify(bitmap: number | undefined): Severity {
  if (bitmap === undefined) return "none";
  if (hasUnknownBits(bitmap)) return "unknown";
  if ((bitmap & StateBit.AUDIT_GATE_CLOSED) === StateBit.AUDIT_GATE_CLOSED) {
    return "audit-gate";
  }
  if (
    (bitmap & StateBit.INCIDENT_INVESTIGATING) === StateBit.INCIDENT_INVESTIGATING ||
    (bitmap & StateBit.INCIDENT_MITIGATING) === StateBit.INCIDENT_MITIGATING
  ) {
    return "incident";
  }
  if (bitmap !== 0) return "named";
  return "none";
}

const SHAPE: Record<Severity, string> = {
  // Audit gate: diamond (rotated square)
  "audit-gate": "rotate-45",
  // Incident: pulsing circle
  incident: "rounded-full animate-pulse",
  // Other named bits: square
  named: "",
  // Unknown high bits: hexagon-ish via clip-path (kept simple as rounded square)
  unknown: "rounded-sm",
  none: "",
};

const SEVERITY_CLASS: Record<Severity, string> = {
  "audit-gate": "border-warning-border bg-warning-surface text-warning-text",
  incident: "border-warning-border bg-warning-surface text-warning-text",
  named: "border-risk-amber/60 bg-risk-amber/10 text-risk-amber",
  unknown: "border-warning-border bg-warning-surface text-warning-text",
  none: "",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  "audit-gate": "Audit gate closed",
  incident: "Incident in progress",
  named: "Protocol state degraded",
  unknown: "Unknown state bits set",
  none: "",
};

export function StateBitmapBanner(props: StateBitmapBannerProps): JSX.Element | null {
  const severity = classify(props.bitmap);
  if (severity === "none" || props.bitmap === undefined) return null;

  const set = props.bitmap !== undefined ? setBitsIn(props.bitmap) : [];

  return (
    <div
      role="alert"
      data-testid="state-bitmap-banner"
      data-severity={severity}
      className={`w-full border-b px-4 py-2.5 ${SEVERITY_CLASS[severity]}`}
    >
      <div className="mx-auto flex max-w-[1280px] items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-1.5 inline-block h-3 w-3 shrink-0 bg-current ${SHAPE[severity]}`}
        />
        <div className="flex-1 text-sm">
          <div className="font-medium">{SEVERITY_LABEL[severity]}</div>
          {severity === "audit-gate" ? (
            <div className="text-xs opacity-90">
              Open / Rebalance / Exit / Force-Exit blocked. Revoke remains
              available.
            </div>
          ) : null}
          {severity === "unknown" ? (
            <div className="text-xs opacity-90">
              Bitmap contains bits beyond the 11 known slots — the SDK is
              treating every action as blocked (fail-closed). Refresh after a
              registry upgrade.
            </div>
          ) : null}
          {set.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {set.map((b) => (
                <li
                  key={b.name}
                  className="inline-flex items-center gap-1 rounded-sm border border-current/30 bg-current/10 px-1.5 py-0.5 text-xs"
                  title={b.plainLanguage}
                >
                  <code className="font-mono">{b.name}</code>
                </li>
              ))}
            </ul>
          ) : null}
          {(severity === "named" || severity === "incident") &&
          set.length > 0 ? (
            <div
              data-testid="state-bitmap-banner-matrix"
              className="mt-2 space-y-1 text-xs opacity-90"
            >
              {set
                .filter((b) => b.mask !== undefined)
                .map((b) => (
                  <div
                    key={`matrix-${b.name}`}
                    data-testid={`state-bitmap-banner-matrix-row-${b.name}`}
                  >
                    {describeBitForBanner(b.mask as number, b.name)}
                  </div>
                ))}
              <div className="text-[10px] opacity-75">
                Per §7.1 rows {set.map((b) => b.name).join(", ")}.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
