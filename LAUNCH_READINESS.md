# wstDIEM Protocol — Testnet Beta Launch Runbook

Status of record for taking `0.1.0-rc1` from "primitives complete" to a usable
**Base Sepolia beta**. Derived from a full implementation audit (contracts, SDK,
indexer, anchor, app) on 2026-07-12.

## Readiness summary (updated 2026-07-12 after Tracks A + B)

| Layer | Build | Core path | Remaining to beta |
|---|---|---|---|
| Contracts | ✅ 215 forge tests (+mock E2E open/exit) | ✅ open/rebalance/exit/force-exit + all on-chain gates | Fee routing deferred (out of scope) |
| SDK | ✅ 299 tests | ✅ read/quote/preview/sign-attach **+ `build*Params`** | Automation deferred (out of scope) |
| Indexer | ✅ 13 tests | ✅ ingest/decode/read-API **+ signed responses** | — |
| Anchor | ✅ 8 tests | ✅ manifest/cadence/submit | Manifest = MVP subset (acceptable for beta) |
| App | ✅ 115 tests | ✅ **open/rebalance/exit/force-exit wired** (build→preview→sign→broadcast) | Live e2e vs deployment; ForceExit nonce caveat |

**Overall: functionally beta-ready pending a Sepolia broadcast + live e2e pass.** The
open-loop path is wired end-to-end and proven against mock protocols locally; what remains
is the on-chain broadcast (needs your key/RPC), pointing envs at deployed addresses, and a
Playwright e2e pass against the live deployment.

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
- [x] **T2a. SDK envelope-derivation helper (keystone).** ✅ Added
  `buildOpenParams` / `buildRebalanceParams` / `buildExitParams` / `buildForceExitParams`
  to `WstdiemSdk`; each sources registryVersion+merkleRoot (registry reader), a free nonce
  bit (`allocateNonce` scans the authorization bitmap), a fresh block, verifyingContract/
  executor (config), policyId 0, executionKind `OWNER_DIRECT`, and derived bounds. 7 SDK
  unit tests. SDK 299 passing.
- [x] **T2b. App: wire open/increase.** ✅ `LoopBuilder` now builds the action via
  `useActionParams` → `usePreview` → HF gauge, and `onSign` runs
  `signAndAttachAction` → `broadcastTx` (wagmi). Fail-closed gates preserved.
- [x] **T3. App: wire rebalance / exit / force-exit** sign paths in `Positions.tsx`. ✅
  App 115 passing.
  > ⚠️ **Review caveat (T3, force-exit only):** `allocateNonce` reads the `LoopAuthorization`
  > nonce bitmap for the ForceExit primaryType, but force-exit executes through
  > `LoopForceExitExecutor` (attempt-throttled) and does **not** spend that bitmap. Open/
  > rebalance/exit nonce allocation is correct; **ForceExit nonce derivation must be
  > validated against the deployed mock system (T6)** — may need a dedicated force-exit
  > nonce reader or a different allocation rule. Non-blocking for the core flow; force-exit
  > is an emergency edge path.
- [ ] ~~T4. Automation-policy create~~ — **deferred (manual-only beta).**

### P1 — makes a beta *deployable* (deploy mocks)

- [x] **T5. Mock external-protocol contracts.** ✅ `contracts/v2/mocks/` — MockERC20,
  MockMorpho(+oracle), MockWstDiemVault (ERC-4626), MockCurvePool, MockUniswapV3 flash
  pool+factory, MockChainlinkFeed + MockSequencerFeed — faithful to the exact interface
  signatures the executor/adapter/registry call. No core contract changed.
- [x] **T6. Sepolia deploy prep + local smoke.** ✅ `script/v2/DeployMocks.s.sol` +
  `MockDeploymentKit.sol` deploy the mocks + full system and bootstrap all six registry
  fingerprints (queue → timelock → apply). `test/foundry/v2/MockDeploymentE2E.t.sol`
  deploys everything on the local EVM and exercises **open** and **open→exit** end-to-end
  (3 tests pass). `base-sepolia.json` documents the mock path with `FILLED_AT_DEPLOY_TIME`
  markers. **Actual Sepolia broadcast still 🔒** — needs funded deployer key + RPC; see
  hand-off below.

### 🔒 Sepolia broadcast hand-off (needs you)

1. Provide a funded Base Sepolia deployer key + RPC (`WSTDIEM_MOCK_DEPLOYER`,
   `WSTDIEM_MOCK_GOVERNANCE`, RPC URL).
2. On a live chain the fingerprint **apply** is a *second* tx after the 130k-block timelock
   (the local E2E fast-forwards with `vm.roll`; a real deploy cannot). `DeployMocks.s.sol`
   documents the split.
3. Populate `base-sepolia.json` + app `VITE_CONTRACT_*` + service `.env` from the
   `DeployMocks` console output.
4. `transferOwnership` of the registry to the governance multisig after the apply.
5. Re-validate the **ForceExit nonce caveat** (T3) against the live deployment.

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
- 2026-07-12: Track A done — build*Params + app wiring (SDK 299, app 115). Track B done —
  mock protocols + DeployMocks + MockDeploymentE2E (contracts 215, incl. open+exit E2E).
  Independently re-verified all suites green. Remaining: 🔒 Sepolia broadcast + live e2e +
  ForceExit nonce re-check.
