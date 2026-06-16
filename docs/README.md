# wstDIEM Documentation

User-facing, integrator, and keeper documentation for the wstDIEM Protocol v6. Three audiences, three doc trees — start here.

## For retail users

**Read:** [User docs](./user/README.md)

Plain-language walkthrough for wstDIEM holders who want to open, monitor, rebalance, and exit loop positions via the web app.

- [What is wstDIEM Loop?](./user/01-what-is-wstdiem-loop.md) — intro + what you get + what risks you carry
- [Quickstart](./user/02-quickstart.md) — step-by-step through the UI
- [Risk Disclosures](./user/03-risk-disclosures.md) — liquidation, oracle, MEV, audit gate
- [Wallets](./user/04-wallets.md) — EOA, Safe, Coinbase Smart Wallet paths
- [FAQ](./user/05-faq.md) — common questions
- [Glossary](./user/06-glossary.md) — terms you'll see in the UI

## For SDK integrators

**Read:** [Integrator docs](./integrator/README.md)

API reference and integration patterns for developers building on the TypeScript SDK.

- [Getting Started](./integrator/01-getting-started.md) — install, config, hello-world
- [API Reference](./integrator/02-api-reference.md) — every method on `WstdiemSdk`
- [Action Types](./integrator/03-action-types.md) — Open/Rebalance/Exit/ForceExit envelopes
- [Evidence Model](./integrator/04-evidence-model.md) — canonical-set encoding + sources
- [Gate Evaluation](./integrator/05-gate-evaluation.md) — G-PM-1..6 gates explained
- [Error Registry](./integrator/06-errors.md) — canonical errors + handling
- [Recipes](./integrator/07-recipes.md) — common flows end-to-end
- [Migration Guide](./integrator/08-migration-pr17.md) — what changed in the latest surface

## For keeper operators

**Read:** [Keeper docs](./keeper/README.md)

Runbook for operators running keeper automation, executing proposals, and monitoring protocol health.

- [Keeper Role](./keeper/01-keeper-role.md) — responsibilities + permissionless fallback
- [Setup](./keeper/02-setup.md) — RPC quorum, indexer, addresses, env config
- [Automation Lifecycle](./keeper/03-automation-lifecycle.md) — policy creation → execution
- [MEV Posture](./keeper/04-mev-posture.md) — mevProtectionMode + waiver bits
- [Permissionless Fallback](./keeper/05-permissionless-fallback.md) — when + how + allow-list
- [Incident Response](./keeper/06-incident-response.md) — EmergencyGuardian state machine
- [Monitoring](./keeper/07-monitoring.md) — what to watch + alert thresholds
- [Audit Gate](./keeper/08-audit-gate.md) — gate state + reclose conditions

## Protocol specification

The authoritative public spec lives in [`../PROTOCOL.md`](../PROTOCOL.md). It defines architecture, execution requirements, evidence model, risk model, keeper requirements, public product requirements, event catalog, and governance.

## Status

Pre-production release candidate. Undergoing external audit. Do not point production keepers or production capital at these contracts before the audit gate is closed and an audited deployment is published.
