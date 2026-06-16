import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateBitmapBanner } from "./StateBitmapBanner.js";
import { StateBit } from "@wstdiem/sdk";

describe("StateBitmapBanner", () => {
  it("renders nothing when bitmap is undefined", () => {
    const { container } = render(<StateBitmapBanner bitmap={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when bitmap is zero", () => {
    const { container } = render(<StateBitmapBanner bitmap={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the audit-gate severity when AUDIT_GATE_CLOSED is set", () => {
    render(<StateBitmapBanner bitmap={StateBit.AUDIT_GATE_CLOSED} />);
    const banner = screen.getByTestId("state-bitmap-banner");
    expect(banner.dataset.severity).toBe("audit-gate");
    expect(banner).toHaveTextContent(/audit gate closed/i);
    expect(banner).toHaveTextContent(/revoke remains available/i);
  });

  it("renders the incident severity when INCIDENT_INVESTIGATING is set", () => {
    render(<StateBitmapBanner bitmap={StateBit.INCIDENT_INVESTIGATING} />);
    expect(screen.getByTestId("state-bitmap-banner").dataset.severity).toBe(
      "incident",
    );
  });

  it("renders the named severity for non-audit-gate non-incident bits", () => {
    render(<StateBitmapBanner bitmap={StateBit.ORACLE_DEGRADED} />);
    expect(screen.getByTestId("state-bitmap-banner").dataset.severity).toBe(
      "named",
    );
    expect(
      screen.getByText("ORACLE_DEGRADED"),
    ).toBeInTheDocument();
  });

  it("renders unknown severity when a reserved bit is set (synthesis G15 fail-closed)", () => {
    const reservedBit = 1 << 11; // bit 11, reserved
    render(<StateBitmapBanner bitmap={reservedBit} />);
    expect(screen.getByTestId("state-bitmap-banner").dataset.severity).toBe(
      "unknown",
    );
  });

  it("renders the §7.1 per-bit matrix copy for a named bit (M-5 closure)", () => {
    render(<StateBitmapBanner bitmap={StateBit.ORACLE_DEGRADED} />);
    const matrix = screen.getByTestId("state-bitmap-banner-matrix");
    expect(matrix).toBeInTheDocument();
    // Per §7.1 row ORACLE_DEGRADED: Open / PartialDeleverage / FullExit blocked;
    // RebalanceDown if P1, RepayOnly if P2, ForceExit if P6; Revoke remains.
    expect(matrix.textContent).toMatch(/Open/);
    expect(matrix.textContent).toMatch(/blocked/);
    expect(matrix.textContent).toMatch(/P1/);
    expect(matrix.textContent).toMatch(/P6/);
    expect(matrix.textContent).toMatch(/Revoke remains available/);
  });
});

// m-do-8 closure: per-bit individual fixtures for the banner. Render one
// bitmap at a time with only that bit set and assert the banner reports
// the correct severity bucket per the bit's classification.
const NAMED_BIT_SEVERITY = [
  { name: "AUDIT_GATE_CLOSED", mask: StateBit.AUDIT_GATE_CLOSED, severity: "audit-gate" },
  { name: "CONFIG_INTEGRITY_FAILURE", mask: StateBit.CONFIG_INTEGRITY_FAILURE, severity: "named" },
  { name: "PAUSE_OPEN_INCREASE", mask: StateBit.PAUSE_OPEN_INCREASE, severity: "named" },
  { name: "ORACLE_DEGRADED", mask: StateBit.ORACLE_DEGRADED, severity: "named" },
  { name: "CURVE_LIQUIDITY_INSUFFICIENT", mask: StateBit.CURVE_LIQUIDITY_INSUFFICIENT, severity: "named" },
  { name: "FLASH_LIQUIDITY_UNAVAILABLE", mask: StateBit.FLASH_LIQUIDITY_UNAVAILABLE, severity: "named" },
  { name: "MORPHO_OWNER_EVIDENCE_MISSING", mask: StateBit.MORPHO_OWNER_EVIDENCE_MISSING, severity: "named" },
  { name: "SEQUENCER_DOWN_OR_GRACE", mask: StateBit.SEQUENCER_DOWN_OR_GRACE, severity: "named" },
  { name: "INCIDENT_INVESTIGATING", mask: StateBit.INCIDENT_INVESTIGATING, severity: "incident" },
  { name: "INCIDENT_MITIGATING", mask: StateBit.INCIDENT_MITIGATING, severity: "incident" },
  { name: "VAULT_EVIDENCE_MISSING", mask: StateBit.VAULT_EVIDENCE_MISSING, severity: "named" },
] as const;

describe.each(NAMED_BIT_SEVERITY)(
  "StateBitmapBanner per-bit fixture",
  ({ name, mask, severity }) => {
    it(`classifies ${name} as severity=${severity} when only that bit is set`, () => {
      render(<StateBitmapBanner bitmap={mask} />);
      expect(screen.getByTestId("state-bitmap-banner").dataset.severity).toBe(
        severity,
      );
    });
  },
);
