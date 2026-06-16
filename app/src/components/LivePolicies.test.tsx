import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LivePolicies } from "./LivePolicies.js";
import type { Policy } from "@wstdiem/sdk";

function buildPolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    policyId: 1n as never,
    owner: "0x1111111111111111111111111111111111111111",
    primaryType: "Rebalance",
    policyClass: "REBALANCE",
    policyHash:
      "0x2222222222222222222222222222222222222222222222222222222222222222" as never,
    nonceSlot: 0n,
    nonceBit: 0,
    expiryBlock: 1000n as never,
    mevProtectionMode: "PRIVATE_BUILDER",
    mevWaiverBits: 0,
    executionKind: "OWNER_DIRECT",
    ...overrides,
  };
}

describe("LivePolicies", () => {
  it("renders the loading state", () => {
    render(
      <LivePolicies
        policies={undefined}
        isLoading
        onRevoke={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("live-policies-loading"),
    ).toBeInTheDocument();
  });

  it("renders an empty state when no policies exist", () => {
    render(
      <LivePolicies
        policies={[]}
        isLoading={false}
        onRevoke={vi.fn()}
      />,
    );
    expect(screen.getByTestId("live-policies")).toHaveTextContent(
      /No policies yet/,
    );
  });

  it("renders a permissionless fallback badge for KEEPER_PERMISSIONLESS policies", () => {
    render(
      <LivePolicies
        policies={[
          buildPolicy({
            policyId: 7n as never,
            executionKind: "KEEPER_PERMISSIONLESS",
          }),
        ]}
        isLoading={false}
        onRevoke={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("permissionless-badge-7"),
    ).toBeInTheDocument();
  });

  it("does not render the permissionless badge for owner-direct policies", () => {
    render(
      <LivePolicies
        policies={[buildPolicy({ policyId: 8n as never })]}
        isLoading={false}
        onRevoke={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("permissionless-badge-8"),
    ).not.toBeInTheDocument();
  });

  it("calls onRevoke with the policy when Revoke is clicked", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    const policy = buildPolicy({ policyId: 42n as never });
    render(
      <LivePolicies
        policies={[policy]}
        isLoading={false}
        onRevoke={onRevoke}
      />,
    );
    await user.click(screen.getByTestId("live-policy-revoke-42"));
    expect(onRevoke).toHaveBeenCalledWith(policy);
  });
});
