// TypedConfirmInput — user types a literal string (e.g. "FORCE-EXIT") to
// enable the next step. Synthesis G.13.
//
// Defends against checkbox-reflex fatigue on destructive irreversible
// actions. Comparison is exact-match against the canonical token; any
// trailing whitespace or case mismatch keeps the gate closed.

import { useId } from "react";

interface TypedConfirmInputProps {
  /** The literal string the user must type to confirm. */
  expected: string;
  /** Current input value (controlled). */
  value: string;
  /** Update callback. */
  onChange: (next: string) => void;
  /** When true, the input is frozen (e.g. mid-broadcast). */
  disabled?: boolean;
  /** Label shown above the input. */
  label?: string;
  /** Hint text shown below. Defaults to the expected token in monospace.
   * `undefined` is treated as "fall back to default hint" (exactOptionalPropertyTypes-friendly). */
  hint?: string | undefined;
}

export function TypedConfirmInput(
  props: TypedConfirmInputProps,
): JSX.Element {
  const id = useId();
  const matched = props.value === props.expected;
  return (
    <div
      data-testid="typed-confirm-input"
      data-matched={matched}
      className="space-y-1"
    >
      {props.label ? (
        <label
          htmlFor={id}
          className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          {props.label}
        </label>
      ) : null}
      <input
        id={id}
        type="text"
        value={props.value}
        disabled={props.disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.expected}
        className={`w-full rounded-md border bg-canvas px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-warning-border ${
          matched
            ? "border-risk-green/60"
            : props.value.length > 0
            ? "border-warning-border"
            : "border-border"
        } disabled:cursor-not-allowed disabled:opacity-60`}
        aria-invalid={!matched}
        aria-describedby={`${id}-hint`}
      />
      <div id={`${id}-hint`} className="text-xs text-text-muted">
        {props.hint ?? (
          <>
            Type the literal token{" "}
            <code className="font-mono text-text">{props.expected}</code> to
            enable the next step.
          </>
        )}
      </div>
    </div>
  );
}
