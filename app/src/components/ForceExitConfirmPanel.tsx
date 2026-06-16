// ForceExitConfirmPanel — FULL-SCREEN takeover. Synthesis C.1 + §6.3.
//
// Owns the entire viewport when open. Distinct visual treatment from the
// §10 standard preview drawer:
//   - Red warning chrome on every surface
//   - Warning ⚠ icon + "Force-Exit" header
//   - Decoded verifyingContract banner: the contract NAME is RESOLVED from
//     the action's verifyingContract via authorizerNameFor() (C-1 closure)
//     — a primaryType-name mismatch surfaces a blocker banner and disables
//     the sign button regardless of other gates.
//   - Explicit anti-phishing copy: "A normal exit uses LoopAuthorization.
//     They are not interchangeable."
//   - Distinct primaryType display (ForceExit)
//   - Decoded bounds (force=true / maxCollateralSold / minRepayment / expiry)
//   - PerBitChecklist over acknowledgedRisks
//   - TypedConfirmInput requiring literal "FORCE-EXIT"
//   - DwellCountdown ≥ 3 seconds, only armed after typed-confirm + all bits
//   - External-gate override (M-1 closure): wallet / chain / G-PM gates
//     surface as reasons in a blocker banner.
//
// Cancel button always available — user can back out at any stage.

import { useEffect } from "react";
import type { ForceExitAction } from "@wstdiem/sdk";
import { PerBitChecklist } from "./PerBitChecklist.js";
import { TypedConfirmInput } from "./TypedConfirmInput.js";
import { DwellCountdown } from "./DwellCountdown.js";
import {
  FORCE_EXIT_TYPED_TOKEN,
  useForceExitFlow,
} from "../hooks/useForceExitFlow.js";
import { FORCE_EXIT_RISK_BITS } from "../lib/risk-bits.js";
import {
  authorizerNameFor,
  expectedAuthorizerFor,
} from "../lib/contracts.js";

export interface ForceExitSignOverrideReason {
  code: string;
  message: string;
}

interface ForceExitConfirmPanelProps {
  /** The ForceExit action the user is about to sign — decoded fields are
   * surfaced verbatim from this. */
  action: ForceExitAction;
  /** Called when the user clicks Sign after all gates pass. Implementation
   * wires the wallet typed-data sign + attachSignature in Phase 3. */
  onSign: () => Promise<void> | void;
  /** Called when the user cancels (button click or Esc). */
  onCancel: () => void;
  /** When true, every external gate (wallet / chain / G-PM / RPC quorum /
   * indexer key) has surfaced a blocker — the sign button is disabled
   * regardless of the local dwell / typed-confirm / per-bit gates.
   * Wired in M-1 closure from Positions caller. */
  signOverrideDisabled?: boolean;
  /** Plain-language reasons rendered above the sign block when
   * signOverrideDisabled is true. */
  signOverrideReasons?: ReadonlyArray<ForceExitSignOverrideReason>;
}

function formatBigint(value: bigint): string {
  return value.toString();
}

function formatExpiry(deadline: bigint): string {
  // The action.deadline is UnixSeconds. Format both block-relative (raw) and
  // a wall-clock approximation so the user can sanity-check.
  const dateMs = Number(deadline) * 1000;
  if (!Number.isFinite(dateMs) || dateMs <= 0) return deadline.toString();
  const d = new Date(dateMs);
  return `${deadline.toString()} (${d.toISOString()})`;
}

function truncate(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

export function ForceExitConfirmPanel(
  props: ForceExitConfirmPanelProps,
): JSX.Element {
  const flow = useForceExitFlow({
    acknowledgedRisks: props.action.bounds.acknowledgedRisks,
    bitRegistry: FORCE_EXIT_RISK_BITS,
  });

  // C-1 closure: resolve the authorizer NAME from the actual
  // verifyingContract address. A mismatch between primaryType ("ForceExit"
  // ⇒ LoopForceExitAuthorizer) and the resolved name is a hard sign-block.
  const expectedAuthorizer = expectedAuthorizerFor(props.action.primaryType);
  const resolvedAuthorizer = authorizerNameFor(
    props.action.verifyingContract,
  );
  const authorizerMismatch = resolvedAuthorizer !== expectedAuthorizer;

  // M-1 closure: external override gate from caller. Combines with C-1
  // mismatch + the local dwell / typed / per-bit gates.
  const externalOverrideDisabled = Boolean(props.signOverrideDisabled);
  const externalReasons = props.signOverrideReasons ?? [];

  // Esc cancels. Capture-phase so even nested focus doesn't swallow it.
  // Depends only on the specific callback ref + the signing flag — full
  // `props` would rebind the listener every parent render (M-6 closure).
  const onCancel = props.onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !flow.signing) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow.signing, onCancel]);

  // Combined sign-enable: every local gate clear AND no authorizer
  // mismatch AND no external override.
  const signEnabled =
    flow.signEnabled && !authorizerMismatch && !externalOverrideDisabled;

  const onSignClick = async (): Promise<void> => {
    if (!signEnabled) return;
    flow.setSigning(true);
    try {
      await props.onSign();
    } finally {
      flow.setSigning(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-exit-title"
      data-testid="force-exit-confirm-panel"
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas"
    >
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-8">
        <header
          className="flex items-start justify-between gap-4 rounded-lg border-2 border-warning-border bg-warning-surface px-5 py-4 text-warning-text"
          data-testid="force-exit-header"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 text-2xl leading-none"
            >
              ⚠
            </span>
            <div>
              <h1
                id="force-exit-title"
                className="text-lg font-semibold tracking-tight"
              >
                Force-Exit
              </h1>
              <p className="mt-0.5 text-sm">
                You are about to sign a destructive irreversible authorization.
                Force-Exit unwinds the loop under degraded protocol state,
                accepting risks the standard Exit refuses.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={props.onCancel}
            disabled={flow.signing}
            className="rounded-md border border-warning-border bg-canvas px-3 py-1.5 text-xs text-text hover:bg-surface focus:outline-none focus:ring-2 focus:ring-warning-border disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="force-exit-cancel"
          >
            Cancel
          </button>
        </header>

        {authorizerMismatch ? (
          <section
            className="rounded-lg border-2 border-warning-border bg-warning-surface px-4 py-3 text-warning-text"
            data-testid="force-exit-authorizer-mismatch"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 text-lg">
                ⚠
              </span>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">
                  Verifying contract does not resolve to{" "}
                  <code className="font-mono">{expectedAuthorizer}</code>.
                </div>
                <div>
                  Expected:{" "}
                  <code className="font-mono">{expectedAuthorizer}</code>.
                  Actual:{" "}
                  <code className="font-mono" data-testid="resolved-authorizer">
                    {resolvedAuthorizer}
                  </code>
                  . Sign blocked.
                </div>
                <div className="font-mono text-xs opacity-90 break-all">
                  verifyingContract = {props.action.verifyingContract}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section
          className="rounded-lg border border-warning-border bg-surface px-4 py-3"
          data-testid="force-exit-phishing-banner"
        >
          <div className="text-sm">
            <div className="font-semibold text-text">
              Contract:{" "}
              <code
                className="font-mono"
                data-testid="force-exit-resolved-name"
              >
                {resolvedAuthorizer}
              </code>
            </div>
            <div className="mt-1 font-mono text-xs text-text-muted break-all">
              verifyingContract = {props.action.verifyingContract}
            </div>
            <p className="mt-2 text-text">
              A normal exit uses{" "}
              <code className="font-mono">LoopAuthorization</code>. They are
              not interchangeable. If your wallet shows a different contract
              name, abort and report to security.
            </p>
            <div className="mt-2 text-xs text-text-muted">
              primaryType ={" "}
              <code className="font-mono text-text">
                {props.action.primaryType}
              </code>
            </div>
          </div>
        </section>

        {externalOverrideDisabled && externalReasons.length > 0 ? (
          <section
            className="rounded-lg border-2 border-warning-border bg-warning-surface px-4 py-3 text-warning-text"
            data-testid="force-exit-override-reasons"
            role="alert"
          >
            <div className="text-sm font-semibold">
              Sign blocked — every reason must clear before this action can
              be signed:
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {externalReasons.map((r) => (
                <li
                  key={r.code}
                  data-testid={`force-exit-override-reason-${r.code}`}
                  className="flex items-start gap-2"
                >
                  <span aria-hidden="true" className="font-mono">
                    ✗
                  </span>
                  <span>
                    <code className="font-mono">{r.code}</code> — {r.message}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          className="rounded-lg border border-border bg-surface px-4 py-3"
          data-testid="force-exit-decoded-fields"
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Decoded fields
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-text-muted">primaryType</dt>
            <dd className="font-mono text-text">{props.action.primaryType}</dd>
            <dt className="text-text-muted">force</dt>
            <dd className="font-mono text-text">true</dd>
            <dt className="text-text-muted">maxCollateralSold</dt>
            <dd className="font-mono text-text">
              {formatBigint(props.action.bounds.maxCollateralSold)}
            </dd>
            <dt className="text-text-muted">minRepayment</dt>
            <dd className="font-mono text-text">
              {formatBigint(props.action.bounds.minRepayment)}
            </dd>
            <dt className="text-text-muted">deadline (expiry)</dt>
            <dd className="font-mono text-text">
              {formatExpiry(props.action.deadline)}
            </dd>
            <dt className="text-text-muted">looseSlippageBps</dt>
            <dd className="font-mono text-text">
              {props.action.bounds.looseSlippageBps} bps
            </dd>
            <dt className="text-text-muted">acknowledgedRisks (mask)</dt>
            <dd className="font-mono text-text">
              {`0x${props.action.bounds.acknowledgedRisks.toString(16).padStart(2, "0")}`}
            </dd>
            <dt className="text-text-muted">market</dt>
            <dd
              className="font-mono text-text break-all"
              title={props.action.market}
            >
              {truncate(props.action.market)}
            </dd>
            <dt className="text-text-muted">owner</dt>
            <dd
              className="font-mono text-text break-all"
              title={props.action.owner}
            >
              {truncate(props.action.owner)}
            </dd>
          </dl>
        </section>

        <section
          className="rounded-lg border border-border bg-surface px-4 py-3"
          data-testid="force-exit-risks-checklist"
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Acknowledge each risk
          </h2>
          <p className="mb-3 text-xs text-text-muted">
            Check every box. Each box represents a protection the standard
            Exit enforces but Force-Exit waives.
          </p>
          <PerBitChecklist
            registry={FORCE_EXIT_RISK_BITS}
            bitmap={props.action.bounds.acknowledgedRisks}
            checked={flow.checkedBits}
            onChange={flow.setCheckedBits}
            disabled={flow.signing}
            testId="force-exit-risks-checklist-inner"
          />
        </section>

        <section
          className="rounded-lg border border-border bg-surface px-4 py-3"
          data-testid="force-exit-typed-confirm-section"
        >
          <TypedConfirmInput
            expected={FORCE_EXIT_TYPED_TOKEN}
            value={flow.typedConfirm}
            onChange={flow.setTypedConfirm}
            disabled={flow.signing || !flow.allBitsChecked}
            label="Typed confirmation"
            hint={
              flow.allBitsChecked
                ? undefined
                : "Check every risk above before typing."
            }
          />
        </section>

        <section
          className="rounded-lg border border-warning-border bg-warning-surface px-4 py-3"
          data-testid="force-exit-dwell-section"
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning-text">
            Dwell countdown
          </h2>
          {flow.armed ? (
            <DwellCountdown
              armed={flow.armed}
              durationMs={3000}
              onElapsed={flow.markDwellElapsed}
            />
          ) : (
            <div
              data-testid="dwell-countdown-idle"
              className="text-xs text-warning-text"
            >
              Countdown starts after typed-confirm passes and every risk is
              acknowledged.
            </div>
          )}
        </section>

        <footer className="flex items-center justify-end gap-2 pb-8">
          <button
            type="button"
            onClick={props.onCancel}
            disabled={flow.signing}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="force-exit-cancel-bottom"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void onSignClick();
            }}
            disabled={!signEnabled}
            className={`rounded-md border px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 ${
              signEnabled
                ? "border-warning-border bg-warning-border text-canvas hover:opacity-90 focus:ring-warning-border"
                : "cursor-not-allowed border-border bg-surface-raised text-text-muted focus:ring-border"
            }`}
            data-testid="force-exit-sign"
            data-enabled={signEnabled}
            data-authorizer-mismatch={authorizerMismatch}
            data-external-override={externalOverrideDisabled}
          >
            {flow.signing ? "Signing…" : "Sign Force-Exit"}
          </button>
        </footer>
      </div>
    </div>
  );
}
