# Keeper Role

What a keeper does, what they cannot do, and why permissionless fallback exists.

## What a keeper does

A keeper is an operator who watches for automation policy conditions and proposes + executes transactions on behalf of users.

**Typical workflow:**

1. **User creates a policy** — "When my health factor drops below 1.3, propose a rebalance"
2. **Keeper observes via indexer** — Continuously checks policy conditions against chain state
3. **Keeper proposes action** — When condition is met, keeper calls `proposeAutomationAction(policyId)` to generate the transaction
4. **Keeper executes proposal** — Keeper calls `executeAutomationProposal(proposalId)` to submit the transaction to chain
5. **On-chain executor validates** — The executor contract verifies the proposal matches the user's signed policy envelope
6. **User receives outcome** — Position is rebalanced, health factor improved, or action fails with reason

## What a keeper CANNOT do

The on-chain executor enforces strict bounds on keeper actions:

1. **Cannot exceed signed bounds** — The keeper must execute within the exact parameters the user signed (§6.4 bound-parity)
   - If user signed "borrow up to 50 DIEM", keeper cannot borrow 51 DIEM
   - If user signed "repay at least 40 DIEM", keeper cannot repay 39 DIEM

2. **Cannot change action type** — If policy is for Rebalance, keeper must execute Rebalance, not Exit

3. **Cannot overwrite nonce** — Each action consumes a nonce. Keeper cannot replay or re-execute the same nonce

4. **Cannot sign for users** — Keeper submits user-signed transactions. Keeper does not create new signatures

5. **Cannot bypass gates** — All G-PM-1..6 gates still apply. Keeper cannot skip them

6. **Cannot transfer collateral or debt** — Keeper manipulates user position, not balances

## Why permissionless fallback exists

**Problem:** If keepers are centralized or unavailable, users cannot execute their automation.

**Phase 1 solution:** Only whitelisted callers can execute automation (per AC-17). This is a temporary restriction.

**Future (Phase 2):** Permissionless execution will be allowed for any caller who can prove they are executing within the signed policy bounds. This requires multi-keeper consensus or proof mechanisms (out of scope for Phase 1).

**Fallback:** If all whitelisted keepers fail, users can still:
1. Manually call `proposeAutomationAction(policyId)` to generate a proposal
2. Manually call `executeAutomationProposal(proposalId)` using their own wallet
3. Or manually take action (open, rebalance, exit) without automation

This fallback preserves user agency and prevents keeper dependency.

## Keeper responsibilities

When operating a keeper:

1. **Monitor obsessively** — Check policy conditions frequently (every block or several times per block)
2. **Propose when triggered** — Call `proposeAutomationAction()` the instant a policy condition is met
3. **Execute responsibly** — Call `executeAutomationProposal()` promptly, but only when executor will succeed
4. **Handle failures gracefully** — Log failures, do not spam the network with retry attempts
5. **Respect MEV constraints** — If a policy requires private-builder mode, use it; if public mempool, set the waiver bit
6. **Check incident state** — Before execution, verify the EmergencyGuardian is not in an incident state that would block the action
7. **Monitor gas and liquidity** — Ensure Morpho and Curve have sufficient liquidity for the proposed action

## Keeper vs. user intent

**Keeper's job:** Execute what the user signed, optimally and safely.

**Keeper's limitation:** Keepers cannot change user intent. If a user signed "repay 20 DIEM", the keeper must repay close to 20 DIEM, not 19 or 21.

**Conflict resolution:** If a keeper detects that executing now would violate bounds (e.g., due to price movement), the keeper should:
1. NOT execute
2. Log the reason
3. Alert the user
4. Wait for the user to update the policy or for conditions to improve

## Keeper reputation (Phase 2)

In Phase 2, keepers will be bonded (per the WSTD token specification) and rated on:

- **Execution reliability** — How often they execute when proposed
- **Quote freshness** — How recent their proposals are
- **Bound adherence** — How tightly they stay within user-signed bounds
- **Gas efficiency** — How much gas they waste
- **Incident response** — How quickly they stop execution when an incident occurs

Phase 1 has no bonding or reputation, but best practices now build foundation for Phase 2 scoring.

## See also

- [Automation Lifecycle](./03-automation-lifecycle.md) — step-by-step execution flow
- [Permissionless Fallback](./05-permissionless-fallback.md) — when/how users can self-execute
- [§8](../../PROTOCOL.md) — keeper requirements in protocol spec
