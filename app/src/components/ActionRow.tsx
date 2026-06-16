// ActionRow — 6 action buttons per synthesis D.3 / Spark A.5.
//
// Add collateral / Repay / Rebalance ↓ / Exit / Force-Exit / Revoke.
// Each button shows the §7.1 AND-over-rows blocked reasons inline when
// the named state-bit predicate matches. Force-Exit gets warning chrome.

import type { ReadinessResult } from "@wstdiem/sdk";

export type PositionAction =
  | "add-collateral"
  | "repay"
  | "rebalance-down"
  | "exit"
  | "force-exit"
  | "revoke";

interface ActionMeta {
  id: PositionAction;
  label: string;
  /** Map to SDK primaryType where applicable. */
  primaryType:
    | "Open"
    | "Rebalance"
    | "Exit"
    | "ForceExit"
    | "Revoke"
    | "AutomationExec";
  /** Whether the button uses warning chrome (Force-Exit). */
  warning?: boolean;
}

export const ACTION_META: readonly ActionMeta[] = [
  { id: "add-collateral", label: "Add collateral", primaryType: "Open" },
  { id: "repay", label: "Repay", primaryType: "Exit" },
  { id: "rebalance-down", label: "Rebalance ↓", primaryType: "Rebalance" },
  { id: "exit", label: "Exit", primaryType: "Exit" },
  { id: "force-exit", label: "Force-Exit", primaryType: "ForceExit", warning: true },
  { id: "revoke", label: "Revoke", primaryType: "Revoke" },
];

interface ActionRowProps {
  readiness: ReadinessResult | undefined;
  onClick: (id: PositionAction) => void;
}

function blockedReasonsFor(
  action: ActionMeta,
  readiness: ReadinessResult | undefined,
): {
  blocked: boolean;
  predicates: readonly string[];
  errors: readonly string[];
} {
  // Revoke is always allowed per §7.1 row 1 even when audit gate is closed.
  if (action.id === "revoke") {
    return { blocked: false, predicates: [], errors: [] };
  }
  const perAction = readiness?.perAction?.[action.primaryType];
  if (!perAction) {
    return {
      blocked: !readiness,
      predicates: ["readiness-unavailable"],
      errors: [],
    };
  }
  if (perAction.decision === "allowed") {
    return { blocked: false, predicates: [], errors: [] };
  }
  return {
    blocked: perAction.decision === "blocked",
    predicates: perAction.predicates,
    errors: perAction.errors,
  };
}

export function ActionRow(props: ActionRowProps): JSX.Element {
  return (
    <section
      data-testid="position-action-row"
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      {ACTION_META.map((action) => {
        const { blocked, predicates, errors } = blockedReasonsFor(
          action,
          props.readiness,
        );
        return (
          <div
            key={action.id}
            data-testid={`action-${action.id}`}
            data-blocked={blocked}
            data-warning={action.warning ?? false}
            className={`rounded-lg border px-3 py-2 ${
              action.warning
                ? "border-warning-border bg-warning-surface/40"
                : "border-border bg-surface"
            }`}
          >
            <button
              type="button"
              onClick={() => props.onClick(action.id)}
              disabled={blocked}
              className={`w-full rounded-md px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 ${
                action.warning
                  ? "border border-warning-border bg-warning-border text-canvas hover:opacity-90 focus:ring-warning-border disabled:opacity-50"
                  : "border border-border bg-surface-raised text-text hover:border-accent/40 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              }`}
              data-testid={`action-button-${action.id}`}
            >
              {action.label}
            </button>
            {blocked && (predicates.length > 0 || errors.length > 0) ? (
              <ul
                data-testid={`action-blocked-reasons-${action.id}`}
                className="mt-2 space-y-0.5 text-[10px]"
              >
                {predicates.map((p) => (
                  <li
                    key={p}
                    className="font-mono text-text-muted"
                    data-testid={`action-predicate-${action.id}`}
                  >
                    P-predicate: {p}
                  </li>
                ))}
                {errors.map((e) => (
                  <li
                    key={e}
                    className="font-mono text-warning-text"
                    data-testid={`action-error-${action.id}`}
                  >
                    error: {e}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
