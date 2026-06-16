// RiskHeader — D.3 full-width header per synthesis D.3.
//
// HF gauge (large), liquidation distance, collateral / debt / equity /
// net spread. USD primary toggle to DIEM / wstDIEM per G.14 (persistent).

import { useEffect, useState } from "react";
import type { PositionRisk } from "@wstdiem/sdk";
import { HealthFactorGauge } from "./HealthFactorGauge.js";

type DenomMode = "USD" | "DIEM" | "wstDIEM";

const STORAGE_KEY = "wstdiem.denom-mode";

interface RiskHeaderProps {
  risk: PositionRisk | undefined;
  /** Optional equity USD value when available. Default: undefined → "—" */
  equityUsd?: string;
}

function fmt(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return value.toString();
}

function readInitialDenom(): DenomMode {
  if (typeof window === "undefined") return "USD";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "USD" || stored === "DIEM" || stored === "wstDIEM") return stored;
  return "USD";
}

export function RiskHeader(props: RiskHeaderProps): JSX.Element {
  const [denom, setDenom] = useState<DenomMode>(readInitialDenom);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, denom);
    }
  }, [denom]);

  return (
    <section
      data-testid="risk-header"
      data-denom={denom}
      className="rounded-lg border border-border bg-surface px-4 py-4"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Position</h2>
        <div
          role="radiogroup"
          aria-label="Denomination"
          className="inline-flex gap-1 rounded-md border border-border bg-surface-raised p-1 text-xs"
        >
          {(["USD", "DIEM", "wstDIEM"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={denom === mode}
              data-testid={`denom-${mode}`}
              data-active={denom === mode}
              onClick={() => setDenom(mode)}
              className={`rounded-sm px-2 py-0.5 transition-colors ${
                denom === mode
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <HealthFactorGauge
          size="lg"
          healthFactorWad={props.risk?.healthFactorWad}
          liquidationDistanceBps={props.risk?.liquidationDistanceBps}
        />
        <dl
          className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4"
          data-testid="risk-header-grid"
        >
          <div>
            <dt className="text-text-muted">Collateral (wstDIEM)</dt>
            <dd className="font-mono text-text">
              {fmt(props.risk?.collateralWstDiem)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Debt (DIEM)</dt>
            <dd className="font-mono text-text">
              {fmt(props.risk?.debtDiem)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Equity ({denom})</dt>
            <dd className="font-mono text-text" data-testid="equity-display">
              {denom === "USD" ? props.equityUsd ?? "—" : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Leverage</dt>
            <dd className="font-mono text-text">
              {props.risk?.leverageBps !== undefined
                ? `${(props.risk.leverageBps / 10_000).toFixed(2)}x`
                : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
