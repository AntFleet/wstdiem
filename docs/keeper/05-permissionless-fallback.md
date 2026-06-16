# Permissionless Fallback

When permissionless execution is allowed, how users self-execute if keepers fail, and the AC-17 Phase 1 allow-list constraint.

## Why permissionless fallback exists

**Problem:** If all whitelisted keepers are down, automation is blocked.

**Phase 1 solution:** Users can manually execute their own policies.

**Phase 2+:** Permissionless execution will be enabled for anyone (with proofs to prevent griefing).

## When permissionless is allowed

Per AC-17 Phase 1, permissionless execution is **restricted**:

1. Only addresses on `registry.permissionlessCallerAllowList` can execute automation
2. User can always call `executeAutomationProposal` with their own address if they are whitelisted
3. If user is not whitelisted, user must wait for a whitelisted keeper OR upgrade to Phase 2+

### Checking allow-list status

The allow-list is enforced at G-PM-6 evaluation. Check it indirectly by reading the `gateStatuses` returned from `proposeAutomationAction`:

```ts
const preview = await sdk.proposeAutomationAction(policyId);
const g6 = preview.gateStatuses.find((g) => g.name === "CallerNotAllowed");

const callerIsWhitelisted = g6?.decision !== "blocked";
console.log(`Caller is whitelisted: ${callerIsWhitelisted}`);

if (!callerIsWhitelisted) {
  console.log("Caller cannot execute permissionless. Must wait for keeper.");
}
```

## User self-execution flow

If user is on allow-list, they can execute their own policy:

```ts
async function userSelfExecutePolicy(
  user: Address,
  policyId: PolicyId,
  sdk: WstdiemSdk,
) {
  // 1. User generates proposal
  const proposal = await sdk.proposeAutomationAction(policyId);

  // 2. User signs (if needed)
  // Most automation is pre-signed in policy, so no re-signing needed

  // 3. User executes
  const txHash = await sdk.executeAutomationProposal(proposal.digest);

  // 4. Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`Self-execution confirmed: ${receipt.transactionHash}`);
}
```

**Requirements:**
- User must be on allow-list
- User must have Base network access and gas funds
- Proposal must be within signed policy bounds

## Allow-list management

The registry-pinned allow-list is managed by:

1. **Governance** — Multi-sig or DAO vote to add/remove addresses
2. **Timelock** — Per the registry timelock, addition/removal requires 48+ hour timelock
3. **Audit log** — Every allow-list change is emitted as an event

### Adding a keeper to allow-list

```
Proposal → Governance vote → Timelock delay → Execution → Keeper added
```

Process typically takes 1–2 weeks from proposal to execution.

### Removing a keeper from allow-list

Same process. Used if keeper is compromised or behaves badly.

## G-PM-6 gate: CallerNotAllowed

When keeper or user attempts to execute without being on the allow-list:

```ts
const readiness = await sdk.getReadiness(market, owner);
const g6 = readiness.gateStatuses.find(g => g.name === "CallerNotAllowed");

if (g6?.decision === "blocked") {
  console.error("Caller is not whitelisted. Cannot execute.");
  // User must request whitelist addition or wait for Phase 2+
}
```

On-chain, the contract reverts with `CallerNotAllowed` error.

## Rate limiting (G-PM-6 alternative: AutomationAttemptThrottled)

In addition to allow-list, Phase 1 has per-policy rate limiting:

```ts
const failedAttempts = await getFailedAttempts(policyId);
const MAX_FAILURES_PER_HOUR = 5;

if (failedAttempts > MAX_FAILURES_PER_HOUR) {
  console.error("Policy exceeded failed-attempt rate limit");
  // Must wait for cooldown window
}
```

**Why:** Prevents accidental or malicious spam from repeatedly submitting transactions that will revert (wastes gas, clogs mempool).

**Reset:** Rate limit counter resets hourly.

## Transitioning to Phase 2 (permissionless)

Phase 2 will enable true permissionless execution:

1. **Proof-based execution** — Caller proves they are executing within signed bounds
2. **Multi-keeper consensus** — Majority of keepers must agree on proposal before execution (optional)
3. **Keeper bonding** — Keepers post WSTD bond (from the WSTD token specification) to participate
4. **Reputation system** — Keepers scored on reliability + bound adherence

Phase 1 whitelist is a temporary gate until these Phase 2 mechanisms are ready.

## Keeper-as-fallback pattern

If a user is NOT on the allow-list, they should:

1. **Monitor their policies** — Keeper should propose when triggered
2. **Check proposal status** — Confirm keeper submitted a proposal
3. **Wait for execution** — Keeper will execute (or fail with a logged reason)
4. **Alert keeper to issues** — If keeper is down, reach out to keeper operator

Users can request allow-list addition only if:
- They operate their own keeper infrastructure
- They have enterprise SLA requirements
- They are audited institutional keepers

## See also

- [Keeper Role](./01-keeper-role.md) — what keepers do
- [Automation Lifecycle](./03-automation-lifecycle.md) — proposal and execution steps
- [Spec §8 (AC-17, Phase 1)](../../PROTOCOL.md) — permissionless constraints
