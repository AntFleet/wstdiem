// MarketFilterStrip — chain / state / automation / audit-gate filters.
// Synthesis D.1. The "show all including closed" toggle never silently
// hides closed markets.

import { useId } from "react";

export interface MarketFilters {
  auditGateOnlyOpen: boolean;
  stateOnlyClear: boolean;
  automationOnly: boolean;
}

interface MarketFilterStripProps {
  filters: MarketFilters;
  onChange: (next: MarketFilters) => void;
}

export const DEFAULT_FILTERS: MarketFilters = {
  auditGateOnlyOpen: true,
  stateOnlyClear: false,
  automationOnly: false,
};

export function MarketFilterStrip(
  props: MarketFilterStripProps,
): JSX.Element {
  const id = useId();
  return (
    <div
      data-testid="market-filter-strip"
      className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs"
    >
      <span className="text-text-muted">Filters:</span>
      <Toggle
        id={`${id}-audit`}
        label="Audit gate open"
        checked={props.filters.auditGateOnlyOpen}
        onChange={(v) =>
          props.onChange({ ...props.filters, auditGateOnlyOpen: v })
        }
        testId="filter-audit-gate-only-open"
      />
      <Toggle
        id={`${id}-state`}
        label="State all clear"
        checked={props.filters.stateOnlyClear}
        onChange={(v) =>
          props.onChange({ ...props.filters, stateOnlyClear: v })
        }
        testId="filter-state-only-clear"
      />
      <Toggle
        id={`${id}-automation`}
        label="Automation available"
        checked={props.filters.automationOnly}
        onChange={(v) =>
          props.onChange({ ...props.filters, automationOnly: v })
        }
        testId="filter-automation-only"
      />
      <button
        type="button"
        onClick={() =>
          props.onChange({
            auditGateOnlyOpen: false,
            stateOnlyClear: false,
            automationOnly: false,
          })
        }
        data-testid="filter-show-all"
        className="ml-auto rounded-md border border-border bg-canvas px-2 py-1 text-text-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        Show all including closed
      </button>
    </div>
  );
}

function Toggle(props: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testId: string;
}): JSX.Element {
  return (
    <label
      htmlFor={props.id}
      data-testid={props.testId}
      data-checked={props.checked}
      className="inline-flex cursor-pointer items-center gap-1"
    >
      <input
        id={props.id}
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-accent"
      />
      <span className="text-text">{props.label}</span>
    </label>
  );
}
