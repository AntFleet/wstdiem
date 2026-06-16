// PerBitChecklist — shared parameterized per-bit decoded-checklist component.
//
// Used by:
//   - ForceExitConfirmPanel (Phase 2) — acknowledgedRisks bits
//   - MevModeSelector (Phase 3) — mevWaiverBits
//   - PolicyEditor (Phase 4) — acknowledgedRisks + mevWaiverBits
//
// One checkbox per set bit in the supplied bitmap. Caller passes the
// bit-name map so the component is bitmap-agnostic. Sign flows downstream
// gate on `allChecked` returning true.

import { useCallback, useId, useMemo } from "react";

export interface BitDescriptor {
  /** The bit's mask value (1 << index). */
  mask: number;
  /** PROTOCOL.md-canonical name displayed verbatim. */
  name: string;
  /** Plain-language description shown below the name. */
  plainLanguage: string;
}

interface PerBitChecklistProps {
  /** Bit registry — one entry per bit the user might be asked to acknowledge. */
  registry: readonly BitDescriptor[];
  /** Bitmap whose set bits the user must individually check. Unset bits are
   * not rendered (only set bits require explicit acknowledgement). */
  bitmap: number;
  /** Currently-checked subset (a sub-bitmap of `bitmap`). */
  checked: number;
  /** Callback fired with the updated `checked` value on each toggle. */
  onChange: (nextChecked: number) => void;
  /** Optional label for the section heading. */
  label?: string;
  /** When true, the disabled flag freezes the entire checklist (used
   * mid-broadcast). Default false. */
  disabled?: boolean | undefined;
  /** Optional test id for the wrapping element. */
  testId?: string;
}

interface PerBitChecklistResult {
  allChecked: boolean;
  setBitDescriptors: readonly BitDescriptor[];
}

/** Pure helper exposed for reuse outside the component (e.g., in the
 * force-exit flow hook). */
export function evaluateChecklist(
  registry: readonly BitDescriptor[],
  bitmap: number,
  checked: number,
): PerBitChecklistResult {
  const setBitDescriptors = registry.filter(
    (b) => (bitmap & b.mask) === b.mask,
  );
  // allChecked when every set bit's mask appears in `checked`.
  const allChecked =
    setBitDescriptors.length > 0 &&
    setBitDescriptors.every((b) => (checked & b.mask) === b.mask);
  return { allChecked, setBitDescriptors };
}

export function PerBitChecklist(props: PerBitChecklistProps): JSX.Element {
  const reactId = useId();
  const { setBitDescriptors } = useMemo(
    () => evaluateChecklist(props.registry, props.bitmap, props.checked),
    [props.registry, props.bitmap, props.checked],
  );

  const toggle = useCallback(
    (mask: number) => {
      const next = (props.checked & mask) === mask
        ? props.checked & ~mask
        : props.checked | mask;
      props.onChange(next);
    },
    [props],
  );

  if (setBitDescriptors.length === 0) {
    return (
      <div
        className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-text-muted"
        data-testid={props.testId ?? "per-bit-checklist-empty"}
      >
        No bits set. Nothing to acknowledge.
      </div>
    );
  }

  return (
    <fieldset
      disabled={props.disabled}
      data-testid={props.testId ?? "per-bit-checklist"}
      data-bits-set={setBitDescriptors.length}
      data-bits-checked={setBitDescriptors.filter(
        (b) => (props.checked & b.mask) === b.mask,
      ).length}
      className="space-y-2"
    >
      {props.label ? (
        <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {props.label}
        </legend>
      ) : null}
      <ul className="space-y-1.5">
        {setBitDescriptors.map((bit) => {
          const isChecked = (props.checked & bit.mask) === bit.mask;
          const id = `${reactId}-bit-${bit.mask}`;
          return (
            <li
              key={bit.mask}
              data-testid={`per-bit-checklist-row-${bit.name}`}
              data-checked={isChecked}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                isChecked
                  ? "border-accent/60 bg-accent/10"
                  : "border-border bg-surface"
              }`}
            >
              <input
                type="checkbox"
                id={id}
                checked={isChecked}
                disabled={props.disabled}
                onChange={() => toggle(bit.mask)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed"
                aria-describedby={`${id}-desc`}
              />
              <label htmlFor={id} className="flex-1 cursor-pointer">
                <div className="font-mono text-xs text-text">{bit.name}</div>
                <div
                  id={`${id}-desc`}
                  className="mt-0.5 text-xs text-text-muted"
                >
                  {bit.plainLanguage}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
