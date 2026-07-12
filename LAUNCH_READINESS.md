# wstDIEM Protocol — Testnet Beta Launch Runbook

Status of record for taking `0.1.0-rc1` from "primitives complete" to a usable
**Base Sepolia beta**. Derived from a full implementation audit (contracts, SDK,
indexer, anchor, app) on 2026-07-12.

## Readiness summary

| Layer | Build | Core path | Blocker to beta |
|---|---|---|---|
| Contracts | ✅ green (264 fns, fork tests) | ✅ open/rebalance/exit/force-exit + all on-chain gates | Fee routing not wired; placeholder deploy config |
| SDK | ✅ 292 tests | ✅ read/quote/preview/sign-attach | Automation methods throw (PR-13); indexer sig verify-only |
| Indexer | ✅ 8 tests | ✅ ingest/decode/read-API | **Never signs responses** (no key) |
| Anchor | ✅ 8 tests | ✅ manifest/cadence/submit | Manifest = MVP subset |
| App | ✅ 111 tests | ❌ **open-loop action stubbed** | Sign paths are `console.warn`; zero-addr config |

**Overall: NOT launch-ready.** A user cannot open a loop end-to-end today.

---

## Work items (ordered)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · 🔒 external dependency (cannot be done in-repo)

### P0 — makes a beta *functional*

- [x] **T1. Indexer response signing.** ✅ Optional `WSTDIEM_INDEXER_SIGNING_KEY`
  added to config; `onSend` hook signs every GET response as
  `WSTDIEM_INDEXER_V1\n${url}\n${payload}` (EIP-191) and emits `X-Indexer-Signature`
  (exposed via CORS). Verified end-to-end against the SDK's canonical envelope in
  `indexer/test/api-signing.test.ts` (3 tests, incl. URL-binding replay guard).
  **Also fixed a latent Fastify-5 startup bug** — `buildApi` passed a pino instance via
  `logger`, which throws `FST_ERR_LOG_INVALID_LOGGER` in Fastify 5; switched to
  `loggerInstance`. No existing test exercised `buildApi`, so the API server would not
  have started as shipped.
- [ ] **T2. App: wire the open/increase action path.** `LoopBuilder.tsx` hard-codes
  `proposedAction = undefined` and the Sign handler is `console.warn`. Wire it to the
  existing `useBuild` / `signAndAttachAction` layer (plumbing already present).
  *Files:* `app/src/screens/LoopBuilder.tsx`, `app/src/hooks/useBuild.ts`, e2e specs.
- [ ] **T3. App: wire rebalance / exit / force-exit sign paths.** Same pattern in
  `Positions.tsx` (`onAction`, `onForceExitSign` are `console.warn`).
- [ ] **T4. App: wire automation-policy create** (`Automation.tsx onSignPolicy`).
  Depends on T7 if execution is in scope; policy *creation* signing can land first.

### P1 — makes a beta *deployable*

- [ ] 🔒 **T5. Source real Base Sepolia addresses.** Populate
  `script/v2/configs/base-sepolia.json` + the three service `.env.example` files with
  real Morpho / Uniswap V3 / Curve / Chainlink / wstDIEM-vault / market addresses (or
  deploy mocks). **Needs external input** — see "Decisions needed".
- [ ] **T6. Deploy to Base Sepolia + publish manifest.** Run `script/v2/Deploy.s.sol`
  against T5 config; capture deployed addresses into a committed manifest; point app +
  services env at them. Blocked by T5.

### P2 — feature-complete for keeper beta (optional for first beta)

- [ ] **T7. SDK automation actions.** Implement `proposeAutomationAction` /
  `executeAutomationProposal` (currently throw "landing in PR-13");
  real `AutomationExec` bounds (not zero placeholders); indexer `AutomationExecuted`
  handler.
- [ ] **T8. On-chain fee routing.** Wire `LoopFeeRouter.routeFee` into the executor
  path (§9) or explicitly scope fees out of beta. Pull-style + `FeePayoutFailed` +
  `acceptsFees` semantics per spec.

### P3 — quality gate before public beta

- [ ] **T9. E2e connect→sign→broadcast coverage.** ~42 action-path Playwright specs
  are `test.fixme`. Un-fixme against a funded test EOA / mock chain.
- [ ] 🔒 **T10. External audit gate closed** (repo's own stated blocker).

---

## Decisions needed (external input)

1. **T5 addresses:** Are there existing Base Sepolia deployments of Morpho + a wstDIEM
   vault + a Curve pool to point at, or do we deploy mock protocols? This gates all of P1.
2. **Fee model in beta (T8):** charge fees on testnet, or explicitly scope out?
3. **Automation in beta (T7):** is keeper/automation in scope for the *first* beta, or
   manual actions only?

---

## Execution log

- 2026-07-12: Runbook created.
- 2026-07-12: T1 done — indexer response signing + Fastify-5 `loggerInstance` fix. All
  workspaces green (indexer 13, anchor 8, sdk 292, app 111).
