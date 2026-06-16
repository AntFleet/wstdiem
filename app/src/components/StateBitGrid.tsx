// StateBitGrid — 16 slots (11 named + 5 reserved). Synthesis §B.5.
//
// Each cell shows: bit name, set/unset state, plain-language tooltip. The
// grid is forward-compat: adding a new named bit in Phase G upgrades the
// label without re-authoring the grid layout.

import { STATE_BIT_REGISTRY } from "../lib/state-bits.js";

interface StateBitGridProps {
  bitmap: number | undefined;
  /** When true, only cells for set bits render content; unset cells render
   * as faded placeholders. Default false (D.5 evidence grid shows everything). */
  emphasizeSetOnly?: boolean;
}

export function StateBitGrid(props: StateBitGridProps): JSX.Element {
  const { bitmap, emphasizeSetOnly = false } = props;
  return (
    <div
      data-testid="state-bit-grid"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {STATE_BIT_REGISTRY.map((bit) => {
        const isSet =
          bit.mask !== undefined &&
          bitmap !== undefined &&
          (bitmap & bit.mask) === bit.mask;
        const reserved = bit.mask === undefined;
        const indeterminate = bitmap === undefined;
        return (
          <div
            key={bit.name}
            data-testid={`state-bit-cell-${bit.index}`}
            data-bit-name={bit.name}
            data-state={
              indeterminate ? "unknown" : isSet ? "set" : reserved ? "reserved" : "unset"
            }
            className={`rounded-md border px-2.5 py-2 text-xs transition-colors ${
              isSet
                ? "border-warning-border bg-warning-surface text-warning-text"
                : reserved
                ? "border-border bg-surface-raised/50 text-text-muted/60"
                : indeterminate
                ? "border-border bg-surface-raised text-text-muted"
                : emphasizeSetOnly
                ? "border-border bg-surface-raised text-text-muted/70"
                : "border-border bg-surface-raised text-text"
            }`}
            title={bit.plainLanguage}
          >
            <div className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
              bit {bit.index}
            </div>
            <div className="mt-0.5 text-sm">
              <span aria-hidden="true" className="mr-1">
                {isSet ? "●" : indeterminate ? "·" : reserved ? "—" : "○"}
              </span>
              {bit.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
