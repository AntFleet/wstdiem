# Security residual open items (post remediations)

**Date:** 2026-07-13  
**Baseline `main`:** through ForceExit waiver UX (`9933257`) and prior trust-root / high-tier / evidence / anchor ships.  
**Scope:** residual risk after internal 2026-06-17 audit remediations. Not a third-party audit.

---

## Shipped on `main` (closed this remediation track)

| Track | Commit theme | What closed |
|-------|--------------|-------------|
| Trust-root | `1546afe` | Morpho shares→assets exit path (F01-class), Ownable2Step, critical-role queue/apply, spend allowlist enforcement flag, deploy readiness hooks |
| High-tier | `c14a1ea` | Roles, allowlist wiring, §7.1 bitmap consumers, anchor/cadence hardening |
| Evidence A | `f7d89ba` | Required evidence source sets + fail-closed status checks |
| Anchor B | `17dc395` | Anchor submit always with blockhash (reorg/block consistency) |
| ForceExit C | `9933257` | Waiver UX fail-closed from live state bitmap (I-67 minimality) |

Production **audit gate remains CLOSED** until an external firm report is published (`SECURITY.md` / `LAUNCH_READINESS.md` T10).

---

## Closed on this plan (2026-07-13)

| ID | Item | Severity residual | Status |
|----|------|-------------------|--------|
| R-1 | **Indexer event ABI / topic0 drift** vs `ILoopV1Events` — wrong `LoopActionStep`, `Policy*`, `RegistryConfigBatchCommitted` shapes silently drop or mis-decode live logs | High (ops/indexer integrity) | **Closed:** fixed `indexer/src/events/abi.ts` + handlers; `scripts/event-abi-parity.mjs` + CI workflow |
| R-2 | **`batchUpdate` still single-tx after bootstrap** — fingerprints and critical roles are timelocked; config batches were not | High (admin-key blast radius) | **Closed:** `bootstrapClosed` + queue/apply with `REGISTRY_TIMELOCK_BLOCKS`; readiness requires close |
| R-3 | Residual re-audit write-up (this document) | Info | **Closed** |

---

## Closed engineering residuals (D-1…D-8, except process D-1 firm report)

| ID | Item | Status |
|----|------|--------|
| D-1 | External firm audit **process** | **Scaffolded** under `audit/` (SCOPE, checklist, tracker). Firm engagement / report still **open** — gate T10 stays CLOSED |
| D-2 | Playwright action-path | **Implemented:** mock wallet fixture; UI paths live; remaining sign/broadcast behind `LIVE_E2E=1`; automation stays `test.skip` (beta T4/T7) |
| D-3 | Always-on spender path | **Closed:** no 3-arg allowlist skip; enforce after bootstrap; cannot disable allowlist post-close |
| D-4 | Richer evidence values | **Closed:** `createLiveEvidenceResolver` default (unless placeholder/single-client tests) |
| D-5 | Revoke entrypoint | **Closed:** `LoopAuthorization.executeRevoke` + SDK `buildRevokeExecuteTransaction`; no Morpho executor (spec) |
| D-6 | Oracle decimal normalization | **Closed:** `riskStatus` Morpho/Chainlink → WAD; price-adjusted leverage; tests |
| D-7 | Safe + TimelockController | **Documented:** `docs/governance/SAFE-TIMELOCK.md` — Safe-as-owner + in-contract 130k delay |
| D-8 | RpcQuorum plumbing | **Closed:** more quorumed methods; unquorumed `request` fail-closed; readiness block via `readClient` |
| D-9 | Loop-manager tool residual mediums | **Out of scope** (separate repo) — not implemented |

## Still open (process / live env)

| ID | Item | Owner signal |
|----|------|--------------|
| D-1 report | Hire firm + publish report under `audit/<date>-firm/` then run `CHECKLIST-GATE-OPEN.md` | Launch blocker T10 |
| D-2 LIVE_E2E | Funded Anvil/Sepolia broadcast suite with `LIVE_E2E=1` | Launch T9 completion |
| D-9 | Loop-manager tool mediums | Tool track |

---

## Acceptance for R-1 / R-2

1. Indexer `INDEXER_ABI` topic0 + **indexed flags** match forge artifacts for every subscribed event.
2. CI fails on drift (`indexer` event parity script + workflow).
3. While `bootstrapClosed == false`, `batchUpdate` remains immediate (deploy/bootstrap E2E unchanged).
4. After `closeBootstrap()`, config batches must `queue` → wait `REGISTRY_TIMELOCK_BLOCKS` → `apply` with ops-hash match; production readiness requires bootstrap closed.
5. Forge + indexer + SDK tests green on `main`.

---

## Notes for operators

- Close bootstrap **after** fingerprint queue/apply and initial market wiring, **before** opening any audit gate or pointing real capital.
- Indexer deploys must ship the corrected event ABIs; historical mis-decoded rows (if any on testnets) should be re-indexed from genesis of the corrected ABI.
