// IntentTabs — Earn spread / Increase exposure / Reduce risk / Exit.
// Synthesis B.2 / D.2. Maps user intent to action primaryType per the
// "verb-naming wins over mechanism-naming" port from Summer.fi (A.2).
//
// Force-Exit is NOT a tab here. It lives on Positions (synthesis C.1).
// Advanced / raw link surfaces under the tabs for power users (G.11).

import type { PrimaryType } from "@wstdiem/sdk";

export type IntentId =
  | "earn-spread"
  | "increase-exposure"
  | "reduce-risk"
  | "exit";

export interface IntentMeta {
  id: IntentId;
  label: string;
  description: string;
  /** The SDK primaryType this intent constructs. */
  primaryType: Exclude<PrimaryType, "ForceExit" | "AutomationExec" | "Revoke">;
  /** The mechanism name surfaced under the advanced/raw link (G.11). */
  mechanism: string;
}

export const INTENTS: readonly IntentMeta[] = [
  {
    id: "earn-spread",
    label: "Earn spread",
    description:
      "Open a loop to earn the net DIEM/wstDIEM spread. You supply wstDIEM, the executor borrows DIEM and redeposits.",
    primaryType: "Open",
    mechanism: "Open",
  },
  {
    id: "increase-exposure",
    label: "Increase exposure",
    description:
      "Re-leverage an existing position upward — borrows more DIEM and increases collateral.",
    primaryType: "Rebalance",
    mechanism: "Rebalance ↑",
  },
  {
    id: "reduce-risk",
    label: "Reduce risk",
    description:
      "Deleverage an existing position — repays debt and reduces collateral exposure without fully closing.",
    primaryType: "Rebalance",
    mechanism: "Rebalance ↓",
  },
  {
    id: "exit",
    label: "Exit",
    description:
      "Close the loop. Repays the borrow and returns net wstDIEM to your wallet.",
    primaryType: "Exit",
    mechanism: "Exit",
  },
];

interface IntentTabsProps {
  activeIntent: IntentId;
  onChange: (next: IntentId) => void;
  /** When true, the advanced/raw link is visible under the tabs. */
  showAdvancedLink?: boolean;
  /** Click handler for the advanced/raw link. */
  onAdvancedClick?: () => void;
}

export function IntentTabs(props: IntentTabsProps): JSX.Element {
  return (
    <div className="space-y-2" data-testid="intent-tabs">
      <div
        role="tablist"
        aria-label="Loop intent"
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1 sm:grid-cols-4"
      >
        {INTENTS.map((intent) => {
          const isActive = intent.id === props.activeIntent;
          return (
            <button
              key={intent.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`intent-tab-${intent.id}`}
              data-active={isActive}
              onClick={() => props.onChange(intent.id)}
              className={`rounded-md px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                isActive
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:bg-surface-raised hover:text-text"
              }`}
            >
              {intent.label}
            </button>
          );
        })}
      </div>
      {props.showAdvancedLink ? (
        <button
          type="button"
          onClick={props.onAdvancedClick}
          className="text-xs text-text-muted underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent/40"
          data-testid="intent-advanced-link"
        >
          Advanced / raw mechanism names
        </button>
      ) : null}
    </div>
  );
}

export function getIntentMeta(id: IntentId): IntentMeta {
  const meta = INTENTS.find((i) => i.id === id);
  if (!meta) throw new Error(`unknown intent: ${id}`);
  return meta;
}
