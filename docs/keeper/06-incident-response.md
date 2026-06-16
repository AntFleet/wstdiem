# Incident Response

The EmergencyGuardian state machine and what keepers must do in each state per §7.1.

## EmergencyGuardian state machine

Four states define what's allowed:

```
NONE (normal) ↔ INVESTIGATING ↔ MITIGATING ↔ RESOLVED ↔ NONE
```

State transitions are governed by the `EmergencyGuardian` contract and emit `IncidentStateChanged` events.

### State NONE

**What it means:** No incident. Protocol is operating normally.

**What's allowed:**
- ✓ Open
- ✓ Rebalance (all modes)
- ✓ Exit
- ✓ ForceExit
- ✓ Revoke
- ✓ Automation execution

**Keeper action:** Execute normally.

### State INVESTIGATING

**What it means:** An issue has been discovered. Team is investigating severity and fix.

**What's allowed:**
- ✗ Open (blocked)
- ✗ Rebalance increase (blocked; deleverage allowed)
- ✓ Rebalance deleverage
- ✓ Rebalance health recovery
- ✓ Exit
- ✓ ForceExit
- ✓ Revoke
- ✓ Automation execution (deleverage/exit only)

**Keeper action:** Stop proposing Open and LEVERAGE_INCREASE actions. Continue with deleveraging and exits.

### State MITIGATING

**What it means:** Issue confirmed. Fix is being deployed. Some positions may need force-exit.

**What's allowed:**
- ✗ Open
- ✗ Rebalance increase
- ✓ Rebalance deleverage / recovery
- ✓ Exit
- ✓ ForceExit
- ✓ Revoke
- ✓ Automation execution

**Keeper action:** Same as INVESTIGATING. Prioritize deleveraging and exits for high-risk positions.

### State RESOLVED

**What it means:** Fix deployed and verified. Incident is closed.

**What's allowed:**
- ✓ All actions (same as NONE)

**Keeper action:** Resume normal operations. Any INVESTIGATING→NONE should be transient; confirm with team before re-opening.

## Reading incident state

```ts
const history = await sdk.getIncidentHistory({ limit: 1 });
const currentTransition = history[0];

console.log(`Current state: ${currentTransition.state}`);
console.log(`Previous state: ${currentTransition.previousState}`);
console.log(`Block: ${currentTransition.blockNumber}`);
console.log(`Finality: ${currentTransition.finality}`); // "provisional" | "finalized"
```

**Finality:** Provisional if < 10 blocks old (can reorg). Finalized if ≥10 blocks old.

## Keeper state check before execution

```ts
async function canExecutePolicy(
  policyId: PolicyId,
  actionClass: string,
  sdk: WstdiemSdk,
): Promise<boolean> {
  // 1. Get current incident state
  const history = await sdk.getIncidentHistory({ limit: 1 });
  const state = history[0]?.state ?? "NONE";

  // 2. Check if action is allowed in this state
  const allowed = {
    NONE: ["Open", "Rebalance", "Exit", "ForceExit", "Revoke"],
    INVESTIGATING: ["Deleverage", "Exit", "ForceExit", "Revoke"],
    MITIGATING: ["Deleverage", "Exit", "ForceExit", "Revoke"],
    RESOLVED: ["Open", "Rebalance", "Exit", "ForceExit", "Revoke"],
  };

  if (!allowed[state].includes(actionClass)) {
    console.warn(`${actionClass} is blocked in state ${state}`);
    return false;
  }

  return true;
}

// Before executing a policy
const canExecute = await canExecutePolicy(policyId, "Rebalance", sdk);
if (!canExecute) {
  console.log("Action is blocked due to incident state. Pausing automation.");
  pauseAutomation(policyId);
}
```

## Keeper incident response workflow

### On incident detection

1. **Read incident state** — Call `sdk.getIncidentHistory()` frequently (every block or every 30 seconds)
2. **Alert team** — Notify on-call engineer immediately
3. **Pause risky actions** — Stop proposing Open / LEVERAGE_INCREASE
4. **Continue deleveraging** — Prioritize exit and repayment proposals for high-risk positions
5. **Monitor for recovery** — Watch for state change back to NONE or RESOLVED

### During INVESTIGATING

```ts
async function duringInvestigating(sdk: WstdiemSdk) {
  const policies = await sdk.getAutomationPolicies();

  for (const policy of policies) {
    if (policy.actionClass === "Open" || policy.actionClass === "LEVERAGE_INCREASE") {
      console.log(`Pausing ${policy.actionClass} policy ${policy.id}`);
      pauseAutomation(policy.id);
      // Continue monitoring but do not propose
    }

    if (
      policy.actionClass === "Rebalance" &&
      policy.bounds.maxDebtIncrease > 0n
    ) {
      // Convert to deleverage-only mode
      console.log(`Converting policy ${policy.id} to deleverage-only`);
      convertToDelevernageOnly(policy.id);
    }
  }
}
```

### On recovery (INVESTIGATING → RESOLVED)

```ts
async function onIncidentResolved(sdk: WstdiemSdk) {
  const history = await sdk.getIncidentHistory({ limit: 1 });
  const currentState = history[0].state;

  if (currentState === "RESOLVED") {
    console.log("Incident resolved. Resuming normal automation.");

    // Re-enable previously paused policies
    const pausedPolicies = await getPausedAutomationPolicies();
    for (const policy of pausedPolicies) {
      console.log(`Resuming policy ${policy.id}`);
      resumeAutomation(policy.id);
    }
  }
}
```

## Monitoring incident state continuously

```ts
async function monitorIncidentState(sdk: WstdiemSdk) {
  let lastKnownState = "NONE";

  setInterval(async () => {
    const history = await sdk.getIncidentHistory({ limit: 1 });
    const currentState = history[0]?.state ?? "NONE";

    if (currentState !== lastKnownState) {
      console.warn(`⚠ Incident state changed: ${lastKnownState} → ${currentState}`);
      console.log(`Block: ${history[0].blockNumber}, Finality: ${history[0].finality}`);

      // Alert team
      alertOnCall(`Incident: ${lastKnownState} → ${currentState}`);

      // Adjust automation
      if (currentState !== "NONE") {
        pauseRiskyAutomation();
      } else {
        resumeNormalAutomation();
      }

      lastKnownState = currentState;
    }
  }, 30 * 1000); // Check every 30 seconds
}
```

## Incident state + policy bounds interaction

The state machine is orthogonal to policy bounds. Example:

- User signed a Rebalance with `maxDebtIncrease = 50 DIEM` (leverage increase)
- Incident state → INVESTIGATING (blocks leverage increase)
- Keeper CANNOT execute this policy in INVESTIGATING state (action is blocked)
- Keeper must wait for NONE or user must revoke and create a deleverage-only policy

The state machine is a hard gate, not negotiable.

## Documentation and post-mortems

After an incident is resolved:

1. **Document timeline** — Record state transitions with exact block numbers
2. **Summarize impact** — Which policies were paused, for how long
3. **Post-mortem** — Team writes incident summary (cause, impact, fix, prevention)
4. **Lessons learned** — Keeper teams often have input on observability improvements

Keeper logs are valuable for post-mortems. Keep them.

## See also

- [Monitoring](./07-monitoring.md) — what to monitor continuously
- [Spec §7.1](../../PROTOCOL.md) — state bitmap and incident state definition
- [User docs: Risk Disclosures](../user/03-risk-disclosures.md) — how users see incidents
