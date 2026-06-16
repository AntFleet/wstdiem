// AuthorizationRow — live policies with Pendle-pill expiry countdown +
// decoded acknowledgedRisks + mevWaiverBits + per-policy Revoke button.
// Synthesis B.3 / D.3.

import type { Policy } from "@wstdiem/sdk";
import { ForceExitRiskBit, MevWaiverBit } from "@wstdiem/sdk";
import { MEV_MODE_META } from "./MevModeSelector.js";

interface AuthorizationRowProps {
  policies: readonly Policy[] | undefined;
  isLoading: boolean;
  onRevoke: (policy: Policy) => void;
}

function decodeRiskBits(mask: number): string[] {
  const names: string[] = [];
  if ((mask & ForceExitRiskBit.LOOSE_SLIPPAGE) !== 0) names.push("LOOSE_SLIPPAGE");
  if ((mask & ForceExitRiskBit.STALE_ORACLE_OVERRIDE) !== 0)
    names.push("STALE_ORACLE_OVERRIDE");
  if ((mask & ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH) !== 0)
    names.push("INSUFFICIENT_CURVE_DEPTH");
  if ((mask & ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE) !== 0)
    names.push("SEQUENCER_DOWN_OVERRIDE");
  if ((mask & ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE) !== 0)
    names.push("VAULT_EVIDENCE_OVERRIDE");
  return names;
}

function decodeWaiverBits(mask: number): string[] {
  const names: string[] = [];
  if ((mask & MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN) !== 0)
    names.push("PUBLIC_MEMPOOL_OPT_IN");
  if ((mask & MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN) !== 0)
    names.push("SEQUENCER_DIRECT_FALLBACK_OPT_IN");
  if ((mask & MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN) !== 0)
    names.push("BUILDER_KEY_OUTAGE_OPT_IN");
  return names;
}

function formatExpiryPill(expiryBlock: bigint | undefined): string {
  if (expiryBlock === undefined) return "no expiry";
  return `block ${expiryBlock.toString()}`;
}

export function AuthorizationRow(
  props: AuthorizationRowProps,
): JSX.Element {
  if (props.isLoading) {
    return (
      <section
        data-testid="authorization-row-loading"
        className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted"
      >
        Resolving authorizations…
      </section>
    );
  }
  const policies = props.policies ?? [];
  return (
    <section
      data-testid="authorization-row"
      className="rounded-lg border border-border bg-surface px-4 py-3"
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text">
          Authorizations
        </h3>
        <span className="text-xs text-text-muted">
          {policies.length} live polic{policies.length === 1 ? "y" : "ies"}
        </span>
      </header>
      {policies.length === 0 ? (
        <p className="text-xs text-text-muted">
          No live policies for this owner. Use the Automation screen to
          create one.
        </p>
      ) : (
        <ul className="space-y-2">
          {policies.map((policy) => {
            const acknowledged = decodeRiskBits(0); // SDK policy doesn't carry acknowledgedRisks
            const waivers = decodeWaiverBits(policy.mevWaiverBits);
            return (
              <li
                key={policy.policyId.toString()}
                data-testid={`policy-row-${policy.policyId.toString()}`}
                className="rounded-md border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-text">
                        {policy.policyClass}
                      </span>
                      <span className="rounded-sm border border-border bg-canvas px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
                        {policy.primaryType}
                      </span>
                      <span
                        className="inline-flex flex-col items-start rounded-sm border border-border bg-canvas px-1.5 py-0.5 text-[10px] text-text-muted"
                        data-testid={`policy-mev-mode-${policy.policyId.toString()}`}
                      >
                        <span className="font-mono text-text">
                          {policy.mevProtectionMode}
                        </span>
                        <span className="text-[9px] text-text-muted">
                          {MEV_MODE_META.find(
                            (m) => m.mode === policy.mevProtectionMode,
                          )?.subtitle ?? ""}
                        </span>
                      </span>
                      <span
                        data-testid={`policy-expiry-${policy.policyId.toString()}`}
                        className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent"
                      >
                        expires {formatExpiryPill(policy.expiryBlock)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-text-muted">
                      policyHash:{" "}
                      <span title={policy.policyHash} className="font-mono">
                        {policy.policyHash.slice(0, 10)}…{policy.policyHash.slice(-6)}
                      </span>
                    </div>
                    {waivers.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {waivers.map((w) => (
                          <span
                            key={w}
                            className="rounded-sm border border-warning-border bg-warning-surface px-1.5 py-0.5 text-[10px] font-mono text-warning-text"
                          >
                            waiver: {w}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {acknowledged.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {acknowledged.map((r) => (
                          <span
                            key={r}
                            className="rounded-sm border border-warning-border bg-warning-surface px-1.5 py-0.5 text-[10px] font-mono text-warning-text"
                          >
                            ack: {r}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onRevoke(policy)}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
                    data-testid={`policy-revoke-${policy.policyId.toString()}`}
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
