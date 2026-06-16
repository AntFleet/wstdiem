# wstDIEM Protocol

Leveraged loop primitives on Base. The wstDIEM Protocol takes a user's wstDIEM collateral, opens a Morpho borrow, re-supplies the borrowed asset, and ratchets the leverage loop under signed, evidence-gated, fail-closed constraints. Exit, rebalance, and force-exit paths are signed by the user (or attested via EIP-1271) and submitted through a registered authorizer.

This repository contains the v6 release candidate (`0.1.0-rc1`): on-chain contracts, the off-chain indexer + anchor submitter, the TypeScript SDK, the canonical web app, and end-user / integrator / keeper documentation.

> **Status — pre-production.** This release candidate is undergoing external audit. Do not point production keepers or production capital at these contracts before the audit gate is closed and an audited deployment is published.

## Repository layout

```
contracts/      # Solidity sources (LoopAuthorization, LoopExecutorV2, LoopForceExit*, LoopRegistry, ...)
test/           # Foundry tests (unit + fork)
script/         # Foundry deployment scripts
lib/            # Foundry library dependencies (Morpho, OpenZeppelin, forge-std)
indexer/        # Off-chain indexer (SQLite, viem, Fastify)
anchor/         # Anchor snapshot submitter
sdk/            # @wstdiem/sdk — isomorphic TypeScript SDK
app/            # Canonical web app
docs/           # User, integrator, and keeper documentation
PROTOCOL.md     # Public protocol specification
```

## Quick start

Requirements: Node 20+, Foundry (recent stable), Git.

```bash
git clone https://github.com/AntFleet/wstdiem.git
cd wstdiem
npm install

# Build contracts
npm run build:contracts

# Typecheck and test workspaces (indexer, anchor, sdk, app)
npm run typecheck
npm run test

# Foundry tests (non-fork)
npm run test:contracts

# Foundry fork tests — requires BASE_RPC_URL
BASE_RPC_URL=... npm run test:contracts:fork
```

## Architecture at a glance

The protocol is a thin coordination layer between the user, Morpho's lending market, a Curve / Uniswap routing surface, and a registered authorizer. The core safety properties — block-pinned evidence, fail-closed gates, EIP-1271 preimage attestation, RPC quorum, indexer signature verification — are documented in [`PROTOCOL.md`](PROTOCOL.md).

- **Contracts** — `LoopAuthorization` (EIP-712 authorization domain), `LoopExecutorV2` (signed action execution), `LoopForceExitAuthorizer` + `LoopForceExitExecutor` (force-exit domain), `LoopRegistry` (canonical addresses + allow-list), `LoopAnchorRegistry` (anchor snapshots), `RiskOracleAdapter`, `LoopFeeRouter`, `EmergencyGuardian`.
- **Off-chain** — Indexer (SQLite-backed) ingests on-chain events and serves a signed read API; the anchor submitter posts periodic block-pinned snapshots.
- **SDK** — `@wstdiem/sdk` exposes the public surface: market reads, action quoting, transaction preview, gate evaluation (G-PM-1..6), evidence assembly, signature attachment, broadcast, and incident-history reads.
- **App** — Canonical web app for opening, rebalancing, and exiting loops. Integrates EOA (MetaMask, Coinbase Wallet), Safe, and Coinbase Smart Wallet (EIP-1271 + preimage attestation).

## Documentation

- [`docs/user/`](docs/user/) — Plain-language overview, quickstart, risk disclosures, wallet integration paths, FAQ, glossary.
- [`docs/integrator/`](docs/integrator/) — SDK API reference, action envelopes, evidence model, gate evaluation, canonical errors, recipes, PR-17 surface migration notes.
- [`docs/keeper/`](docs/keeper/) — Keeper role + setup, automation lifecycle, MEV posture, permissionless fallback, incident response, monitoring, audit-gate behavior.
- [`PROTOCOL.md`](PROTOCOL.md) — Public protocol specification (architecture, execution model, evidence model, risk model, keeper requirements, product surface, event catalog).
- [`SECURITY.md`](SECURITY.md) — Security disclosure policy.

## Networks

- **Base mainnet** (chain id `8453`) — release candidate; not yet deployed.
- **Base Sepolia** (chain id `84532`) — testnet target for live-testnet validation.

Canonical contract addresses are pinned in `LoopRegistry` once deployed and exposed by `sdk.contracts`.

## Versioning

This release is `v0.1.0-rc1`. Public APIs across SDK and on-chain interfaces are stabilising; breaking changes are expected only in response to external-audit findings before the v0.1.0 tag.

## License

[BUSL-1.1](LICENSE) — Business Source License 1.1. Change Date `2030-06-16`, Change License Apache 2.0. See [`LICENSE`](LICENSE) for the parameter block and a pointer to the canonical text.

## Security

Please do not file public issues for security reports. See [`SECURITY.md`](SECURITY.md) for the private disclosure path and embargo policy.
