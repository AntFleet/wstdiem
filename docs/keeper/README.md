# Keeper Documentation

Runbook for operators running keeper automation, executing proposals, and monitoring the WSTDIEM Loop protocol.

## What this covers

- **Keeper role** — what keepers do, why permissionless fallback exists
- **Setup** — RPC quorum requirements, indexer config, env setup
- **Automation lifecycle** — policy creation → proposal → execution
- **MEV posture** — mevProtectionMode selection and waiver bits
- **Permissionless fallback** — when/how it activates, allow-list constraints
- **Incident response** — EmergencyGuardian state machine and action restrictions
- **Monitoring** — health checks and alert thresholds
- **Audit gate** — gate state verification and reclose conditions

## Before you read

- **You are an operator with infrastructure expertise.** This guide assumes familiarity with RPC endpoints, env configuration, and transaction broadcasting.
- **Phase 1 gates permissionless execution.** Only whitelisted callers can execute automation in Phase 1 per AC-17. This is a temporary Phase 1 restriction.
- **Incident state is authoritative.** The on-chain `EmergencyGuardian` state machine controls what's allowed. Always check it before execution.

## Quick links

- [Setup](./02-setup.md) — RPC quorum, indexer, env config
- [Automation Lifecycle](./03-automation-lifecycle.md) — policy creation → execution flow
- [MEV Posture](./04-mev-posture.md) — mevProtectionMode + waiver bits
- [Incident Response](./06-incident-response.md) — EmergencyGuardian state machine
- [Monitoring](./07-monitoring.md) — health checks and alert thresholds

## Phase 1 keeper constraints

In Phase 1:

1. **Permissionless execution is restricted.** Only whitelisted addresses can call `executeAutomationProposal()` per AC-17.
2. **Force-exit automation is not deployed.** Only Open/Rebalance/Exit policies are active.
3. **Keeper proposals are off-chain.** A keeper generates proposals, but execution is user-initiated or via the allow-list.
4. **Multi-RPC quorum required.** Every safety-critical read must pass through ≥2 distinct provider families (§5.6).

## Key concepts

**Policy** — A user-created automation rule (e.g., "repay 10 DIEM when health factor drops below 1.2").

**Proposal** — A keeper-generated transaction that executes a policy (e.g., "Here is a rebalance that will bring your health back to 1.5").

**Execution** — When the proposal is submitted on-chain and executed by the executor contract.

**Audit gate** — A contract switch that must be open before keeper automation can execute. Remains closed until external audit passes.

**Incident state** — An on-chain enum (NONE / INVESTIGATING / MITIGATING / RESOLVED) that gates certain action classes.

**MEV protection mode** — How the keeper submits the transaction: PRIVATE_BUILDER (hidden until execution) vs PUBLIC_MEMPOOL (public visibility).

## Table of contents

1. [Keeper Role](./01-keeper-role.md)
2. [Setup](./02-setup.md)
3. [Automation Lifecycle](./03-automation-lifecycle.md)
4. [MEV Posture](./04-mev-posture.md)
5. [Permissionless Fallback](./05-permissionless-fallback.md)
6. [Incident Response](./06-incident-response.md)
7. [Monitoring](./07-monitoring.md)
8. [Audit Gate](./08-audit-gate.md)

## Phase 2 & later

Deferred keeper features for Phase 2 and beyond:

- **Liquidation automation** — keepers can trigger liquidations on unhealthy positions
- **Force-exit automation** — automatic exit for positions in critical danger
- **Keeper bonding** — WSTD-bonded reputation system per the WSTD token specification
- **Multi-keeper consensus** — distributed proposal validation across keeper network

Phase 1 focuses on the core policy execution + proposal flow with human oversight for automation.

## Support and monitoring

- **Status page** — protocol health at https://status.wstdiem.example (varies by deployment)
- **Incident log** — check Evidence screen in the app for live incident state
- **Metrics** — monitoring recommendations in [Monitoring](./07-monitoring.md)
- **Escalation** — if you detect an issue, contact the team via the established channel

## See also

- [User docs](../user/README.md) — help for wstDIEM holders
- [Integrator docs](../integrator/README.md) — SDK reference for developers
- [§8](../../PROTOCOL.md) — keeper requirements in the protocol spec
