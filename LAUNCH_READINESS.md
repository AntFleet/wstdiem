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
- [~] **T2a. SDK envelope-derivation helper (keystone).** `quoteOpen`/`quoteRebalance`/
  `quoteExit` require a fully-assembled envelope (registryVersion, merkleRoot,
  verifyingContract, executor, nonce, quoteBlockNumber, evidenceBundleHash, bounds). Add a
  helper that derives it from `(Market, owner, amount, leverageBps, mev, policy defaults)`
  so screens don't hand-assemble it. Unit-testable now against mocks.
- [ ] **T2b. App: wire open/increase** in `LoopBuilder.tsx` to T2a → `usePreview` →
  `signAndAttachAction`. Replace the `proposedAction = undefined` stub + `console.warn` sign.
- [ ] **T3. App: wire rebalance / exit / force-exit** sign paths in `Positions.tsx`.
- [ ] ~~T4. Automation-policy create~~ — **deferred (manual-only beta).**

### P1 — makes a beta *deployable* (deploy mocks)

- [ ] **T5. Mock external-protocol contracts.** Author `contracts/v2/mocks/` (or `test`
  mirror promoted to a deployable): mock Morpho market, mock ERC-4626 wstDIEM vault, mock
  Curve pool, mock Uniswap V3 flash pool, mock Chainlink price + sequencer feeds. Reuse
  existing fork-test mock patterns (`test/foundry/v2/fork/helpers/`).
- [ ] **T6. Sepolia deploy prep + local smoke.** Populate `base-sepolia.json` with the
  mock addresses (deployed by an extended `Deploy.s.sol` mock-bootstrap step); add a
  Foundry test that deploys the full system against the mocks on a local chain and opens a
  loop end-to-end. Actual Sepolia broadcast (funded key + RPC) handed off. 🔒 broadcast only

### P2 — DEFERRED out of first beta (do not implement now)

- [ ] ~~T7. SDK automation actions~~ — deferred (see Decisions).
- [ ] ~~T8. On-chain fee routing~~ — deferred (see Decisions).

### P3 — quality gate before public beta

- [ ] **T9. E2e connect→sign→broadcast coverage.** ~42 action-path Playwright specs
  are `test.fixme`. Un-fixme against a funded test EOA / mock chain.
- [ ] 🔒 **T10. External audit gate closed** (repo's own stated blocker).

---

## Decisions (settled 2026-07-12)

1. **Beta scope = MANUAL ACTIONS ONLY.** Open / increase / rebalance / exit / force-exit,
   user-signed. **T7 automation and T8 fee routing are explicitly deferred out of the
   first beta.** (Force-exit `acknowledgedRisks` path stays in.)
2. **External protocol deps = DEPLOY MOCKS.** No real Base Sepolia Morpho / vault / Curve /
   Chainlink to point at → we ship mock Morpho market, mock wstDIEM ERC-4626 vault, mock
   Curve pool, mock Uniswap V3 flash pool, and mock Chainlink feeds, and pin them in
   `base-sepolia.json`. T5 is now "author + wire mock protocol contracts."
3. **Sequencing = BOTH.** Track A (SDK envelope helper + app wiring, mock-tested) proceeds
   in parallel with Track B (mock contracts + Sepolia deploy). Actual on-chain Sepolia
   broadcast needs a funded deployer key + RPC (external) — everything up to the broadcast
   is prepared and forge-verified locally.

### Deferred (post-first-beta), do NOT implement now
- T7 SDK automation actions (`proposeAutomationAction` / `executeAutomationProposal`) + indexer `AutomationExecuted`.
- T8 on-chain fee routing (`LoopFeeRouter.routeFee` wiring).
The app's Automation *create* screen (T4) is therefore also out of first-beta scope.

---

## Execution log

- 2026-07-12: Runbook created.
- 2026-07-12: T1 done — indexer response signing + Fastify-5 `loggerInstance` fix. All
  workspaces green (indexer 13, anchor 8, sdk 292, app 111).
- 2026-07-12: Decisions settled (manual-only beta; deploy mocks; both tracks). Confirmed
  the SDK already exposes every reader the envelope helper needs (registry version/root,
  authorization nonce bitmap, block number, resolveEvidence) → T2a is compose-not-rebuild.
- 2026-07-12: Started Track A (T2a SDK envelope helper + T2b/T3 app wiring) and Track B
  (T5 mock external-protocol contracts + T6 local deploy smoke) in parallel.
