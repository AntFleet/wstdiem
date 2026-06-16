# Automation Lifecycle

How user policies flow from creation to execution. Keeper responsibilities at each stage per §8.

## Policy creation (Phase 1 user action)

**Stage A0:** User creates or updates a policy.

```ts
// User calls (not keeper; shown for context)
const policy = await sdk.createAutomationPolicy({
  owner: userAddress,
  market: marketId,
  actionClass: "Rebalance",
  condition: {
    triggerWhen: "healthFactorDrops",
    threshold: 1300n, // 1.3
  },
  bounds: {
    maxDebtIncrease: 0n,
    maxCollateralSold: 50n * 10n ** 18n,
    // ... other bounds ...
  },
  deadline: futureTimestamp,
});
```

Policy is stored on-chain in `LoopAuthorization.policies[policyId]`.

**Indexer captures:** `PolicyCreated(policyId, owner, actionClass, bounds, ...)` event.

## Keeper observation (continuous, keeper action)

**Stage A1:** Keeper continuously checks policy conditions.

```ts
async function watchPolicies(sdk: WstdiemSdk) {
  while (true) {
    // 1. Fetch all policies
    const policies = await sdk.getAutomationPolicies();

    // 2. For each policy, check trigger condition
    for (const policy of policies) {
      const shouldTrigger = await evaluatePolicyCondition(policy, sdk);
      
      if (shouldTrigger) {
        console.log(`Policy ${policy.id} triggered!`);
        await proposeAction(policy, sdk);
      }
    }

    // 3. Wait for next block
    await sleep(blockTimeMs);
  }
}

async function evaluatePolicyCondition(
  policy: Policy,
  sdk: WstdiemSdk,
): Promise<boolean> {
  const risk = await sdk.getPositionRisk(policy.market, policy.owner);
  
  if (policy.condition.triggerWhen === "healthFactorDrops") {
    return risk.healthFactorWad < policy.condition.threshold;
  }
  
  return false;
}
```

**Keeper responsibility:** Monitor continuously. When condition is met, immediately propose.

## Proposal generation (keeper action)

**Stage A0→A1:** Keeper calls `proposeAutomationAction(policyId)`.

```ts
async function proposeAction(
  policy: Policy,
  sdk: WstdiemSdk,
): Promise<TransactionPreview> {
  try {
    // 1. Generate proposal using policy bounds
    const proposal = await sdk.proposeAutomationAction(policy.id);

    console.log(`Proposal generated: ${proposal.digest}`);
    console.log(`Debt increase: ${proposal.readinessResult.debtIncrease}`);
    console.log(`Health factor after: ${proposal.readinessResult.healthFactorWad}`);

    // 2. Verify proposal is within signed bounds
    if (!verifyProposalWithinBounds(policy, proposal)) {
      console.error("Proposal exceeds signed bounds. Rejecting.");
      return null;
    }

    // 3. Check gates pass
    if (!proposal.gateStatuses.every(g => g.decision !== "blocked")) {
      console.warn("Gates blocking. Will retry.");
      return null;
    }

    return proposal;
  } catch (err) {
    console.error("Proposal generation failed:", err);
    throw err;
  }
}

function verifyProposalWithinBounds(
  policy: Policy,
  proposal: TransactionPreview,
): boolean {
  // Verify proposal action respects signed bounds
  const { bounds } = policy;
  const { readinessResult } = proposal;

  if (readinessResult.debtIncrease > bounds.maxDebtIncrease) return false;
  if (readinessResult.collateralSold > bounds.maxCollateralSold) return false;

  return true;
}
```

**SDK behavior:** `proposeAutomationAction` returns a complete `TransactionPreview` ready to execute, or throws if proposal cannot be constructed (insufficient liquidity, bounds mismatch, etc.).

## Execution (keeper action, Phase 1 whitelisted)

**Stage A1→A0:** Keeper calls `executeAutomationProposal(proposalId)`.

```ts
async function executeProposal(
  proposal: TransactionPreview,
  sdk: WstdiemSdk,
): Promise<string> {
  try {
    // 1. Final readiness check before execution
    const readiness = await sdk.getReadiness(policy.market, policy.owner);
    if (readiness.perAction.rebalance.decision === "blocked") {
      console.error("Action is blocked. Cannot execute.");
      throw new Error("Action blocked");
    }

    // 2. Check incident state
    const incidentHistory = await sdk.getIncidentHistory({ limit: 1 });
    const currentIncident = incidentHistory[0];
    if (currentIncident?.state !== "NONE") {
      console.error(`Cannot execute during incident: ${currentIncident.state}`);
      throw new Error("Incident in progress");
    }

    // 3. Execute proposal (uses keeper wallet to broadcast)
    const txHash = await sdk.executeAutomationProposal(proposal.digest);

    console.log(`Execution submitted: ${txHash}`);

    // 4. Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`Execution confirmed in block ${receipt.blockNumber}`);

    return txHash;
  } catch (err) {
    console.error("Execution failed:", err);
    // Log failure for rate-limiting check (G-PM-6)
    recordFailedAttempt(policy.id);
    throw err;
  }
}

function recordFailedAttempt(policyId: string): void {
  // Track failed attempts for rate-limiting (I-72)
  const key = `keeper_failed_${policyId}`;
  const count = redis.incr(key);
  redis.expire(key, 3600); // 1 hour window
  
  if (count > MAX_FAILURES_PER_HOUR) {
    console.error(`Policy ${policyId} exceeded failure rate limit`);
    // SDK will return AutomationAttemptThrottled error
  }
}
```

**Phase 1 constraint:** Only keeper addresses on `registry.permissionlessCallerAllowList` can call `executeAutomationProposal`.

## Event emission (on-chain, executor action)

When execution succeeds:

```
AutomationExecuted(
  proposalId,
  owner,
  market,
  actionDigest,
  transactionHash,
  blockNumber,
)
```

When execution fails:

```
AutomationFailed(
  proposalId,
  owner,
  market,
  actionDigest,
  reason,
  blockNumber,
)
```

**Keeper responsibility:** Monitor events, log outcomes, alert on failures.

## Failure scenarios

### Proposal rejection (before execution)

**Reason:** Gates blocking, insufficient liquidity, bounds mismatch.

**Keeper action:** Log, retry later.

```ts
try {
  await proposeAction(policy, sdk);
} catch (err) {
  if (err.message.includes("CurveLiquidityInsufficient")) {
    console.warn("Curve liquidity too low. Will retry in 30 minutes.");
    scheduleRetry(policy, 30 * 60 * 1000);
  }
}
```

### Execution rejection (on-chain revert)

**Reason:** Quote drifted, position state changed, executor bug.

**Keeper action:** Log failure, alert user, stop retrying.

```ts
try {
  await executeProposal(proposal, sdk);
} catch (err) {
  const revertReason = decodeRevertSelector(err.data);
  if (revertReason.name === "HealthFactorBoundFailure") {
    console.error("Health factor constraint violated. Likely quote drift.");
    alertUser(policy.owner, "Automation failed: health constraint");
  }
}
```

### Incident blocking execution

**Reason:** EmergencyGuardian entered incident state.

**Keeper action:** Stop execution, wait for NONE state.

```ts
const incidentHistory = await sdk.getIncidentHistory({ limit: 1 });
if (incidentHistory[0]?.state !== "NONE") {
  console.warn("Incident in progress. Pausing automation.");
  pauseAutomation(policy.id);
}
```

## Revocation (user or timelock action)

User can revoke a policy at any time via:

```ts
await sdk.revokeAuthorization(policyId);
```

After revocation, policy enters a 5-block "PolicyRevoking" grace period. Keeper must stop proposing for revoked policies.

**Keeper responsibility:** Check policy status before proposing.

```ts
const policy = await sdk.getAutomationPolicies(owner);
const revokingPolicies = policy.filter(p => p.status === "Revoking");
revokingPolicies.forEach(p => {
  console.log(`Policy ${p.id} is revoking. Stopping automation.`);
});
```

## Complete lifecycle flow

```
User creates policy (A0)
    ↓
[Keeper continuously monitors]
    ↓
Condition met → Keeper proposes (A0→A1)
    ↓
Keeper gets proposal / Proposal rejected → Retry or alert
    ↓
Keeper executes proposal (A1)
    ↓
Execution succeeds → AutomationExecuted event
    ↓
Keeper monitors event, completes
    ↓
OR
    ↓
Execution fails → AutomationFailed event
    ↓
Keeper logs failure, alerts user, stops retry
    ↓
User revokes policy → 5-block grace period
    ↓
Keeper stops automation for revoked policy
```

## See also

- [Spec §8](../../PROTOCOL.md) — formal sequencing + keeper x-references
- [MEV Posture](./04-mev-posture.md) — builder selection during execution
- [Incident Response](./06-incident-response.md) — handling emergency pauses
