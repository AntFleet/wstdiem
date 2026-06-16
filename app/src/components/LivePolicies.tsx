// LivePolicies — D.4 right pane per synthesis B.4 / D.4.
//
// Card per active policy showing keeper identity / next trigger / Pendle-pill
// expiry countdown / current matching bitmap / Revoke button. Permissionless
// fallback badge surfaces when the policy enables it (§13 keepers).

import type { Policy } from "@wstdiem/sdk";

interface LivePoliciesProps {
  policies: readonly Policy[] | undefined;
  isLoading: boolean;
  onRevoke: (policy: Policy) => void;
}

function formatExpiryPill(expiryBlock: bigint | undefined): string {
  if (expiryBlock === undefined) return "no expiry";
  return `expires block ${expiryBlock.toString()}`;
}

export function LivePolicies(props: LivePoliciesProps): JSX.Element {
  if (props.isLoading) {
    return (
      <section
        data-testid="live-policies-loading"
        className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted"
      >
        Loading live policies…
      </section>
    );
  }
  const policies = props.policies ?? [];
  return (
    <section
      data-testid="live-policies"
      className="rounded-lg border border-border bg-surface px-4 py-3"
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text">
          Live policies
        </h3>
        <span className="text-xs text-text-muted">
          {policies.length} active
        </span>
      </header>
      {policies.length === 0 ? (
        <p className="text-xs text-text-muted">
          No policies yet. Use the editor on the left to sign one.
        </p>
      ) : (
        <ul className="space-y-2">
          {policies.map((policy) => {
            const isPermissionless =
              policy.executionKind === "KEEPER_PERMISSIONLESS";
            return (
              <li
                key={policy.policyId.toString()}
                data-testid={`live-policy-${policy.policyId.toString()}`}
                className="rounded-md border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-text">
                        {policy.policyClass}
                      </span>
                      <span className="rounded-sm border border-border bg-canvas px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
                        {policy.mevProtectionMode}
                      </span>
                      <span
                        data-testid={`live-policy-expiry-${policy.policyId.toString()}`}
                        className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                      >
                        {formatExpiryPill(policy.expiryBlock)}
                      </span>
                      {isPermissionless ? (
                        <span
                          data-testid={`permissionless-badge-${policy.policyId.toString()}`}
                          className="rounded-sm border border-warning-border bg-warning-surface px-1.5 py-0.5 text-[10px] font-mono text-warning-text"
                          title="§13 keepers. Anyone may execute this policy when its condition is met."
                        >
                          permissionless fallback
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] text-text-muted">
                      Owner:{" "}
                      <span title={policy.owner} className="font-mono">
                        {policy.owner.slice(0, 6)}…{policy.owner.slice(-4)}
                      </span>
                      {" · "}
                      Trigger condition: derived from policy state
                      (decoded in Phase 5).
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onRevoke(policy)}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
                    data-testid={`live-policy-revoke-${policy.policyId.toString()}`}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
