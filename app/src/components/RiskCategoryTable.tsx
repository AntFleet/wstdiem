// RiskCategoryTable — Spark six-category risk taxonomy
// (synthesis A.5 / B.5).
//
// Frontend / Contract / Market / Liquidation / Technology / Governance.
// Each category renders as a section card with body slot — Phase 1 ships
// header + skeleton body that subsequent rows fill from SDK data.

import type { ReactNode } from "react";

export type RiskCategoryId =
  | "frontend"
  | "contract"
  | "market"
  | "liquidation"
  | "technology"
  | "governance";

export interface RiskCategoryProps {
  id: RiskCategoryId;
  title: string;
  description: string;
  children: ReactNode;
}

export const RISK_CATEGORY_ORDER: readonly RiskCategoryProps["id"][] = [
  "frontend",
  "contract",
  "market",
  "liquidation",
  "technology",
  "governance",
];

export function RiskCategoryCard(props: RiskCategoryProps): JSX.Element {
  return (
    <section
      data-testid={`risk-category-${props.id}`}
      className="rounded-lg border border-border bg-surface"
    >
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text">
          {props.title}
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">{props.description}</p>
      </header>
      <div className="px-4 py-3">{props.children}</div>
    </section>
  );
}

export const RISK_CATEGORY_META: Record<
  RiskCategoryId,
  { title: string; description: string }
> = {
  frontend: {
    title: "Frontend",
    description:
      "Build hash, source-map status, CSP report endpoint, last published block.",
  },
  contract: {
    title: "Contract",
    description:
      "Deployed addresses + EXTCODEHASH + ExternalProtocolFingerprint per integration.",
  },
  market: {
    title: "Market",
    description:
      "Morpho utilization, LLTV, oracle staleness, Curve depth, vault NAV.",
  },
  liquidation: {
    title: "Liquidation",
    description:
      "Position HF range, recent Morpho liquidations, sequencer status + grace timer.",
  },
  technology: {
    title: "Technology",
    description:
      "RPC quorum diversity, indexer anchor freshness, incident history.",
  },
  governance: {
    title: "Governance",
    description:
      "Mutable risk parameters per Lybra-pattern table — owner / bound / current / last-changed.",
  },
};
