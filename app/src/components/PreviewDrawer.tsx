// PreviewDrawer — the §10 mandatory-fields disclosure surface.
//
// Synthesis B.2 / §10. Slides from the right; ≥ 60% viewport width on
// desktop, full on mobile. Renders every mandatory field group with
// explicit sentinels (LEDGER_BEFORE_UNAVAILABLE / LEDGER_AFTER_UNAVAILABLE /
// HEALTH_INDETERMINATE) when data cannot be computed — NEVER silent "—".
//
// Force-Exit block (conditional on primaryType === "ForceExit") is in a
// distinct visual treatment to defeat phishing per synthesis C.1.

import { useEffect } from "react";
import type {
  ForceExitAction,
  GateStatus,
  PositionRisk,
  TransactionPreview,
} from "@wstdiem/sdk";
import { GPmGateChecklist, allGatesClear } from "./GPmGateChecklist.js";
import { HealthFactorGauge } from "./HealthFactorGauge.js";
import {
  authorizerNameFor,
  expectedAuthorizerFor,
} from "../lib/contracts.js";

interface PreviewDrawerProps {
  open: boolean;
  preview: TransactionPreview | undefined;
  /** Latest readiness gate statuses (overrides the preview's snapshot when
   * present so the checklist reflects realtime updates). */
  gateStatuses?: readonly GateStatus[] | undefined;
  /** When true, the sign button is unconditionally disabled (wrong chain,
   * stale quote, broadcast in flight, etc.). */
  signOverrideDisabled?: boolean;
  /** Label rendered next to a disabled sign button explaining why. */
  signDisabledReason?: string;
  onClose: () => void;
  onSign: () => Promise<void> | void;
  signing: boolean;
}

export function fmtBigint(value: bigint | undefined, sentinel = "—"): string {
  if (value === undefined) return sentinel;
  return value.toString();
}

export function fmtBps(value: number | undefined, sentinel = "—"): string {
  if (value === undefined) return sentinel;
  return `${value} bps (${(value / 100).toFixed(2)}%)`;
}

function truncate(s: string | undefined, head = 8, tail = 6): string {
  if (!s) return "—";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function PreviewDrawer(props: PreviewDrawerProps): JSX.Element | null {
  // Esc closes. Outside-click handled by the overlay.
  // M-6 closure: depend on the specific onClose callback ref rather than
  // the full props object, which would rebind the listener every render.
  // Caller is expected to wrap onClose in useCallback for stability.
  const { onClose, signing, open } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !signing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, signing, onClose]);

  if (!props.open) return null;
  const preview = props.preview;
  const action = preview?.action;
  const gates = props.gateStatuses ?? preview?.gateStatuses;
  const gatesClear = allGatesClear(gates);
  const isForceExit = action?.primaryType === "ForceExit";
  // C-1 closure: resolve the authorizer NAME from verifyingContract and
  // compare to what primaryType implies. Mismatch is a sign-block.
  const expectedAuthorizer = action
    ? expectedAuthorizerFor(action.primaryType)
    : "LoopAuthorization";
  const resolvedAuthorizer = authorizerNameFor(action?.verifyingContract);
  const authorizerMismatch =
    Boolean(action) && resolvedAuthorizer !== expectedAuthorizer;
  const signEnabled =
    Boolean(preview) &&
    gatesClear &&
    !props.signOverrideDisabled &&
    !props.signing &&
    !authorizerMismatch;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-drawer-title"
      data-testid="preview-drawer"
      data-primary-type={action?.primaryType ?? "loading"}
      className="fixed inset-0 z-40 flex justify-end"
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={props.onClose}
        disabled={props.signing}
        className="flex-1 cursor-pointer bg-canvas/40 backdrop-blur-sm disabled:cursor-not-allowed"
        data-testid="preview-drawer-overlay"
      />
      <aside
        className="flex h-full w-full flex-col overflow-y-auto border-l border-border bg-surface sm:w-[60vw] sm:min-w-[480px]"
        data-testid="preview-drawer-panel"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur">
          <div>
            <h2
              id="preview-drawer-title"
              className="text-base font-semibold tracking-tight text-text"
            >
              Preview
            </h2>
            <p className="text-xs text-text-muted">
              The §10 mandatory disclosure before signing.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.signing}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="preview-drawer-close"
          >
            Close
          </button>
        </header>

        {!preview ? (
          <div
            className="p-6 text-sm text-text-muted"
            data-testid="preview-drawer-loading"
          >
            Resolving SDK quote, evidence bundle, and digest…
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {authorizerMismatch ? (
              <section
                className="rounded-lg border-2 border-warning-border bg-warning-surface px-4 py-3 text-warning-text"
                data-testid="preview-authorizer-mismatch"
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
                      <code className="font-mono">{resolvedAuthorizer}</code>
                      . Sign blocked.
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {/* Identity */}
            <Section testId="preview-identity" title="Identity">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <Field label="action type" value={action?.primaryType ?? "—"} />
                <Field label="primaryType" value={action?.primaryType ?? "—"} />
                <Field
                  label="market"
                  value={
                    <span title={action?.market}>
                      {truncate(action?.market)}
                    </span>
                  }
                />
                <Field
                  label="chainId"
                  value={String(action?.chainId ?? "—")}
                />
                <Field
                  label="owner"
                  value={
                    <span title={action?.owner}>{truncate(action?.owner)}</span>
                  }
                />
                <Field
                  label="executor"
                  value={
                    <span title={action?.executor}>
                      {truncate(action?.executor)}
                    </span>
                  }
                />
                <Field
                  label="verifyingContract"
                  value={
                    <span
                      title={action?.verifyingContract}
                      className={
                        authorizerMismatch
                          ? "text-warning-text font-semibold"
                          : isForceExit
                          ? "text-warning-text font-semibold"
                          : ""
                      }
                      data-testid="preview-verifying-contract"
                      data-authorizer={resolvedAuthorizer}
                    >
                      {truncate(action?.verifyingContract)}
                      {" "}
                      <span
                        className={
                          authorizerMismatch
                            ? "text-warning-text font-semibold"
                            : "text-text-muted"
                        }
                      >
                        ({resolvedAuthorizer})
                      </span>
                    </span>
                  }
                />
                <Field
                  label="registryMerkleRoot"
                  value={
                    <span title={action?.registryMerkleRoot}>
                      {truncate(action?.registryMerkleRoot)}
                    </span>
                  }
                />
                <Field
                  label="registryVersion"
                  value={String(action?.registryVersion ?? "—")}
                />
              </dl>
            </Section>

            {/* Spenders */}
            <Section testId="preview-spenders" title="Spenders">
              <p className="mb-1 text-xs text-text-muted">
                Spender addresses with EXTCODEHASH verification state. For
                proxied integrations the implementation address + EXTCODEHASH
                must match the registry pin, OR carry the "monitored via
                fingerprint" badge (§7.3 / D.5).
              </p>
              <div className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-text-muted">
                Spender list lands when the SDK exposes per-action
                spenderListHash decomposition. Current digest commits the
                sub-hash{" "}
                <code className="font-mono text-text">
                  {truncate(preview.subHashes.spenderListHash)}
                </code>
                .
              </div>
            </Section>

            {/* Digest */}
            <Section testId="preview-digest" title="Digest">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <Field
                  label="canonical digest"
                  value={
                    <code className="font-mono break-all">{preview.digest}</code>
                  }
                />
                <Field
                  label="quoteHash"
                  value={
                    <code className="font-mono break-all">
                      {preview.subHashes.quoteHash}
                    </code>
                  }
                />
                <Field
                  label="spenderListHash"
                  value={
                    <code className="font-mono break-all">
                      {preview.subHashes.spenderListHash}
                    </code>
                  }
                />
                <Field
                  label="allowanceScheduleHash"
                  value={
                    <code className="font-mono break-all">
                      {preview.subHashes.allowanceScheduleHash}
                    </code>
                  }
                />
                <Field
                  label="evidenceBundleHash"
                  value={
                    <code className="font-mono break-all">
                      {preview.subHashes.evidenceBundleHash}
                    </code>
                  }
                />
                <Field
                  label="feeCapHash"
                  value={
                    <code className="font-mono break-all">
                      {preview.subHashes.feeCapHash}
                    </code>
                  }
                />
                <Field
                  label="calldataHash"
                  value={
                    <span>
                      <code className="font-mono break-all">
                        {preview.calldataHash}
                      </code>
                      <span className="ml-2 text-text-muted">
                        (not consumed by verifier)
                      </span>
                    </span>
                  }
                />
              </dl>
            </Section>

            {/* Ledger before/after */}
            <Section testId="preview-ledger" title="Ledger before / after">
              <LedgerRows before={preview.before} after={preview.after} />
            </Section>

            {/* Amounts and route */}
            <Section
              testId="preview-amounts-route"
              title="Amounts and route"
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <Field
                  label="quoteBlockNumber"
                  value={String(action?.quoteBlockNumber ?? "—")}
                />
                <Field
                  label="maxQuoteAgeBlocks"
                  value={String(action?.maxQuoteAgeBlocks ?? "—")}
                />
                <Field
                  label="maxQuoteDeviationBps"
                  value={fmtBps(action?.maxQuoteDeviationBps as unknown as number)}
                />
                <Field
                  label="deadline"
                  value={String(action?.deadline ?? "—")}
                />
                <Field
                  label="nonceSlot / nonceBit"
                  value={`${action?.nonceSlot ?? "—"} / ${action?.nonceBit ?? "—"}`}
                />
                <Field
                  label="mevProtectionMode"
                  value={String(action?.mevProtectionMode ?? "—")}
                />
                <Field
                  label="mevWaiverBits"
                  value={`0x${(action?.mevWaiverBits ?? 0).toString(16).padStart(2, "0")}`}
                />
                <Field
                  label="quoteId"
                  value={
                    <code className="font-mono break-all">{preview.quoteId}</code>
                  }
                />
                <Field
                  label="routeId"
                  value={
                    preview.routeId ? (
                      <code className="font-mono break-all">
                        {preview.routeId}
                      </code>
                    ) : (
                      "—"
                    )
                  }
                />
              </dl>
              <p className="mt-1 text-xs text-text-muted">
                Expected output vs minimum output, Curve route, and price
                impact land once the SDK exposes per-route decomposition on
                TransactionPreview (PR-16 follow-up).
              </p>
            </Section>

            {/* Fees and yield */}
            <Section testId="preview-fees-yield" title="Fees and yield">
              <p className="text-xs text-text-muted">
                Protocol fee, automation fee, third-party route fees,
                flash-loan fee, borrow APY, vault APY, net APY spread,
                keeper-fee derivation: render once the SDK exposes the
                fee-decomposition surface (PR-16 follow-up). Phase 3 commits
                the digest sub-hash{" "}
                <code className="font-mono text-text">
                  {truncate(preview.subHashes.feeCapHash)}
                </code>
                .
              </p>
            </Section>

            {/* Approvals and authorization */}
            <Section
              testId="preview-approvals"
              title="Approvals and authorization"
            >
              <p className="text-xs text-text-muted">
                Per-spender allowance schedule (approve(0) → approve(N)),
                Morpho auth changes, WSTDIEM auth changes, and revocation
                path render once the SDK exposes the schedule decomposition.
                Phase 3 commits the digest sub-hash{" "}
                <code className="font-mono text-text">
                  {truncate(preview.subHashes.allowanceScheduleHash)}
                </code>
                .
              </p>
            </Section>

            {/* Calldata */}
            <Section testId="preview-calldata" title="Calldata">
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-canvas px-3 py-2 font-mono text-xs text-text-muted break-all">
                  {preview.calldata}
                </div>
                <p className="text-xs text-text-muted">
                  Decoded function name + named-arg view is rendered via
                  sdk.decodeCalldata in PR-16 follow-up. The on-chain
                  validator hashes only the digest, not calldata — the SDK ↔
                  contract parity differential CI proves the round-trip.
                </p>
              </div>
            </Section>

            {/* Failure conditions */}
            <Section
              testId="preview-failure-conditions"
              title="Failure conditions"
            >
              {preview.failureConditions.length === 0 ? (
                <p className="text-xs text-text-muted">
                  No failure conditions matched in this snapshot.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {preview.failureConditions.map((name) => (
                    <li
                      key={name}
                      data-testid={`failure-condition-${name}`}
                      className="font-mono text-warning-text"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Force-Exit block (conditional) */}
            {isForceExit ? (
              <ForceExitBlock action={action as ForceExitAction} />
            ) : null}

            {/* Pre-sign gates */}
            <Section testId="preview-gates" title="Pre-sign gates">
              <GPmGateChecklist gates={gates} />
            </Section>
          </div>
        )}

        <footer
          className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur"
          data-testid="preview-drawer-footer"
        >
          <div className="text-xs text-text-muted">
            {authorizerMismatch ? (
              <span
                data-testid="preview-authorizer-mismatch-reason"
                className="text-warning-text"
              >
                Sign blocked: verifyingContract is not {expectedAuthorizer}.
              </span>
            ) : props.signOverrideDisabled && props.signDisabledReason ? (
              <span
                data-testid="preview-sign-override-reason"
                className="text-warning-text"
              >
                {props.signDisabledReason}
              </span>
            ) : !gatesClear ? (
              <span className="text-warning-text">
                Sign blocked: one or more G-PM gates failing.
              </span>
            ) : (
              <span>All gates pass. Ready to sign.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              void props.onSign();
            }}
            disabled={!signEnabled}
            data-testid="preview-sign-button"
            data-enabled={signEnabled}
            className={`rounded-md border px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 ${
              signEnabled
                ? "border-accent/60 bg-accent text-canvas hover:opacity-90 focus:ring-accent"
                : "cursor-not-allowed border-border bg-surface-raised text-text-muted focus:ring-border"
            }`}
          >
            {props.signing ? "Signing…" : "Sign"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Section(props: {
  title: string;
  testId: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section
      data-testid={props.testId}
      className="rounded-lg border border-border bg-surface-raised px-3 py-3"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function Field(props: {
  label: string;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <dt className="text-text-muted">{props.label}</dt>
      <dd className="font-mono text-text break-all">{props.value}</dd>
    </>
  );
}

function LedgerRows(props: {
  before: PositionRisk | undefined;
  after: PositionRisk | undefined;
}): JSX.Element {
  const before = props.before;
  const after = props.after;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <LedgerCol
          testid="ledger-before"
          title="Before"
          risk={before}
          unavailableSentinel="LEDGER_BEFORE_UNAVAILABLE"
        />
        <LedgerCol
          testid="ledger-after"
          title="After"
          risk={after}
          unavailableSentinel="LEDGER_AFTER_UNAVAILABLE"
        />
      </div>
    </div>
  );
}

function LedgerCol(props: {
  testid: string;
  title: string;
  risk: PositionRisk | undefined;
  unavailableSentinel: string;
}): JSX.Element {
  if (!props.risk) {
    return (
      <div
        data-testid={props.testid}
        data-sentinel={props.unavailableSentinel}
        className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-text"
      >
        <div className="font-semibold">{props.title}</div>
        <div className="mt-1 font-mono">{props.unavailableSentinel}</div>
      </div>
    );
  }
  const hfIndeterminate = props.risk.healthFactorWad === undefined;
  return (
    <div
      data-testid={props.testid}
      className="rounded-md border border-border bg-surface px-3 py-2 text-xs"
    >
      <div className="mb-1 font-semibold text-text">{props.title}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <dt className="text-text-muted">collateral wstDIEM</dt>
        <dd className="font-mono text-text">
          {props.risk.collateralWstDiem.toString()}
        </dd>
        <dt className="text-text-muted">debt DIEM</dt>
        <dd className="font-mono text-text">
          {props.risk.debtDiem.toString()}
        </dd>
        <dt className="text-text-muted">HF</dt>
        <dd className="font-mono">
          {hfIndeterminate ? (
            <span
              className="text-warning-text"
              data-testid={`${props.testid}-hf-sentinel`}
            >
              HEALTH_INDETERMINATE
            </span>
          ) : (
            <HealthFactorGauge
              size="sm"
              healthFactorWad={props.risk.healthFactorWad}
              liquidationDistanceBps={props.risk.liquidationDistanceBps}
              showSentinelOnIndeterminate={false}
            />
          )}
        </dd>
        <dt className="text-text-muted">leverage</dt>
        <dd className="font-mono text-text">
          {props.risk.leverageBps !== undefined
            ? `${(props.risk.leverageBps / 100).toFixed(2)}x`
            : "—"}
        </dd>
        <dt className="text-text-muted">liquidation distance</dt>
        <dd className="font-mono text-text">
          {props.risk.liquidationDistanceBps !== undefined
            ? `${(props.risk.liquidationDistanceBps / 100).toFixed(1)}%`
            : "—"}
        </dd>
      </dl>
    </div>
  );
}

function ForceExitBlock(props: {
  action: ForceExitAction;
}): JSX.Element {
  return (
    <section
      data-testid="preview-force-exit-block"
      className="rounded-lg border-2 border-warning-border bg-warning-surface px-4 py-3 text-warning-text"
    >
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <span aria-hidden="true">⚠</span> Force-Exit block (conditional)
      </h3>
      <p className="mb-2 text-xs">
        This action signs a Force-Exit digest. The dedicated full-screen
        confirmation panel renders the per-bit checklist + typed-confirm +
        ≥3-second dwell. The drawer shows the decoded fields here for
        completeness.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-muted">force</dt>
        <dd className="font-mono">true</dd>
        <dt className="text-text-muted">maxCollateralSold</dt>
        <dd className="font-mono">
          {props.action.bounds.maxCollateralSold.toString()}
        </dd>
        <dt className="text-text-muted">minRepayment</dt>
        <dd className="font-mono">
          {props.action.bounds.minRepayment.toString()}
        </dd>
        <dt className="text-text-muted">deadline (expiry)</dt>
        <dd className="font-mono">{props.action.deadline.toString()}</dd>
        <dt className="text-text-muted">verifyingContract</dt>
        <dd className="font-mono break-all">
          {props.action.verifyingContract}
        </dd>
        <dt className="text-text-muted">acknowledgedRisks (mask)</dt>
        <dd className="font-mono">
          0x
          {props.action.bounds.acknowledgedRisks
            .toString(16)
            .padStart(2, "0")}
        </dd>
      </dl>
    </section>
  );
}

// truncate is exported too in case downstream phases reuse it on Positions /
// Automation cards.
export { truncate };
