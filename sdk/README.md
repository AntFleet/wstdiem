# @wstdiem/sdk

wstDIEM v0.1.0-rc1 TypeScript SDK. Isomorphic (browser + Node 20+). Implements the user-signature path layer of the SDK type definitions in `src/types/`.

## Surface

- **Branded ID types** — `ChainId`, `MarketId`, `ActionDigest`, `PolicyId`, `RouteId`, `QuoteId`, `RegistryVersion`, `BasisPoints`, `BlockNumber`, `UnixSeconds`, `StateBitmap`. Phantom-typed so the compiler catches wrong-kind values before they reach a hash function.
- **Action union** — `Open | Rebalance | Exit | ForceExit | AutomationExec | Revoke` with per-action `bounds` payloads.
- **EIP-712 typehashes** — 25 typehash constants pinned to `contracts/v2/snapshots/typehashes.json`; parity asserted at module load and in the test suite.
- **Digest construction** — `computeOpenDigest()`, `computeRebalanceDigest()`, ..., `computeAutomationExecDigest()`. Mirrors `LoopV1Hashing` byte-for-byte (non-standard EIP-712: typehash is top-level only; sub-struct hashes are pre-computed via `abi.encode`).
- **I-70 evidence canonical-set** — `validateExactSet()` enforces sort + uniqueness + address-binding + exact required spec per §A2. `buildActionEvidence()` produces a sorted bundle with derived `evidenceBundleHash`.
- **I-66 EIP-1271 preimage attestation** — `computePreimageDisplayProof()` + `requiresPreimageProof()` per §A4 NF-15.
- **G-PM-1 .. G-PM-6 post-matrix gates** — pure evaluators that return `GateStatus`. Default to `notApplicable` when no input is supplied.
- **FailClosedErrorName registry** — 77 canonical names with bytes4 selector derivation + `decodeRevertSelector()` for matching on-chain reverts.
- **Anchor freshness + fingerprint classifiers** — pure helpers that convert indexer/registry reads into `AnchorFreshness` and `ExternalProtocolFingerprint` shapes.
- **`WstdiemSdk` interface** — full public SDK method surface.
- **`LiveWstdiemSdk` implementation** — viem `PublicClient` + indexer HTTP client wiring. Read-side methods (`getMarkets`, `getReadiness`, `getPositionRisk`, `getAnchorFreshness`, `getAutomationPolicies`, `getCanonicalErrors`, `getExternalProtocolFingerprints`, `decodeLoopEvent`, `getStateBitmap`, `getRiskStatus`) + thin quote/build (`quoteOpen`/`Rebalance`/`Exit`/`ForceExit`, `buildAuthorization`, `buildTransaction`, `revokeAuthorization`). Full Curve/Uniswap/Morpho quoting + `simulate`/`subscribePosition`/`executeAutomationProposal` land in v0.1.0-rc1.

## Install + build

```bash
# From repo root (workspace mode)
npm install --workspaces --include-workspace-root

# SDK-local
cd sdk
npm test         # vitest run
npm run typecheck
npm run build    # emit dist/
```

## Quickstart

### Compute an Open action digest

```ts
import {
  computeOpenDigest,
  computeDomainSeparator,
  ZERO_SALT,
  asChainId,
  asMarketId,
  asPolicyId,
  asRegistryVersion,
  asBasisPoints,
  asBlockNumber,
  asUnixSeconds,
  type OpenAction,
} from "@wstdiem/sdk";

const domain = {
  name: "WstdiemLoopAuthorization",
  version: "1",
  chainId: asChainId(8453),
  verifyingContract: "0x...LoopAuthorization" as `0x${string}`,
  salt: ZERO_SALT,
};
const domainSeparator = computeDomainSeparator(domain);

const action: OpenAction = { /* ...envelope + bounds... */ } as OpenAction;
const marketParams = { /* ...Morpho MarketParams tuple... */ };
const subHashes = { /* quoteHash, spenderListHash, allowanceScheduleHash, feeCapHash, evidenceBundleHash */ };

const digest = computeOpenDigest({ action, domainSeparator, marketParams, subHashes });
// digest is a branded ActionDigest (bytes32) ready for signing.
```

### Build a canonical ActionEvidence

```ts
import {
  buildActionEvidence,
  validateExactSet,
  requiredSourcesFor,
  type EvidenceSource,
} from "@wstdiem/sdk";

const required = requiredSourcesFor("Open"); // returns labels per §A2
// Resolve each label to its registry-pinned Address via your indexer + registry reader.

const sources: EvidenceSource[] = [/* ...fetched + typed... */];

// Throws EvidenceSetError on missing / unexpected / address-mismatch / unsorted.
const validated = validateExactSet({
  sources,
  required: required.map((sourceId) => ({ sourceId, sourceAddress: addressFor(sourceId) })),
});

const evidence = buildActionEvidence({
  actionId,
  evidenceSetId,
  owner,
  market,
  blockNumber,
  stateBitmap,
  sources: validated,
});
// evidence.evidenceBundleHash is now the canonical sub-hash for the digest.
```

### Evaluate G-PM gates pre-sign

```ts
import {
  evaluatePostMatrixGates,
  gatesAllPass,
  classifyAnchorFreshness,
} from "@wstdiem/sdk";

const anchor = classifyAnchorFreshness({
  lastAnchoredBlock,
  currentBlock,
  // anchorMaxStaleBlocks: 100, anchorEmergencyMultiplier: 3 (Phase 1 defaults)
});

const results = evaluatePostMatrixGates({
  g2: { anchor },
  g4: { primaryType: "Open", signerOnAllowList: false, preimageProof },
  g5: {
    signedMode: "PRIVATE_BUILDER",
    observedChannel: "PRIVATE_BUILDER",
    signedWaiverBits: 0,
    builderKeyAvailable: true,
  },
});
if (!gatesAllPass(results)) {
  // Surface the first failing gate's error name as the SDK refuses to sign.
}
```

### Decode an on-chain revert

```ts
import { decodeRevertSelector } from "@wstdiem/sdk";

const err = decodeRevertSelector(returnDataFromCall);
if (err) {
  // err.name -> FailClosedErrorName, err.humanReadable -> string, err.contractEmitted -> bool.
}
```

## Architecture decisions

- **Isomorphic** — uses only viem + zod + Web-standard primitives. Bundles into both Node and browser without a build-time fork.
- **ESM-only** — modern targets only (Node 20+, evergreen browsers).
- **No runtime network** — every function is pure. Live RPC + indexer integration lands with the `WstdiemSdk` implementation in v0.1.0-rc1.
- **Non-standard EIP-712** — the contract uses `keccak256("Open(...)")` as `OPEN_TYPEHASH` (top-level only). Sub-struct hashes are pre-computed via `abi.encode` in `LoopV1Hashing._hash*` private helpers. The SDK mirrors this exactly via `src/eip712/sub-hashes.ts` + `src/eip712/digest.ts`. Using viem's standard `hashTypedData()` would NOT produce a matching digest.

## Live SDK quickstart (v0.1.0-rc1)

```ts
import { createSdk, asChainId } from "@wstdiem/sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const publicClient = createPublicClient({ chain: base, transport: http() });

const sdk = createSdk({
  chainId: asChainId(8453),
  publicClient,
  indexerBaseUrl: "https://indexer.your-host.test",
  contracts: {
    loopRegistry: "0x...",
    loopAuthorization: "0x...",
    loopForceExitAuthorizer: "0x...",
    loopExecutorV2: "0x...",
    loopForceExitExecutor: "0x...",
    loopAnchorRegistry: "0x...",
    loopRiskOracleAdapter: "0x...",
    loopFeeRouter: "0x...",
    emergencyGuardian: "0x...",
  },
  initialMarkets: [{
    marketId: "0x...",
    morpho: "0x...",
    vault: "0x...",
    loanToken: "0x...",
    collateralToken: "0x...",
    uniswapV3FlashPool: "0x...",
    sequencerUptimeFeed: "0x...",
    chainlinkFeed: "0x...",
  }],
});

// Read-side
const markets = await sdk.getMarkets();
const readiness = await sdk.getReadiness(markets[0].id, ownerAddress);
const risk = await sdk.getPositionRisk(markets[0].id, ownerAddress);
const anchor = await sdk.getAnchorFreshness();
const policies = await sdk.getAutomationPolicies(ownerAddress);

// Build a digest the wallet can sign
const auth = await sdk.buildAuthorization(openAction);
// auth.digest -> bytes32 ready for ECDSA / EIP-1271
// auth.typedData -> wallet display
// auth.evidence -> ActionEvidence bundle

// Build the executor calldata
const tx = await sdk.buildTransaction(openAction);
// tx.to -> registry-resolved executor
// tx.data -> calldata payload
```

## Security model + caveats (v0.1.0-rc1)

v0.1.0-rc1 closes the v0.1.0-rc1 residuals and tightens evidence + signature pinning.

- **Multi-PublicClient RPC quorum — FULLY IMPLEMENTED.** `RpcQuorum.asPublicClient()` returns a viem-shaped client; every `readContract` / `simulateContract` / `getBlockNumber` / `getBlock` / `getLogs` fans out and requires `threshold` distinct families to return byte-identical results, else throws `RpcQuorumMismatch`. All readers (`RegistryReader`, `MorphoReader`, `ChainlinkReader`, `AuthorizationReader`, `AnchorRegistryReader`, `VaultReader`, `CurveQuoter`, `UniswapV3Quoter`) are wired through this proxy so contract reads inherit quorum semantics transparently. Closes v0.1.0-rc1 audit C-1 fully.
- **`getReadiness` short-circuits on degraded quorum.** v0.1.0-rc1 evaluates the quorum status before attempting any reader contract reads. When quorum is configured but currently degraded, OR no quorum is configured AND `allowSingleClientReads !== true`, the method returns a fully-blocked `ReadinessResult` (every `perAction.decision = "blocked"` with `RpcQuorumDegraded` error) without throwing — consumers get a structured answer instead of a raw `RpcQuorumMismatch`.
- **`evidenceResolver.sourceAddress` cross-check — IMPLEMENTED.** `resolveEvidence` now reads `registry.canonicalSource(market, sourceIdHash)` for each resolver-supplied source and refuses bundles whose `sourceAddress` differs from the registry-canonical address. Closes v0.1.0-rc1 audit H-2 adversarial fully.
- **`attachSignature(action, sig, expectedDigest, { pinnedBlockNumber })` — IMPLEMENTED.** `buildTransaction` now returns `pinnedBlockNumber`; callers thread it through `attachSignature` so chain advancement between signing and broadcast doesn't cause spurious `QuoteDrift`. The recomputed digest re-pins to the same block, including the evidence bundle's `blockNumber` field (also pinned in `buildEmptyEvidenceBundle`).
- **Forge artifact ABI diff CI — IMPLEMENTED.** `sdk/scripts/extract-forge-abis.mjs` extracts function + event selectors from compiled `out/<Contract>.sol/<Contract>.json` and diffs them against `sdk/snapshots/abi-selectors.json`. The `sdk-abi-parity.yml` workflow now installs Foundry, runs `forge build`, and invokes the script — drift in either SDK or Solidity fails the workflow.

What's still deferred (v0.1.0-rc1+):

- **Anvil-based `simulate()`** with state-override RPC — currently `simulate()` is an alias for `previewTransaction()`.
- **Websocket-based `subscribePosition`** — polling works for MVP.
- **`proposeAutomationAction` / `executeAutomationProposal` write paths** — Phase 1 permissionless AutomationExec is disabled at the contract layer per AC-17 anyway.
- **Revoke / AutomationExec policy field wire-up** for full digest construction (currently throws "not implemented").

## Security model + caveats (v0.1.0-rc1)

v0.1.0-rc1 closes the v0.1.0-rc1 deferred items and integrates the Codex+Codex+Claude audit findings on top.

- **Multi-PublicClient RPC quorum — IMPLEMENTED.** `config.publicClients` accepts N viem clients, each tagged with a normalized `providerFamily` (alchemy / infura / ankr / quicknode / blast / publicrpc / selfHostedBaseNode). `RpcQuorum.getBlockNumber()` groups by exact value and requires `threshold` distinct families to agree (v0.1.0-rc1 audit compliance H-3). The audit-adversarial H-3 spoofing attack (`alchemy` + `alchemy.io` + `alchemyapi`) is rejected at construction by the normalization allowlist. **Caveat (audit-C1):** the contract READERS (`RegistryReader`, `MorphoReader`, `ChainlinkReader`, `AuthorizationReader`, `AnchorRegistryReader`, `VaultReader`, `CurveQuoter`, `UniswapV3Quoter`) are still wired to `config.publicClient` only. Until v0.1.0-rc1 plumbs every reader through the quorum, configuring `publicClients` causes `getReadiness` to FORCE-BLOCK every per-action decision (the quorum lights up the gate but does not yet vouch for the read values).
- **`getReadiness` fail-closed default — IMPLEMENTED (audit H-4).** When neither `publicClients` nor `allowSingleClientReads: true` is supplied, every per-action decision is blocked with `RpcQuorumDegraded`. Explicit opt-in is required to acknowledge the I-68 trust boundary.
- **Indexer signature verification — IMPLEMENTED.** `config.indexerSigningKey` + `config.indexerVerifier` enable verification of indexer responses against the registry-pinned signing key. The signed message format is `WSTDIEM_INDEXER_V1\n${path}\n${body}` (v0.1.0-rc1 audit compliance H-1) so an attacker cannot replay one endpoint's body as another's response. The verifier hook is caller-supplied to avoid pinning a single crypto scheme; viem's `recoverMessageAddress` is the recommended default.
- **`attachSignature(action, sig, expectedDigest?)` — IMPLEMENTED.** Caller-friendly path for completing the calldata produced by `buildTransaction`. Internally re-runs `assembleAuthorization` to recompute the digest and throws `QuoteDrift` if `expectedDigest` is supplied and differs (catches stale quotes between signing and broadcast).
- **Real evidence bundle assembly via `config.evidenceResolver` — IMPLEMENTED.** When the registry's `requiredEvidenceSourceSet(primaryType)` is non-empty AND no resolver is supplied, the SDK throws rather than signing a digest the on-chain validator will reject. The resolver-supplied bundle is validated for: required-set coverage by `sourceIdHash`, no duplicate `(sourceIdHash, sourceAddress)` entries (v0.1.0-rc1 audit adversarial H-2), and well-formed source entries. **Caveat:** `sourceAddress` is NOT yet cross-checked against `registry.canonicalSource(market, sourceId)` — that landing is v0.1.0-rc1.
- **Empty-route fail-closed — IMPLEMENTED (audit M-2).** When a quoter is configured but `deriveRoutes` returns empty, `buildAuthorization` throws rather than signing a zero `quoteHash`.
- **Event topic-0 ABI parity lock — IMPLEMENTED (audit M-1).** `sdk/snapshots/abi-selectors.json` now includes an `events` map; `test/abi-parity.test.ts` enforces bidirectional equality.
- **Chainlink staleness — IMPLEMENTED (audit L-2 / M-9 / M-10).** `ChainlinkReader.readWithStaleness({nowSeconds, staleAfterSeconds, blockNumber})` rejects `answer<=0`, `answeredInRound<roundId`, and `(now-updatedAt)>staleAfterSeconds`. `getPositionRisk` invokes it with the chain's `block.timestamp` (defeats client clock skew) and `config.oracleStaleAfterSeconds ?? 3600` (matches Chainlink ETH/USD heartbeat).
- **Canonical encoding for quorum equality — IMPLEMENTED (audit M-5).** Length-prefixed encoding avoids the `string`/`object` collision.

What's still deferred (v0.1.0-rc1+):

- **Plumb every reader through `RpcQuorum.readContract`** — closes the residual audit-C1. v0.1.0-rc1 forces blocking when quorum is configured but readers aren't plumbed, so consumers cannot accidentally trust a forged single-RPC read; production deployment still wants the full plumb.
- **`sourceAddress` cross-check against `registry.canonicalSource`** — catches the malicious-resolver class of attacks. v0.1.0-rc1 validates structure + uniqueness; v0.1.0-rc1 will tie sourceAddress to the registry-canonical address.
- **Anvil-based `simulate()`** with state-override RPC — currently `simulate()` is an alias for `previewTransaction()`.
- **Websocket-based `subscribePosition`** — polling works for MVP.
- **`proposeAutomationAction` / `executeAutomationProposal` write paths** — Phase 1 permissionless AutomationExec is disabled at the contract layer per AC-17 anyway.
- **Forge-extracted ABI artifact diff in CI** — currently snapshot-locked.
- **Per-action `attachSignature` recomputation pinning** — `attachSignature` re-runs `getBlockNumber()`, so chain advancement between `buildTransaction` and `attachSignature` causes a digest mismatch even when nothing about the quote drifted. v0.1.0-rc1 will accept an optional `pinnedBlockNumber`.

## Security model + caveats (v0.1.0-rc1)

v0.1.0-rc1 closes the v0.1.0-rc1 limitations marked **CLOSED** below and documents what remains.

- **`buildAuthorization` digest assembly — CLOSED.** Real sub-hashes are now derived from the action bounds + on-chain quotes:
  - `quoteHash` ← `hashQuoteRoutes(routes)` where `routes` is the canonical-ordered list of Curve / Uniswap V3 / Morpho-flash legs derived live from `CurveQuoter.getDy()` + `UniswapV3Quoter.quoteExactInputSingle()`.
  - `spenderListHash` + `allowanceScheduleHash` ← Phase 1 empty-bundle hashes bound via `SPENDER_LIST_TYPEHASH` / `ALLOWANCE_SCHEDULE_TYPEHASH`.
  - `feeCapHash` ← `hashFeeCaps()` over the action's `flashFeeCap` / `protocolFeeCap` / `automationFeeCap`.
  - `evidenceBundleHash` ← already derived in v0.1.0-rc1.
  Signatures over the produced digest now validate against the on-chain `validate*` recompute byte-for-byte.
- **A5-3 on-chain anchor cross-check — CLOSED.** `getReadiness` and `getAnchorFreshness` now read `LoopAnchorRegistry.lastAnchorBlock()` and fetch the matching `StateSnapshotAccepted` log; mismatch throws `Anchor cross-check failed (...)`. Default is strict (`strictAnchorCrossCheck: true`); set `false` only for staging / diagnostic environments.
- **A6-4 ABI parity — CLOSED.** `sdk/snapshots/abi-selectors.json` pins the canonical 4-byte selectors for every SDK-consumed entrypoint and read function. `sdk/test/abi-parity.test.ts` re-derives selectors from the inline ABIs via `viem.toFunctionSelector` and fails closed on drift. `.github/workflows/sdk-abi-parity.yml` runs the parity test + tsc + the full suite on PR.
- **A3-8 block-pinned reads — CLOSED.** `getReadiness` and `getPositionRisk` pin every sub-read to the same `blockNumber`, collapsing the TOCTOU window between the readiness fan-out reads.
- **Full executor calldata — CLOSED.** `buildTransaction` produces `executeOpen` / `executeRebalance` / `executeExit` (LoopExecutorV2) and `executeForceExit` (LoopForceExitExecutor) calldata via `encodeFunctionData`. `decodeCalldata` is the round-trip inverse.
- **Multi-event ABI — CLOSED.** `decodeLoopEvent` now recognizes the full §11 set: `LoopActionStarted` / `LoopActionStep` / `LoopActionCompleted` / `LoopOpenedV2` / `LoopRebalancedV2` / `LoopExitedV2` / `LoopForceExitedV2` / `PolicyCreated` / `PolicyUpdated` / `PolicyRevoking` / `AutomationExecuted` / `AutomationFailed` / `StateSnapshotAccepted`.
- **Polling subscriptions — CLOSED.** `subscribePosition()` polls `getPositionRisk` at `config.positionPollIntervalMs` (default 12000ms ≈ Base block time) and emits diffs only. Returned cancel function is idempotent. Upgrade path to websockets is v0.1.0-rc1.
- **Full positionRisk — CLOSED.** `getPositionRisk` now returns `healthFactorWad` + `leverageBps` + `liquidationDistanceBps` derived from Chainlink + Morpho LLTV + vault NAV. Surfaces `OracleStale` / `OracleMissing` in `errors` when the oracle path fails.

What's still deferred (v0.1.0-rc1+):

- **No RPC quorum.** A single `PublicClient` does not satisfy the RPC quorum invariant. v0.1.0-rc1 keeps `rpcQuorum.status === "degraded"` so consumers know not to trust the placeholder. v0.1.0-rc1 wires a multi-client quorum tracker.
- **Indexer signature verification.** Anchor manifestHash is cross-checked against on-chain logs in v0.1.0-rc1; v0.1.0-rc1 adds signature verification against the registry-pinned `indexerSigningKey()` so even a non-cross-checkable indexer response is rejected when unsigned.
- **`getExternalProtocolFingerprints` requires `config.integrationIds`.** Without the deployment-manifest bytes32 ids, the call throws (fail-closed per audit A8-5). Unchanged in v0.1.0-rc1.
- **Automation write paths** — `proposeAutomationAction` / `executeAutomationProposal` still throw "not implemented in v0.1.0-rc1; landing in v0.1.0-rc1." Phase 1 permissionless AutomationExec is disabled at the contract layer per AC-17 anyway, so this surface is informational until Phase 2.
- **`simulate()` is the same call as `previewTransaction()`** — it returns the live quote + calldata but does not Anvil-fork or state-override. v0.1.0-rc1 may add Anvil-based simulation when a fork URL is supplied.

## v0.1.0-rc1 surface additions

v0.1.0-rc1 closes the 5 SDK surface gaps logged as open-questions during v0.1.0-rc1 audit. Every gap closure adds a new SDK surface and corresponding test coverage; the app's v0.1.0-rc1-era workarounds are scheduled for removal in a follow-up commit on `phase-d/pr-16-app`.

### Method index

- `WstdiemSdk.attachSignature(action, signature, expectedDigest?, opts?)` — splice the wallet signature into the calldata produced by `buildTransaction`. Re-runs the full action assembly with `opts.pinnedBlockNumber` so chain advancement between build and sign does not raise `QuoteDrift`. Returns `{ to, data, digest }`.
- `WstdiemSdk.contracts` — readonly canonical contract address bundle (`SdkContractAddresses`). Populated from `config.contracts` at construction time after the zero-address check passes.
- `WstdiemSdk.authorizerNameFor(verifyingContract)` — synchronous authorizer NAME resolution (`LoopAuthorization` | `LoopForceExitAuthorizer` | `UNRECOGNIZED`). Used by the C-1 phishing-defeat banner to surface attacker substitutions as a hard sign-block.
- `WstdiemSdk.getIncidentHistory(opts?)` — read EmergencyGuardian `IncidentStateChanged` events into typed transitions. Block-pinned reads, finality envelope per §11. Throws `IncidentReaderUnavailable` when `config.contracts.emergencyGuardian` is zero.
- `decodeAcknowledgedRisks(mask)` / `decodeMevWaiverBits(mask)` (exported from `@wstdiem/sdk`) — decode `ForceExitRiskBit` / `MevWaiverBit` bitmasks into `DecodedRiskBit[]` with canonical names + plain-language copy. Source of truth replacing the duplicate registry in `app/src/lib/risk-bits.ts`.
- `TransactionPreview.gateStatuses` is now populated by every `quote*`, `previewTransaction`, and `simulate` call (v0.1.0-rc1 returned `[]`). `ReadinessResult.gateStatuses` is also populated by `getReadiness` for the orthogonal G-PM-1..6 surface.
- `Policy.acknowledgedRisks` (optional) — surfaced on FORCE_EXIT policies returned by `getAutomationPolicies` so the §6.3 policy renderer can decode via `decodeAcknowledgedRisks` rather than re-implementing the bit-name map.
- Error registry additions: `ContractsConfigInvalid` (constructor zero-address check), `IncidentReaderUnavailable` (Gap 4 fail-closed at runtime).

### Per-gap closure summary

| Gap | Surface added | Replaces app workaround |
| --- | --- | --- |
| 1 | `attachSignature` on `WstdiemSdk` interface | `app/src/hooks/useBuild.ts:83-95` runtime feature-detect cast |
| 2 | `gateStatuses` wiring through quote/preview/simulate + `ReadinessResult` | `app/src/hooks/useGpmGates.ts` synthetic frontend-side computation |
| 3 | `sdk.contracts` + `sdk.authorizerNameFor()` | `app/src/lib/contracts.ts` env-direct `VITE_CONTRACT_*` reads |
| 4 | `sdk.getIncidentHistory()` + `EMERGENCY_GUARDIAN_EVENTS_ABI` | D.5 `IncidentHistory.tsx` placeholder |
| 5 | `Policy.acknowledgedRisks` + `decodeAcknowledgedRisks`/`decodeMevWaiverBits` | `app/src/lib/risk-bits.ts` duplicate bit-name registry |

The IncidentTransition type uses the contract-canonical surface (`previousState`, `state`, `blockNumber`, `blockTimestamp`, `txHash`, `finality`) — note that `EmergencyGuardian.IncidentStateChanged` does NOT emit `actor` or `reason` fields (see `contracts/v2/interfaces/ILoopV1Events.sol:103-105`); the build prompt's reference to those fields was descriptive rather than contract-derived.

## What's deferred

v0.1.0-rc1+ (frontend integration + write paths):
- Multi-PublicClient RPC quorum tracker (closes A3-9 fully)
- Indexer signature verification (extends A5-3)
- Anvil-based `simulate()` with state-override RPC
- Websocket-based `subscribePosition`
- `proposeAutomationAction` / `executeAutomationProposal` write paths
- React hooks wrapper (`useReadiness`, `useQuoteOpen`, ...)
- Wallet connector layer (RainbowKit / wagmi compatibility)
- Per-wallet preimage display flows for I-66 high-risk paths

## References

- the SDK type definitions — source of truth for every type in this package.
- [PHASE-A-INTERFACE-SHAPES.md](../../wstdiem-audit/PHASE-A-INTERFACE-SHAPES.md) — Solidity interface shapes the SDK mirrors.
- [the protocol spec.md §6.4](../../wstdiem-audit/the protocol spec.md) — canonical EIP-712 digest field rules.
- the protocol threat model — protocol invariants referenced throughout.
