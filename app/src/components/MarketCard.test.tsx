import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MarketCard } from "./MarketCard.js";
import { StateBit, type MarketId, type ReadinessResult } from "@wstdiem/sdk";

function wrap(ui: JSX.Element): JSX.Element {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

function buildReadiness(
  overrides: Partial<ReadinessResult> = {},
): ReadinessResult {
  return {
    market:
      "0x4444444444444444444444444444444444444444444444444444444444444444" as MarketId,
    blockNumber: 100n as never,
    stateBitmap: 0 as never,
    perAction: {} as never,
    sources: [],
    sequencer: "ok" as never,
    indexerAnchor: {
      lastAnchoredBlock: 99n as never,
      anchorMaxStaleBlocks: 50,
      anchorEmergencyMultiplier: 3,
      status: "fresh",
    },
    rpcQuorum: {
      threshold: 2,
      size: 3,
      matchedFamilies: ["alchemy", "infura"],
      providerFamilies: ["alchemy", "infura", "publicrpc"],
      status: "agreement",
    } as never,
    ...overrides,
  };
}

describe("MarketCard", () => {
  const mid =
    "0x4444444444444444444444444444444444444444444444444444444444444444" as MarketId;

  it("renders green state-pill when bitmap is zero", () => {
    render(
      wrap(<MarketCard marketId={mid} readiness={buildReadiness()} />),
    );
    const pill = screen.getByTestId("market-card-state-pill");
    expect(pill).toBeInTheDocument();
    expect(pill.textContent).toMatch(/State/);
  });

  it("renders amber state-pill when a named bit is set", () => {
    render(
      wrap(
        <MarketCard
          marketId={mid}
          readiness={buildReadiness({
            stateBitmap: StateBit.ORACLE_DEGRADED as never,
          })}
        />,
      ),
    );
    const pill = screen.getByTestId("market-card-state-pill");
    expect(pill.textContent).toMatch(/State \(1\)/);
  });

  it("renders red audit-gate badge + disables Open when audit gate is closed", () => {
    render(
      wrap(
        <MarketCard
          marketId={mid}
          readiness={buildReadiness({
            stateBitmap: StateBit.AUDIT_GATE_CLOSED as never,
          })}
        />,
      ),
    );
    const auditBadge = screen.getByTestId("market-card-audit-gate");
    expect(auditBadge.dataset.state).toBe("closed");
    const open = screen.getByTestId("market-card-open");
    expect(open).toHaveAttribute("aria-disabled", "true");
  });

  it("flags unknown high bits via warning state pill (synthesis G15)", () => {
    render(
      wrap(
        <MarketCard
          marketId={mid}
          readiness={buildReadiness({
            stateBitmap: (1 << 11) as never, // reserved bit
          })}
        />,
      ),
    );
    const pill = screen.getByTestId("market-card-state-pill");
    expect(pill.textContent).toMatch(/State/);
    const open = screen.getByTestId("market-card-open");
    expect(open).toHaveAttribute("aria-disabled", "true");
  });

  it("expands detail panel on toggle click", () => {
    render(
      wrap(<MarketCard marketId={mid} readiness={buildReadiness()} />),
    );
    expect(
      screen.queryByTestId("market-card-details"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("market-card-toggle"));
    expect(
      screen.getByTestId("market-card-details"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("state-pill-expanded"),
    ).toBeInTheDocument();
  });

  it("renders the automation badge when automationAvailable is set", () => {
    render(
      wrap(
        <MarketCard
          marketId={mid}
          readiness={buildReadiness()}
          automationAvailable
        />,
      ),
    );
    const badge = screen.getByTestId("market-card-automation");
    expect(badge.dataset.available).toBe("true");
  });
});
