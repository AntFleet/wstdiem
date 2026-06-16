// PolicyEditor — D.4 automation policy editor per synthesis B.4 / D.4.
//
// Policy class radio + permitted-actions checklist + bounds (max notional,
// max slippage, min HF, expiry block + wall-clock) + mev mode selector +
// optional acknowledgedRisks (force-exit class only).
//
// Policy creation routes through sdk.buildAuthorization with
// primaryType = "AutomationExec" per synthesis B.4 / D.4 SDK note.
// There is NO createPolicy method.

import { useState } from "react";
import type { MevProtectionMode, PolicyClass } from "@wstdiem/sdk";
import { MevModeSelector } from "./MevModeSelector.js";
import { PerBitChecklist } from "./PerBitChecklist.js";
import { FORCE_EXIT_RISK_BITS } from "../lib/risk-bits.js";

const POLICY_CLASSES: readonly { value: PolicyClass; label: string; description: string }[] = [
  {
    value: "REBALANCE",
    label: "Rebalance",
    description:
      "Keep leverage inside a target band. Allows Rebalance ↑ and Rebalance ↓ within bounds.",
  },
  {
    value: "DELEVERAGE_ONLY",
    label: "Deleverage only",
    description:
      "Reduce risk only. Allows Rebalance ↓ and repay-only Exit; never increases leverage.",
  },
  {
    value: "FORCE_EXIT",
    label: "Force-Exit",
    description:
      "Permits the keeper to trigger a Force-Exit on a stop-loss condition. Requires acknowledgedRisks bits.",
  },
];

interface PolicyEditorProps {
  /** Called when user clicks Sign policy — Phase 5 wires the real
   * buildAuthorization round-trip. */
  onSignPolicy: (draft: PolicyDraft) => void | Promise<void>;
}

export interface PolicyDraft {
  policyClass: PolicyClass;
  permittedActions: PolicyClass[];
  maxNotional: string;
  maxSlippageBps: number;
  minHealthFactor: string;
  expiryBlock: string;
  mevProtectionMode: MevProtectionMode;
  mevWaiverBits: number;
  acknowledgedRisks: number;
}

export function PolicyEditor(props: PolicyEditorProps): JSX.Element {
  const [policyClass, setPolicyClass] = useState<PolicyClass>("REBALANCE");
  const [maxNotional, setMaxNotional] = useState("");
  const [maxSlippageBps, setMaxSlippageBps] = useState(50);
  const [minHealthFactor, setMinHealthFactor] = useState("1.15");
  const [expiryBlock, setExpiryBlock] = useState("");
  const [mevMode, setMevMode] = useState<MevProtectionMode>("PRIVATE_BUILDER");
  const [mevWaiverBits, setMevWaiverBits] = useState(0);
  const [acknowledgedRisks, setAcknowledgedRisks] = useState(0);

  const isForceExitClass = policyClass === "FORCE_EXIT";

  return (
    <section
      data-testid="policy-editor"
      className="space-y-4 rounded-lg border border-border bg-surface px-4 py-4"
    >
      <header>
        <h3 className="text-base font-semibold text-text">Create policy</h3>
        <p className="text-xs text-text-muted">
          Signs an AutomationExec digest via sdk.buildAuthorization. There is
          no createPolicy method — the typed-data digest IS the policy
          (synthesis B.4 SDK note).
        </p>
      </header>

      <div className="space-y-2" role="radiogroup" aria-label="Policy class">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Policy class
        </h4>
        {POLICY_CLASSES.map((cls) => {
          const isSelected = cls.value === policyClass;
          return (
            <label
              key={cls.value}
              data-testid={`policy-class-${cls.value}`}
              data-selected={isSelected}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                isSelected
                  ? "border-accent/60 bg-accent/10"
                  : "border-border bg-surface-raised hover:border-accent/40"
              }`}
            >
              <input
                type="radio"
                name="policy-class"
                value={cls.value}
                checked={isSelected}
                onChange={() => setPolicyClass(cls.value)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-accent"
              />
              <div>
                <div className="font-semibold text-text">{cls.label}</div>
                <div className="text-text-muted">{cls.description}</div>
              </div>
            </label>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="max-notional"
            className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Max notional (DIEM)
          </label>
          <input
            id="max-notional"
            type="number"
            inputMode="decimal"
            value={maxNotional}
            onChange={(e) => setMaxNotional(e.target.value)}
            placeholder="0.0"
            className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            data-testid="max-notional-input"
          />
        </div>
        <div>
          <label
            htmlFor="max-slippage"
            className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Max slippage (bps)
          </label>
          <input
            id="max-slippage"
            type="number"
            value={maxSlippageBps}
            onChange={(e) => setMaxSlippageBps(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            data-testid="max-slippage-input"
          />
        </div>
        <div>
          <label
            htmlFor="min-hf"
            className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Min HF
          </label>
          <input
            id="min-hf"
            type="text"
            value={minHealthFactor}
            onChange={(e) => setMinHealthFactor(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            data-testid="min-hf-input"
          />
        </div>
        <div>
          <label
            htmlFor="expiry-block"
            className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Expiry block
          </label>
          <input
            id="expiry-block"
            type="number"
            value={expiryBlock}
            onChange={(e) => setExpiryBlock(e.target.value)}
            placeholder="block number"
            className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            data-testid="expiry-block-input"
          />
        </div>
      </div>

      <MevModeSelector
        mode={mevMode}
        onModeChange={setMevMode}
        waiverBits={mevWaiverBits}
        onWaiverChange={setMevWaiverBits}
      />

      {isForceExitClass ? (
        <div
          data-testid="acknowledged-risks-section"
          className="space-y-2 rounded-md border border-warning-border bg-warning-surface px-3 py-2"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-warning-text">
            Acknowledged risks (Force-Exit class)
          </h4>
          <PerBitChecklist
            registry={FORCE_EXIT_RISK_BITS}
            bitmap={0xff}
            checked={acknowledgedRisks}
            onChange={setAcknowledgedRisks}
            testId="acknowledged-risks-checklist"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() =>
            props.onSignPolicy({
              policyClass,
              permittedActions: [],
              maxNotional,
              maxSlippageBps,
              minHealthFactor,
              expiryBlock,
              mevProtectionMode: mevMode,
              mevWaiverBits,
              acknowledgedRisks,
            })
          }
          className="rounded-md border border-accent/60 bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent"
          data-testid="sign-policy-cta"
        >
          Sign policy
        </button>
      </div>
    </section>
  );
}
