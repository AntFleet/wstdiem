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

## Still open / deferred (not this PR)

| ID | Item | Why deferred | Owner signal |
|----|------|--------------|--------------|
| D-1 | **External firm audit** + publish under `audit/` | Process / budget; gate T10 | Launch blocker |
| D-2 | **Playwright action-path un-fixme** (~42 specs) vs funded EOA / mock chain | Needs live beta env (LAUNCH T9) | Launch readiness |
| D-3 | **Always-on spender path** for production without soft harness defaults | Deploy/manifest already pins spenders when enforced; remaining is ops discipline + any harness-only bypasses | Deploy review |
| D-4 | **Richer evidence values** (beyond required-set membership / status) | Product depth; fail-closed set membership shipped | SDK/indexer |
| D-5 | **Revoke has no dedicated executor entry** | Spec Phase-1 scope; activity-absence recovery still works | Spec follow-up |
| D-6 | **Oracle decimal normalization** (Chainlink 1e8 / Morpho 1e36 vs HF WAD) adversarial re-pass | Completeness-critic item; needs dedicated math audit | Pre-external audit |
| D-7 | **Safe + external TimelockController** if contract size / governance requires it | Ownable2Step + in-contract 130k-block queues cover Phase-1; Safe optional | Governance |
| D-8 | **Full `RpcQuorum.readContract` plumbing** for every reader | Partial; residual audit-C1 | SDK ops |
| D-9 | Loop-manager tool residual mediums (Telegram, fork exit against accruing debt, etc.) | Separate repo (`wstdiem` tool); not protocol v6 monorepo | Tool track |

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
