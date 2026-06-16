# wstDIEM Protocol — Security Policy

This document describes how to report security vulnerabilities in the wstDIEM Protocol v6.

> **Status — pre-production.** The contracts in this repository are NOT yet deployed to a public network. The protocol audit gate (defined in [`PROTOCOL.md`](PROTOCOL.md) §5.4) must be closed by governance before any deployment handles real user funds. All addresses in `script/v2/configs/*.json` placeholder configs are zero-address placeholders pending the deployment ceremony.

## Reporting a Vulnerability

If you have discovered or believe you have discovered a security vulnerability in the wstDIEM Protocol, please email it to:

- **Security contact:** `augstar@gmail.com`
- **Subject prefix:** `[WSTDIEM SECURITY]`

A PGP public key for encrypted reports will be published at the same address before mainnet deployment. Until then, please use plain email and avoid including exploit details for vulnerabilities that could affect any testnet deployment.

We aim to acknowledge reports within **3 business days** and to provide an initial triage decision within **7 calendar days**.

## Scope

### In scope

- `contracts/v2/*.sol` — the protocol contracts
- `contracts/v2/interfaces/*.sol`
- `contracts/v2/libraries/*.sol`
- `script/v2/Deploy.s.sol` and `script/v2/DeploymentManifest.sol`
- `script/v2/configs/*.json` (deployment configs)
- `indexer/` — off-chain indexer service (event consumption + HTTP API)
- `anchor/` — anchor submitter service
- `sdk/` — `@wstdiem/sdk` TypeScript SDK (public read + sign surface)
- `app/` — canonical web application

### Out of scope

- External dependencies: Morpho Blue, Curve, Uniswap V3, the wstDIEM vault, Chainlink, Base sequencer — these are upstream trust assumptions documented in [`PROTOCOL.md`](PROTOCOL.md) §7.
- Issues that depend on:
  - Compromised governance multisig
  - Compromised guardian role
  - Compromised indexer signing key
  - Operator misconfiguration (e.g., wrong RPC endpoint, non-canonical contract addresses)
- Phase G expansion features (multi-chain, multi-market, alternative flash providers, ERC-7702 / smart-account migration, gauges, emissions) — not in this release.

## Severity guidance

We adopt the standard categories aligned with Spearbit / Trail of Bits / OpenZeppelin practice:

- **Critical** — direct theft / loss of user funds, drainage of the protocol fee accumulator, permanent freeze of user positions.
- **High** — theft of yield / non-principal value, unauthorized policy or position state mutation, ability to grief `Exit` / `ForceExit`.
- **Medium** — temporary value loss, governance or role bypass with limited scope, registry / config integrity issues.
- **Low** — best-practice deviations, defense-in-depth gaps with no concrete exploit path, code-quality or documentation issues.
- **Info** — stylistic / convention notes that do not affect security.

We reserve the right to adjust severity based on context (for example, a Critical finding in an unreachable code path may downgrade to Low).

## Disclosure window

For pre-deployment vulnerabilities, we aim to acknowledge and triage within **7 calendar days** and ship a fix within **30 calendar days** depending on complexity.

For post-deployment vulnerabilities (once mainnet contracts exist):

- **Critical** — target a fix within **72 hours**, coordinated public disclosure within **30 days** (or sooner if we cannot patch).
- **High** — target a fix within **14 days**, disclosure within **45 days**.
- **Medium** — target a fix within **30 days**, disclosure within **60 days**.
- **Low / Info** — included in the next routine release.

These targets are aspirational. The actual disclosure timeline depends on coordination with affected users, integrators, and external auditors.

## Bug Bounty

A formal bug bounty program is **not yet established**. We intend to announce one (likely via Immunefi) before mainnet launch. Until then, vulnerability reports are appreciated and may be eligible for ex-gratia compensation at the team's discretion, based on severity and report quality.

## Insurance

No protocol-level insurance policy is in place at the time of this document. Decision pending external audit closure.

## External audit

This release is undergoing external audit prior to mainnet deployment. Audit reports will be published in this repository under `audit/` once available. Do not point production keepers or production capital at these contracts before the audit gate is closed and an audited deployment is published.

## Hall of Fame

Researchers who responsibly disclose qualifying vulnerabilities will be acknowledged, with their consent, once we have any to acknowledge.

## License

Reports and disclosure communications are received under the BUSL-1.1 license that governs this repository. By submitting a report you grant us the right to incorporate fix-related details in public commits and disclosure communications.
