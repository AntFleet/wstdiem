// MevModeSelector — synthesis C.4 + G.10.
//
// Enum-name primary + plain-language subtitle. Default PRIVATE_BUILDER.
// Non-default modes reveal the matching mevWaiverBits PerBitChecklist —
// the user must explicitly acknowledge the bit before the action's
// mevProtectionMode can move off the default.

import type { MevProtectionMode } from "@wstdiem/sdk";
import { MevWaiverBit } from "@wstdiem/sdk";
import { PerBitChecklist } from "./PerBitChecklist.js";
import { MEV_WAIVER_BITS } from "../lib/risk-bits.js";

interface ModeMeta {
  mode: MevProtectionMode;
  label: string;
  subtitle: string;
  /** mevWaiverBits required to be set when this mode is selected. 0 means
   * no waiver is required (the default mode). */
  requiredWaiverBits: number;
}

export const MEV_MODE_META: readonly ModeMeta[] = [
  {
    mode: "PRIVATE_BUILDER",
    label: "PRIVATE_BUILDER",
    subtitle:
      "bloXroute Protect (or equivalent private builder) — protects from sandwich attacks. Default.",
    requiredWaiverBits: 0,
  },
  {
    mode: "PUBLIC",
    label: "PUBLIC",
    subtitle:
      "Submission through the public mempool. Higher sandwich-attack exposure. Requires PUBLIC_MEMPOOL_OPT_IN waiver.",
    requiredWaiverBits: MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN,
  },
  {
    mode: "SEQUENCER_DIRECT_FAILOPEN",
    label: "SEQUENCER_DIRECT_FAILOPEN",
    subtitle:
      "Direct submission to the Base sequencer if the private builder is unreachable. Requires SEQUENCER_DIRECT_FALLBACK_OPT_IN waiver.",
    requiredWaiverBits: MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN,
  },
  {
    mode: "SEALED_AUCTION",
    label: "SEALED_AUCTION",
    subtitle:
      "Sealed-bid auction routing via a dedicated builder. Requires both PUBLIC_MEMPOOL_OPT_IN and SEQUENCER_DIRECT_FALLBACK_OPT_IN waivers.",
    requiredWaiverBits:
      MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN |
      MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN,
  },
];

interface MevModeSelectorProps {
  mode: MevProtectionMode;
  onModeChange: (next: MevProtectionMode) => void;
  waiverBits: number;
  onWaiverChange: (next: number) => void;
  disabled?: boolean;
}

export function MevModeSelector(
  props: MevModeSelectorProps,
): JSX.Element {
  const requiredForMode = MEV_MODE_META.find((m) => m.mode === props.mode)
    ?.requiredWaiverBits ?? 0;
  const allRequiredChecked =
    requiredForMode === 0 ||
    (props.waiverBits & requiredForMode) === requiredForMode;
  return (
    <div
      data-testid="mev-mode-selector"
      data-mode={props.mode}
      data-waivers-ok={allRequiredChecked}
      className="space-y-2"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        MEV protection mode
      </h3>
      <div
        role="radiogroup"
        aria-label="MEV protection mode"
        className="space-y-1.5"
      >
        {MEV_MODE_META.map((meta) => {
          const isSelected = meta.mode === props.mode;
          return (
            <label
              key={meta.mode}
              data-testid={`mev-mode-option-${meta.mode}`}
              data-selected={isSelected}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                isSelected
                  ? "border-accent/60 bg-accent/10"
                  : "border-border bg-surface hover:border-accent/40"
              }`}
            >
              <input
                type="radio"
                checked={isSelected}
                disabled={props.disabled}
                onChange={() => props.onModeChange(meta.mode)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed"
              />
              <div>
                <div className="font-mono text-text">{meta.label}</div>
                <div className="mt-0.5 text-text-muted">{meta.subtitle}</div>
                {meta.requiredWaiverBits !== 0 ? (
                  <div className="mt-0.5 text-text-muted">
                    Required waivers:{" "}
                    <code className="font-mono">
                      0x{meta.requiredWaiverBits.toString(16).padStart(2, "0")}
                    </code>
                  </div>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>
      {requiredForMode !== 0 ? (
        <div
          data-testid="mev-waiver-section"
          className="space-y-2 rounded-md border border-warning-border bg-warning-surface px-3 py-2"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-warning-text">
            Acknowledge each MEV waiver bit
          </h4>
          <PerBitChecklist
            registry={MEV_WAIVER_BITS}
            bitmap={requiredForMode}
            checked={props.waiverBits & requiredForMode}
            onChange={(next) =>
              props.onWaiverChange(
                (props.waiverBits & ~requiredForMode) | (next & requiredForMode),
              )
            }
            disabled={props.disabled}
            testId="mev-waiver-checklist"
          />
          {!allRequiredChecked ? (
            <p
              className="text-xs text-warning-text"
              data-testid="mev-waiver-blocked"
            >
              Sign button blocked until every required waiver bit is checked.
            </p>
          ) : null}
        </div>
      ) : null}
      {/* m-do-2 closure: I-67 minimality UI pre-check. The on-chain
          validateHighRiskPolicy refuses waiver bits beyond the minimum the
          selected mode requires. The UI pre-enforces by surfacing any
          extra bits and disabling the sign-button via the waiverExtraBits
          banner. The PerBitChecklist above already constrains the checked
          set to `requiredForMode`, but a stale waiverBits state passed
          through props (e.g. mode-switch without resetting waivers) can
          still carry extra bits. */}
      {(() => {
        const extraBits = props.waiverBits & ~requiredForMode;
        if (extraBits === 0) return null;
        const extraNames: string[] = [];
        for (const w of MEV_WAIVER_BITS) {
          if ((extraBits & w.mask) === w.mask) extraNames.push(w.name);
        }
        return (
          <div
            data-testid="mev-waiver-extra-bits"
            className="rounded-md border-2 border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-text"
            role="alert"
          >
            <div className="font-semibold">
              I-67 waiver minimality: only the bits required for this mode
              may be set.
            </div>
            <div className="mt-1">
              Extra bits:{" "}
              <code className="font-mono">{extraNames.join(", ")}</code>.
              Sign disabled until cleared.
            </div>
          </div>
        );
      })()}
    </div>
  );
}
