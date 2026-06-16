# Audit Gate

The protocol audit gate: what it is, how to check it, and when it closes/reopens.

## What is the audit gate

The audit gate is an on-chain contract switch that controls whether certain actions are allowed.

**Phase 1 state:** CLOSED (audit not yet passed)

**Effect when closed:**
- ✗ Open is blocked
- ✗ Rebalance (leverage increase) is blocked
- ✓ Rebalance (deleverage) is allowed
- ✓ Exit is allowed
- ✓ ForceExit is allowed
- ✓ Revoke is allowed

**Effect when open (Phase 2+):**
- ✓ All actions allowed (subject to other gates)

The gate is a defensive mechanism. When closed, users can exit their positions but not open or increase leverage.

## Checking audit gate status

```ts
// Check if audit gate is closed
const readiness = await sdk.getReadiness(market.id, owner);
const openDecision = readiness.perAction.open;

if (openDecision.error?.name === "AuditGateClosed") {
  console.log("Audit gate is closed. Open is blocked.");
  console.log("Users can still exit or revoke.");
}

// Alternative: check state bitmap
const AUDIT_GATE_CLOSED_BIT = 0b0001 << 10; // Example bit position
if (readiness.stateBitmap & AUDIT_GATE_CLOSED_BIT) {
  console.log("Audit gate closed (state bitmap check)");
}
```

## Reclose conditions

Once audit gate is open, it can be re-closed if:

Per §5.4, reclose happens when any of these change and are not re-audited:

1. **Executor code** — LoopExecutorV2 or LoopForceExitExecutor is modified
2. **Authorization** — LoopAuthorization EIP-712 struct definitions change
3. **Registry entries** — Supported markets, spenders, oracles, flash providers change
4. **Risk oracle** — Oracle adapter, thresholds, or semantic fingerprints change
5. **Error code set** — New canonical error is added without spec update
6. **RPC policy** — Quorum threshold or provider family rules change
7. **MEV policy** — mevProtectionMode enforcement changes
8. **State bitmap** — New state bits are added without audit
9. **Events** — Event signature changes per §11 versioning
10. **Admin roles** — Timelock settings or pause parameters change

**Example:** If Curve's pool is swapped to a new address without re-audit, gate re-closes.

If any protected parameter changes, gate automatically re-closes until:
1. New focused audit is completed
2. Fork proof is provided for every affected action
3. Deployment manifest is updated and reviewed

## Keeper behavior when gate is closed

```ts
async function respecting_audit_gate(sdk: WstdiemSdk) {
  const policies = await sdk.getAutomationPolicies();

  for (const policy of policies) {
    // Check if action is allowed under audit gate
    const readiness = await sdk.getReadiness(policy.market, policy.owner);

    const isAllowed = readiness.perAction[
      policy.actionClass.toLowerCase()
    ].decision === "allowed";

    if (!isAllowed) {
      const error = readiness.perAction[policy.actionClass.toLowerCase()].error;

      if (error?.name === "AuditGateClosed") {
        // Audit gate blocks this action
        console.log(`Policy ${policy.id}: ${policy.actionClass} blocked by audit gate`);
        // Do not propose
        pauseAutomation(policy.id);
      } else {
        // Different error (incident, pause, etc.)
        console.log(`Policy ${policy.id}: ${policy.actionClass} blocked by ${error?.name}`);
        pauseAutomation(policy.id);
      }
    } else {
      // Action is allowed
      if (shouldPropose(policy)) {
        await proposeAction(policy, sdk);
      }
    }
  }
}
```

## Monitoring gate status

```ts
async function monitorAuditGate(sdk: WstdiemSdk) {
  let lastKnownState = "CLOSED";

  setInterval(async () => {
    const readiness = await sdk.getReadiness(market.id);
    const openDecision = readiness.perAction.open;
    const isClosed = openDecision.error?.name === "AuditGateClosed";
    const currentState = isClosed ? "CLOSED" : "OPEN";

    if (currentState !== lastKnownState) {
      console.log(`⚠ Audit gate state changed: ${lastKnownState} → ${currentState}`);
      
      if (currentState === "OPEN") {
        console.log("Audit gate OPENED. Can now open new positions.");
        // Resume all policies
        resumeAllAutomation();
      } else {
        console.log("Audit gate CLOSED. Can only deleverage or exit.");
        // Pause leverage-increasing policies
        pauseLeverageIncreasingPolicies();
      }

      lastKnownState = currentState;
    }
  }, 10 * 60 * 1000); // Check every 10 minutes
}
```

## When gate opens (Phase 2+)

Audit gate opens only after:

1. **External audit passes** — Independent auditors review all Phase 1 code
2. **Deployment manifest reviewed** — Auditors sign off on contract addresses, ABIs, and configurations
3. **Governance vote** — Community or multi-sig votes to open gate
4. **Timelock expires** — Minimum 48-hour delay passes
5. **Gate is opened** — LoopRegistry or EmergencyGuardian enables gate flag

Once open, users can open new positions. Keepers resume all automation.

## If gate re-closes

If a parameter changes and gate automatically re-closes:

1. **Assess impact** — Understand which parameter changed and why
2. **Stop risky actions** — Pause Open and LEVERAGE_INCREASE proposals
3. **Continue deleveraging** — Exit and repay proposals still allowed
4. **Alert stakeholders** — Notify users and team
5. **Await re-audit** — New focused audit will be commissioned
6. **Reopen process** — Same as initial opening (audit → governance → timelock → open)

Reclose is defensive and preserves user ability to exit.

## Checking readiness state

Full readiness check including audit gate:

```ts
async function checkActionAllowed(
  market: MarketId,
  owner: Address,
  actionClass: string,
  sdk: WstdiemSdk,
): Promise<{ allowed: boolean; reason?: string }> {
  const readiness = await sdk.getReadiness(market, owner);
  const decision = readiness.perAction[actionClass.toLowerCase()];

  if (decision.decision === "allowed") {
    return { allowed: true };
  }

  if (decision.decision === "blocked") {
    return {
      allowed: false,
      reason: decision.error?.name,
    };
  }

  return {
    allowed: false,
    reason: "Action not applicable in current state",
  };
}

// Usage
const allowed = await checkActionAllowed(market.id, owner, "Open", sdk);
if (!allowed.allowed) {
  console.log(`Open is blocked: ${allowed.reason}`);
  if (allowed.reason === "AuditGateClosed") {
    console.log("Can only deleverage or exit until audit passes.");
  }
}
```

## See also

- [Risk Disclosures (User Docs)](../user/03-risk-disclosures.md) — how users see the audit gate
- [Spec §5.4](../../PROTOCOL.md) — formal audit gate requirements
- [Incident Response](./06-incident-response.md) — related emergency controls
