import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HealthFactorGauge } from "./HealthFactorGauge.js";

describe("HealthFactorGauge", () => {
  it("renders the HEALTH_INDETERMINATE sentinel when healthFactorWad is undefined", () => {
    render(<HealthFactorGauge healthFactorWad={undefined} />);
    expect(screen.getByText("HEALTH_INDETERMINATE")).toBeInTheDocument();
    const gauge = screen.getByTestId("hf-gauge");
    expect(gauge.dataset.tier).toBe("unknown");
  });

  it("renders the red tier at HF=1.00", () => {
    const wad = 10n ** 18n; // HF = 1.00
    render(<HealthFactorGauge healthFactorWad={wad} />);
    expect(screen.getByTestId("hf-gauge").dataset.tier).toBe("red");
    expect(screen.getByText(/1\.00/)).toBeInTheDocument();
  });

  it("renders the amber tier at HF=1.10", () => {
    const wad = (110n * 10n ** 18n) / 100n; // 1.10
    render(<HealthFactorGauge healthFactorWad={wad} />);
    expect(screen.getByTestId("hf-gauge").dataset.tier).toBe("amber");
  });

  it("renders the green tier at HF=1.50", () => {
    const wad = (150n * 10n ** 18n) / 100n; // 1.50
    render(<HealthFactorGauge healthFactorWad={wad} />);
    expect(screen.getByTestId("hf-gauge").dataset.tier).toBe("green");
  });

  it("renders the liquidation distance copy when provided and not indeterminate", () => {
    const wad = (130n * 10n ** 18n) / 100n;
    render(
      <HealthFactorGauge
        healthFactorWad={wad}
        liquidationDistanceBps={1500}
      />,
    );
    expect(screen.getByText(/15\.0% buffer/)).toBeInTheDocument();
  });
});
