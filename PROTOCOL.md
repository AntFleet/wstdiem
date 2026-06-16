# wstDIEM Protocol Specification

**Version:** v6 release candidate (`0.1.0-rc1`)  
**Networks:** Base mainnet (`8453`), Base Sepolia (`84532`)  
**Status:** Pre-production. Undergoing external audit.

This document is the public protocol specification for the wstDIEM leveraged-loop primitive. It defines the on-chain architecture, execution model, evidence model, risk and oracle requirements, keeper requirements, public product requirements, event catalog, and governance model.

Internal planning, audit, phasing, and decision-tracking artifacts are not included in this public spec. The public surface contract is what is documented here, plus the canonical contract addresses pinned in `LoopRegistry`, the SDK type definitions in `@wstdiem/sdk`, and the event catalogue in §11.

## Table of Contents

1. [Architecture](#5-architecture) — contracts, off-chain services, user surfaces, audit gate, interface contract, RPC trust model
2. [Execution Requirements](#6-execution-requirements) — open, rebalance, exit, authorization, MEV posture
3. [Risk And Oracle Requirements](#7-risk-and-oracle-requirements) — degraded-mode matrix, reorg policy, external protocol fingerprint
4. [Keeper And Automation Requirements](#8-keeper-and-automation-requirements)
5. [Fees And Revenue](#9-fees-and-revenue)
6. [Public Product Requirements](#10-public-product-requirements)
7. [Data, Events, And Points Evidence](#11-data-events-and-points-evidence)
8. [Governance And Admin Requirements](#12-governance-and-admin-requirements)
9. [Explicit Non-Goals](#15-explicit-non-goals)

---

## 5. Required Architecture

### 5.1 Contracts

Required contracts (Phase 1):

- Phase 1 executor topology — two deployables:
  - `LoopExecutorV2`: stateless audited contract dispatching on EIP-712 `primaryType` for the Open / Rebalance / Exit action classes. Inherits `LoopExecutorBase` for `_approveExact`, `_safeTransfer`, `_canonicalFlashPool`, and `_validateDeploymentConfig` helpers. Dispatch isolation is enforced by (a) distinct `primaryType` per action class with a distinct `typeHash` registered in the EIP-712 domain, (b) exact-shape calldata validation per `primaryType` — every Morpho/Curve/flash call has its calldata reconstructed from the digest's structured fields and asserted byte-equal before forwarding (I-51/I-52/I-53), and (c) per-action transient-storage arming bits that prevent cross-action callback reentry. Supports exactly one flash provider in Phase 1 (Uniswap V3); the canonical pool address is registry-pinned and re-verified inside the callback.
  - `LoopForceExitExecutor`: separate stateless deployable for force-exit at a distinct `verifyingContract` (`LoopForceExitAuthorizer`) so wallets give the user unambiguous EIP-712 domain display. Phishing-resistance (distinct verifyingContract) cannot be elided by dispatcher coercion because the executor entrypoint asserts `digest.primaryType == FORCE_EXIT` and the deployable is not reachable from `LoopExecutorV2`. Inherits `LoopExecutorBase`. Supports Uniswap V3 flash only in Phase 1.

  Both inherit `LoopExecutorBase` as audited shared library. The shipped exit-only `LoopExecutor` is reference behavior, not the deployment basis. Topology revised from initial 4-executor split per 2026-06-12 architect audit (Codex): the 4-executor surface multiplied deployment, codehash, registry, manifest, audit-gate, and reorg-replay testing footprint for a solo non-Solidity-dev operator without adding security value beyond the force-exit boundary (which the 2-executor topology preserves).
- `LoopAuthorization`: the sole Morpho-authorized address per owner and the canonical authority for action digest verification, policy storage, and nonce management. Holds Morpho authorization on behalf of every user (Bundler3 Adapter-style router); executors call `LoopAuthorization.executeMorpho(digest, sig, calldata)` to perform Morpho operations and never call Morpho directly. Validates EIP-712 action digests via `SignatureChecker.isValidSignatureNow` (ECDSA + EIP-1271). Stores per-owner per-action Permit2-style 256-bit nonce bitmaps consumed atomically with the final state-changing external call. Stores automation policies with policy IDs and a 5-block revocation grace period during which automation reverts `PolicyRevoking`. Bound storage is a strict superset of executor-enforced bounds from §6.1/§6.2/§6.3 (parity matrix in the SDK type definitions). Non-upgradeable; major-version migrations require fresh user authorization against a new `verifyingContract`.
- `LoopRegistry`: timelocked registry (≥48h; exact duration) for supported markets, vaults, Curve pools, Morpho markets, oracles, flash providers, executors, fee receivers, and app-visible metadata. Each registry change increments a monotonic `registryVersion` bound into every action digest. Spender sets and executor addresses are merkle-rooted for cheap on-chain proofs.
- `LoopRiskOracleAdapter`: read-only sanity checker; never an execution price source. Normalizes wstDIEM NAV (donation-resistant via `convertToAssets(1e18)`), Morpho oracle price, Chainlink-style external feeds with mandatory L2 Sequencer Uptime Feed pairing, and Curve-implied price (informational only). Cross-check oracle set must exclude the active route venue. Produces a `RiskStatus` struct consumed by off-chain readiness and by `LoopAuthorization.validate` for action-gate decisions. Per-pair deviation thresholds are registry-pinned.
- `LoopFeeRouter`: pull-style fee receiver for execution, automation, and protocol fees. Receivers pull from the router; user actions emit `FeePayoutFailed` and continue if a receiver reverts. Exits especially are unblockable via fee-receiver griefing. Receiver upgrades are timelocked, require `code.length > 0`, and probe `IFeeReceiver.acceptsFees()`. Does not require WSTD.
- `EmergencyGuardian`: per-action-class pause bitmap. Guardian can only set "blocked" for `Open` and `Increase`. It cannot block `Repay`, `Deleverage`, `Exit`, `ForceExit`, or `Revoke`. Pause toggles are rate-limited (≤1 per N blocks; N) and auto-expire after 7 days without governance reaffirmation. Incident state is an on-chain enum (`NONE | INVESTIGATING | MITIGATING | RESOLVED`) writable by the guardian; downstream contracts and off-chain code read this enum, not a runbook.

Optional later contracts:

- `LoopKeeperBond`: WSTD-bonded keeper registry after the WSTD token bond clear.
- `LoopMarketFactory`: Prisma-inspired factory if multiple collateral/market deployments need standardized activation.
- `LoopLiquidationQueue`: only if WSTDIEM builds native keeper queues rather than relying on Morpho liquidation surfaces and off-chain scanning.
- `LoopAuthorizationSafeModule`: Safe Module implementing the `LoopAuthorization` interface on a per-Safe basis. Phase G option for institutional onboarding; Phase 1 serves Safe users via EIP-1271 sign-as-Safe through the canonical `LoopAuthorization`.

### 5.2 Off-Chain Services

Required services:

- public read API for market evidence, market discovery, route quotes, simulations, transaction previews, automation proposals, readiness, audit-gate status, and incident state.
- event indexer for deposits, opens, rebalances, exits, authorization changes, executor events, fees, keeper actions, and failed attempts.
- keeper network for alerting, safe deleverage proposals, full-exit proposals, and optionally user-authorized execution.
- risk engine for health factor, Curve depth, Morpho utilization, borrow APY, base APY, oracle deviation, route slippage, flash liquidity, and concentration.
- public status page and incident log; the on-chain `EmergencyGuardian` incident enum is authoritative — the page mirrors, it does not gate.
- reporting pipeline for SPEC003 points and launch metrics.

Indexer integrity model:

- Every indexer response includes the response `blockNumber` and a `manifestHash` covering the indexer's most recent state snapshot. The `manifestHash` is signed by an indexer key registered in `LoopRegistry`; the SDK validates the signature against the registry-pinned public key before consuming the response.
- The contract emits a periodic `StateSnapshotAccepted(blockNumber, manifestHash)` event only from `LoopAnchorRegistry` on behalf of the authorization perimeter, recording the indexer's claimed snapshot root. PR-6 moved this emit surface out of `LoopAuthorization` to preserve the router's EIP-170 margin while keeping the registry-pinned role and event semantics unchanged; `LoopAuthorization` MUST NOT expose a duplicate snapshot submission path. Any divergence between an indexer response and the most recently anchored snapshot raises an alert; the SDK fails closed on divergence.
- For any safety-critical decision (signing, executing, generating an automation proposal), the SDK cross-checks the indexer's claim against a direct on-chain read at the latest finalized block before proceeding.
- Reorg handling: events below `finalityThreshold` confirmations on Base (≥10; see §7.2) are returned with a `provisional: true` flag. SDKs and keepers refuse to build production transactions or fire automation against provisional state. Automation proposals carry a `notBefore` block computed against the finality threshold.
- The risk engine has no privileged signing authority and no contract-level role. Its proposals are observability only; execution is permissionless within the user's signed policy envelope and is independently re-validated by the executor at the action's block.

Anchor authority and key rotation:

- The `StateSnapshotAccepted` event is emitted from `LoopAnchorRegistry` and is callable only by an `anchorSubmitter` role registered in `LoopRegistry`. The `anchorSubmitter` role is operationally separate from the `indexerSigningKey` that signs `manifestHash` — compromise of one MUST NOT enable the other to forge a false anchored snapshot. the SDK type definitions pins the role separation, the on-chain access control, and the required wallet topology (multisig or dedicated EOA per role).
- Anchor cadence: `StateSnapshotAccepted` MUST be emitted at least once per `anchorMaxStaleBlocks` (registry-pinned value; default 100 blocks ≈ 200s on Base). Absence of a fresh anchor within this window flips the SDK into degraded mode: safety-critical reads MUST be served from direct on-chain reads against the §5.6 RPC quorum, not from indexer cache. The SDK surfaces `INDEXER_ANCHOR_STALE` as a canonical fail-closed error code.
- Stale-anchor behavior: when `block.number - lastAnchoredBlock > anchorMaxStaleBlocks × anchorEmergencyMultiplier` (default multiplier 3), the SDK refuses to sign any new digest and refuses to fire automation. The matrix in §7.1 already treats this as a degraded-mode condition under the broader integrity-failure state bit; the anchor staleness is a sub-cause surfaced for triage.
- Key rotation procedure (`indexerSigningKey` AND `anchorSubmitter`):
  - rotation requires the O7 timelock (72h minimum) executed against `LoopRegistry`.
  - rotation MUST overlap — the new key is added to the registry as an acceptable signer/submitter while the old key remains valid, both keys are operationally tested for one anchor cycle, then the old key is revoked. Atomic rotation (revoke-then-add) is rejected.
  - rotation events are emitted as `IndexerSignerRotated(oldKey, newKey, effectiveBlock)` and `AnchorSubmitterRotated(oldRole, newRole, effectiveBlock)` and feed §11 envelope events.
  - a compromised indexer key cannot anchor its own false root because the `anchorSubmitter` role is held separately; a compromised `anchorSubmitter` cannot forge a signed manifest because it lacks the `indexerSigningKey`. Both compromises simultaneously is treated as a Protocol Audit Gate v2 reclose condition.
- Anchor submitter accountability: every `StateSnapshotAccepted` carries `tx.origin` and `msg.sender` in the indexer-side metadata pipeline; rotation drills verify the anchor submitter cannot be impersonated by a stale `anchorSubmitter` key after rotation completes.

### 5.3 User Surfaces

Required user surfaces:

- web app for market inspection, connect, simulate, preview, authorize, open, rebalance, deleverage, exit, revoke, automate, monitor, and download evidence.
- SDK for integrators with typed quote, simulate, calldata, authorization, execution, and status APIs.
- CLI/operator mode retained for advanced users and evidence collection.
- docs for users, integrators, keepers, auditors, and emergency operators.

### 5.4 Protocol Audit Gate V2

The existing [Production Audit Gate](./docs/deployment/audit-gate.md) is scoped to the current exit-only `LoopExecutor`. the protocol must define and satisfy Protocol Audit Gate v2 before any new production broadcast surface is enabled.

Protocol Audit Gate v2 must include a reviewed deployment manifest with:

- reviewed git commit hash.
- chain id and deployment environment.
- every enabled contract address, ABI hash, bytecode hash, constructor input, initializer input, owner, admin, guardian, timelock, and upgradeability status.
- every registry entry for markets, vaults, Curve pools, Morpho markets, oracles, flash providers, executors, fee receivers, and external spenders.
- app, SDK, API, indexer, keeper, CLI, deployment script, and runbook commit hashes.
- canonical action list: open, increase, rebalance down, repay-only, partial deleverage, full exit, force exit, revoke, and automation execution.
- canonical command surfaces and disabled command surfaces.
- audit reports, focused review reports, bug-bounty scope, dry-run evidence, fork proofs, strict readiness evidence, closed-beta evidence, and incident-drill evidence.

Protocol Audit Gate v2 must close or remain closed when any of these change after review:

- Phase 1 executor code (`LoopExecutorV2`, `LoopForceExitExecutor`, `LoopExecutorBase`), ABI, constructor input, initializer input, deployed bytecode, per-`primaryType` dispatch table inside `LoopExecutorV2`, or transient-storage callback-arming layout.
- `LoopAuthorization`, EIP-712 struct definitions (any `primaryType`), nonce logic, revocation logic, policy storage, Morpho coordination (Bundler3 Adapter-style `executeMorpho`), `SignatureChecker` integration, or `LoopForceExitAuthorizer` deployment.
- `LoopRegistry`, registry entries, supported markets, supported spenders, route definitions, oracle adapters, flash providers, fee receivers, indexer public key, RPC quorum policy, private-builder list, OR any `ExternalProtocolFingerprint` per §7.3 (Curve pool semantic invariants, Uniswap V3 pool semantic invariants, Chainlink aggregator phase/decimals, wstDIEM vault accounting fingerprint, Morpho oracle/IRM fingerprint, Base sequencer feed baseline), including tolerance-band parameters and live-baseline staleness windows.
- `LoopRiskOracleAdapter`, oracle sources, heartbeat thresholds, stale-data thresholds, deviation thresholds, NAV cross-check logic, sequencer-uptime pairing, or `RiskStatus` schema.
- §5.5 `ActionEvidence` struct, `EvidenceSource` enumeration, per-action evidence requirements, or `evidenceBundleHash` derivation.
- §5.5 canonical fail-closed error code set (any addition, removal, selector change, or SDK enum value change).
- §5.6 RPC trust model (quorum threshold, stale-RPC definition, indexer integrity model, finality threshold from §7.2).
- §6.5 `mevProtectionMode` enforcement model, registered private-builder list, `revealAfterBlocks`, or sealed-auction settlement contract.
- §7.1 state bitmap, P-predicate set, or matrix combination rule.
- §11 event envelope (`LoopActionStarted` / `LoopActionCompleted` schema, action-digest topic indexing, signature-name versioning rule, or `StateSnapshotAccepted` semantics).
- `LoopFeeRouter`, `EmergencyGuardian`, admin roles, timelock settings, pause-toggle rate limit, incident enum semantics, or emergency procedures.
- App, SDK, API, indexer, keeper, readiness, simulator, transaction-preview, calldata-building, codegen schema, or deployment code.
- Production operating procedure, keeper procedure, signer set, deployer address, command surface, or incident process.

Any reclose requires fresh focused review, fresh readiness evidence, fresh fork proof for every affected action, and an updated reviewed deployment manifest.

### 5.5 Interface Contract

The protocol must have an interface appendix or companion interface spec that defines:

- Solidity interfaces and event signatures for the executor family (`LoopExecutorV2`, `LoopForceExitExecutor`, `LoopExecutorBase`), `LoopAuthorization`, `LoopForceExitAuthorizer`, `LoopRegistry`, `LoopRiskOracleAdapter`, `LoopFeeRouter`, and `EmergencyGuardian`. Interfaces MUST document the `LoopExecutorV2` `primaryType` → entrypoint dispatch table and the per-action transient-storage arming bit layout.
- TypeScript types for market IDs, action IDs, policy IDs, route IDs, quote IDs, evidence bundles, readiness results, position risk, transaction previews, and fail-closed errors.
- API request and response schemas for market discovery, market evidence, readiness, quote, simulate, transaction preview, position risk, automation policies, automation proposals, event history, and evidence bundles.
- The canonical EIP-712 struct definitions per §6.4 with each action class's distinct `primaryType`, `typeHash`, and sub-struct typeHashes; the rule that every sub-hash is `keccak256(abi.encode(subTypeHash, fields))`.
- Canonical hash formats: `quoteHash`, `actionDigest`, `registryVersion` (uint256 monotonic counter, paired with `registryMerkleRoot`), `spenderListHash` (sorted-by-(token, spender) canonical encoding), `allowanceScheduleHash` (sequential delta list the executor consumes, not a summary), `feeCapHash`, `evidenceBundleHash`. `failureConditionHash` is included only if the protocol retains it per §6.4.
- Block consistency rules: every preview, quote, readiness result, automation proposal, and evidence bundle records the block number used for each on-chain read and fails closed when reads are stale or internally inconsistent. See §7.2 for reorg / confirmation policy and finality thresholds.
- Versioning and deprecation rules: event signatures use signature-name versioning (`LoopOpenedV2`); the topic[0] selector change is the load-bearing signal indexers monitor. SDK/API responses carry a semver `apiVersion`. Action digest schemas are versioned by EIP-712 `primaryType` change; the wallet sees a different primary type for any breaking field change. Registry entries are versioned by the `registryVersion` monotonic counter; deprecated SDK surfaces emit a `deprecationWindow` field with the block at which they stop responding.

`ActionEvidence` is the canonical per-action evidence struct consumed by previews, readiness, automation proposals, and `LoopAuthorization.validate`:

```
struct ActionEvidence {
    bytes32 actionId;             // EIP-712 primaryType hash
    bytes32 evidenceSetId;        // route variant discriminator per the per-primaryType schedule in the `@wstdiem/sdk` type definitions A2 (e.g., Exit CURVE / CURVE_FREE / REPAY_ONLY produce distinct evidence sets)
    address owner;
    bytes32 market;               // Morpho market id
    uint256 blockNumber;          // canonical read block; all sources read at this block
    uint16  stateBitmap;          // §7.1 StateBit bitmap observed at blockNumber
    EvidenceSource[] sources;
    // evidenceBundleHash is NOT a stored struct field. It is the derived value
    // keccak256(abi.encode(EVIDENCE_BUNDLE_TYPEHASH, actionId, evidenceSetId, owner, market, blockNumber, stateBitmap, keccak256(abi.encode(sources))))
    // returned alongside the struct for SDK ↔ contract parity; recomputed on-chain by validate*.
}

struct EvidenceSource {
    bytes32 sourceId;             // type discriminator: Morpho position, vault NAV, Chainlink, Curve, sequencer-uptime
    address sourceAddress;
    SourceStatus status;          // fresh | stale | missing | degraded | notConfigured | outsideDeviation
    uint256 lastUpdateBlock;
    bytes32 valueHash;            // the read value, hashed for indexer parity
}
```

The the SDK type definitions enumerates which `EvidenceSource` entries each action class requires. Adding a runtime evidence check without the corresponding `sources[]` entry is a Protocol Audit Gate v2 reclose condition.

Canonical-set encoding (I-70): the 2026-06-12 security audit identified that a generic `EvidenceSource[]` permits duplicate, superset, or unordered entries that a mechanical implementation may accept as "at least one fresh source per required type" — leaving a stale shadow entry whose `sourceAddress` and `valueHash` the UI displays as evidence-of-staleness but the contract silently disregards. Phase 1 closes this:

- `EvidenceSource[]` MUST be sorted strict-ascending by `(sourceId, sourceAddress)` lexicographic order. `LoopAuthorization.validate*` reverts `EvidenceUnsorted` if any element is out of order, on equal `(sourceId, sourceAddress)`, or on identical `sourceId` repetition (duplicate-source rejection is strict — exactly one entry per `sourceId` required by the action class is permitted).
- `EvidenceSource[]` MUST exactly match the action class's required source set as defined in the SDK type definitions. Reverts `EvidenceSourceUnexpected` for any entry whose `sourceId` is not in the required set for the digest's `primaryType`. Reverts `EvidenceSourceMissing` for any required `sourceId` absent from the array.
- `evidenceBundleHash` is derived as `keccak256(abi.encode(EVIDENCE_BUNDLE_TYPEHASH, actionId, evidenceSetId, owner, market, blockNumber, stateBitmap, keccak256(abi.encode(sources))))` where `EVIDENCE_BUNDLE_TYPEHASH = keccak256("ActionEvidence(bytes32 actionId,bytes32 evidenceSetId,address owner,bytes32 market,uint256 blockNumber,uint16 stateBitmap,bytes32 sourcesHash)")` and `sources` is the sorted canonical array. The digest binds the canonical encoding; an indexer or attacker cannot present a "richer" `sources[]` to the executor while showing a different sorting to the UI. `evidenceBundleHash` is computed/recomputed by the executor — it is NOT a stored field of the struct.
- `sourceAddress` MUST match the registry-pinned address for that `sourceId` × `market` combination (i.e., the Morpho-position `sourceAddress` is the canonical Morpho address; the vault NAV `sourceAddress` is the canonical wstDIEM vault). Reverts `EvidenceSourceAddressMismatch` on divergence — the executor refuses to accept evidence from an address other than the one pinned for that source class.
- Unknown extra fields in any `EvidenceSource` (Solidity ABI extensibility) are not permitted; the struct shape is exact-match by ABI hash. Adding a field requires a an SDK interface update + Protocol Audit Gate v2 reclose.

These rules close the audit's H-04 finding (duplicate/superset ambiguity).

Canonical fail-closed error code set (machine-readable; each is both a Solidity `error` selector and an SDK enum value, the single source of truth across contract reverts, app failure conditions, SDK responses, and §7.1 matrix predicates). Finalized at protocol launch; the seed set:

- Configuration / identity: `WrongChain`, `RegistryVersionMismatch`, `RegistryMerkleRootMismatch`, `ExecutorMismatch`, `SpenderNotRegistered`, `BytecodeMismatch`, `VaultAssetMismatch`, `VaultEvidenceMissing` (§7.1 VAULT_EVIDENCE_MISSING state-bit revert: vault code missing or totalSupply/totalAssets == 0), `MorphoParamsMismatch(uint8 reason)` (PB1.4 widens this from parameterless; canonical sub-reasons: `1 = SELECTOR_UNKNOWN`, `2 = SELECTOR_ACTION_CLASS_FORBIDDEN`, `3 = MARKET_PARAMS_TUPLE`, `4 = MARKET_ID`, `5 = ON_BEHALF`, `6 = RECEIVER`).
- Authorization / signing: `InvalidSignature`, `DigestTypeMismatch`, `NonceAlreadyUsed`, `PolicyRevoking`, `PolicyExpired`, `PolicyClassMismatch`, `ForceAuthorizationRequired`, `AckRiskBitMissing`, `ExecutionKindMismatch`, `CallbackDataForbidden`, `ReentrantCallback` (I-54 single-external-reentry-point guard; matches the shipped `LoopExecutor.sol` reference behavior), `Phase1AutomationScopeViolation` (permissionless execution attempted against a Phase 1 out-of-scope policy class — see §8 Phase 1 restriction).
- Freshness: `QuoteStale`, `QuoteDeviationExceeded`, `EvidenceStale`, `BlockInconsistent`, `DeadlineExceeded`.
- RPC / submission: `RpcQuorumDegraded`, `MevModeMismatch`, `RevealTooEarly`.
- Liquidity / route: `CurveLiquidityInsufficient`, `CurveSlippageExceeded`, `CurvePriceImpactExceeded`, `FlashLiquidityUnavailable`, `AlternateProviderMissing`.
- Oracle: `OracleStale`, `OracleMissing`, `OracleDeviationExceeded`, `SequencerDown`, `SequencerGracePeriod`, `NavStepExceeded`.
- Position / bounds: `MorphoEvidenceMissing`, `HealthFactorBoundFailure`, `HealthIndeterminate`, `LeverageBoundFailure`, `BorrowedDiemOutOfBand`, `CollateralSoldExceeded`, `DustBoundExceeded`, `LiquidationDistanceBoundFailure`, `UtilizationImpactExceeded`, `CurveShareExceeded`, `VaultDepositShortfall`.
- Lifecycle: `AuditGateClosed`, `PausedAction`, `IncidentInvestigating`, `IncidentMitigating`, `RevokedAuthorization`.
- v1.6 PR-6 lifecycle / anchor additions: `PauseRateLimited`, `PauseScopeViolation`, `PauseAuthorityOnly`, `GovernanceRoleOnly`, `NotPaused`, `AlreadyPaused`, `RolesMustDiffer`, `AnchorSubmitterOnly`, `AnchorTooFrequent`, `AnchorInFuture`.
- Preview-only sentinels (never emitted by the contract; surfaced by the SDK/app when on-chain reads cannot complete the preview): `LedgerBeforeUnavailable`, `LedgerAfterUnavailable`, `HealthIndeterminate`.

v1.2 additions (post 2026-06-12 Codex spec-stage audit integration):

- Configuration / identity: `ConfigIntegrityFailure` (semantic state-bit revert when `ExternalProtocolFingerprint` drift is detected — sub-cause surfaced via revert data: `curve-pool`, `uniswap-pool`, `chainlink-feed`, `wstdiem-vault`, `morpho-market`, `sequencer-feed`).
- Authorization / signing: `Eip1271PreimageNotAttested` (high-risk policy class signed via EIP-1271 without preimage attestation per I-66), `ForceExitWaiverOverbroad` (multiple critical-override bits set in one force-exit digest per I-67), `ForceExitPolicyNotAllowedInPhase1` (`createPolicy(FORCE_EXIT)` rejected in Phase 1 per I-67), `ForceExitDeadlineExceedsBound` (force-exit `deadline > block.timestamp + 24h` per I-67), `MevWaiverMissing` (submission channel requires waiver bit that is unset per I-56 / F-2 / F-3).
- Freshness: `IndexerAnchorStale` (no fresh `StateSnapshotAccepted` within `anchorMaxStaleBlocks` per F-7), `HarvestConvergencePending` (leverage-increasing action attempted within `harvestCoolingBlocks` of a registry-pinned harvest event per I-69).
- RPC / submission: `RpcQuorumNotIndependent` (matching majority drawn from a single `providerFamily` per I-68), `KeeperBuilderOutage` (keeper observed bloXroute outage and did NOT silently degrade — emitted as an observability event, not a revert path).
- Evidence integrity (I-70): `EvidenceUnsorted` (sources not strict-ascending by `(sourceId, sourceAddress)`), `EvidenceSourceUnexpected` (entry whose `sourceId` is not in the required set for the digest's `primaryType`), `EvidenceSourceMissing` (required `sourceId` absent), `EvidenceSourceAddressMismatch` (entry's `sourceAddress` differs from registry-pinned canonical address).
- Position / bounds: `ThirdPartyRepayNotAccepted` (third-party repay attempted without owner opt-in per F-Mx M-02).
- Lifecycle: `AutomationAttemptThrottled` (per-policy failed-attempt rate limit hit per I-72), `BuilderQuotaExceeded` (per-policy-class bloXroute API quota exhausted per I-72), `CallerNotAllowed` (permissionless caller not on the registry-pinned allow-list per I-72).

Each v1.2 addition is both a Solidity `error` selector and an SDK enum value with the same name (PascalCase Solidity ↔ PascalCase SDK), per the existing source-of-truth rule. The the SDK type definitions MUST canonicalize the bytes4 selector for each. Adding a new error in implementation without backfilling here is a Protocol Audit Gate v2 reclose condition.

v1.3 additions (PB1.4 2026-06-12, closing the `@wstdiem/sdk` type definitions §A6.11 items 4 + 7 + 8):

- Action-context handshake (§A6.2 + §A6.2.1): `ActionContextMissing` (`executeMorpho` called without a prior matching `validate*`), `ActionContextDigestMismatch` (the transient `actionContext.digest` does not match the `executeMorpho` argument digest), `ActionContextAlreadyArmed` (a `validate*` call would overwrite an unconsumed action context — defends against a misbehaving executor that calls two `validate*` functions before reaching the terminal Morpho call).
- Multi-call sequence guard (§A6.7): `MorphoSelectorOutOfOrder` (selector does not match next expected step), `MorphoSelectorAfterTerminal` (selector arrived after the action's terminal selector), `MorphoTerminalSelectorMissing` (next `validate*` armed while a prior action's terminal Morpho selector was never fired).
- executeMorpho safety (§A6.3 + §A6.5 + §A6.6): `MorphoSelectorForbidden` (calldata selector is not in the four-function set `{supplyCollateral, borrow, repay, withdrawCollateral}` — covers `setAuthorization`, `accrueInterest`, `liquidate`), `MorphoSharesModeForbidden` (Phase 1 assets-mode lock: `shares != 0` in `borrow`/`repay`), `ReceiverNotAllowed` (decoded `receiver` is outside the per-(action class × Morpho function) allowlist in §A6.5).

The widened `MorphoParamsMismatch(uint8 reason)` (above) replaces the previously parameterless variant. Implementations MUST emit the canonical sub-reason in revert data. The selector changes (it is now `MorphoParamsMismatch(uint8)`, not `MorphoParamsMismatch()`); any selector-pinned snapshot or off-chain decoder MUST be updated. No EIP-712 typehash changes.

v1.4 additions (PB1.5 2026-06-12, closing the SDK type definitions §A6.11 item 2):

- Rebalance mode derivation (§6.2 + the SDK type definitions §A6.4): `RebalanceModeAmbiguous` (canonical selector `0xbc2ae8bb`) — `validateRebalance` receives a Phase 1 Rebalance digest whose `RebalanceBounds` field pair `(maxDebtIncrease, maxCollateralSold)` matches no Phase 1 mode predicate (only `(>0, >0)` reaches this revert; `(0, 0)` is HEALTH_FACTOR_RECOVERY, not ambiguous). No `RebalanceModeNotSupportedInPhase1` error is added because deferred Phase G modes (`BORROW_RATE_DOWNSHIFT`, `ROUTE_MIGRATION`) cannot be encoded in the locked `RebalanceBounds` field set and therefore cannot reach `validateRebalance` through a Phase 1 digest.

The v1.4 addition is a Solidity `error` selector and an SDK enum value with the same name. Adding it in implementation without backfilling here is a Protocol Audit Gate v2 reclose condition. No EIP-712 typehash changes.

v1.5 additions (PB1.6 / PR-5 2026-06-13, Registry + Risk + Fees locks A-E):

- Registry atomicity / root semantics: `ConfigMutationOutsideAtomicGate` (digest-bound registry config setter called outside the PR-5 `batchUpdate` atomic commit path), `RegistryVersionStale` (registry version did not advance for a gated config commit).
- External protocol fingerprint matrix (§7.3): `FingerprintTimelockNotElapsed` (queued `ExternalProtocolFingerprint` update applied before the O7 delay), `FingerprintInvalid(uint8 reason)` (queued fingerprint contradicts required shape or semantic invariant), `FingerprintMismatch(uint8 reason)` (live or recomputed fingerprint differs from the registry-pinned fingerprint).
- Risk state bitmap (§7.1 / Lock C): `StateBitmapUnknownBits` (`stateBitmap & ~KNOWN_STATE_MASK != 0`; unknown state bits fail closed).
- Registry-only authorities: `HarvestAuthorityOnly` (`recordHarvest` caller is not the registry-pinned harvest authority), `OnlyAuthorization` (`recordOwnerActivity` caller is not the registry-pinned `LoopAuthorization`).

The v1.5 additions are Solidity `error` selectors and SDK enum values with the same names. Adding a PR-5 error in implementation without backfilling here is a Protocol Audit Gate v2 reclose condition. No EIP-712 typehash changes.

### 5.6 RPC Trust Model

Every safety-critical on-chain read passes through a multi-RPC quorum. Single-RPC reads are advisory only and cannot drive a signing or execution decision.

Quorum policy:

- Safety-critical reads (readiness, evidence bundle, oracle adapter `RiskStatus`, registry state, Morpho position, executor configuration, EXTCODEHASH verification) require ≥2-of-3 RPC agreement. Quorum size, providers, and rotation policy are pinned in `LoopRegistry` and.
- Non-safety-critical reads (UI surface, market browsing, historical charts) may use single-RPC with stale-tolerance markers.
- The SDK fails closed with `BlockInconsistent` when quorum members disagree on a same-block read, and with `RpcQuorumDegraded` when fewer than `quorumThreshold` members respond within `quorumTimeoutMs`.

Stale-RPC definition:

- An RPC is "stale" when its reported latest block is more than `maxRpcBlockLagBlocks` behind the highest block reported by any quorum member, or when its EXTCODEHASH / state-root reads for a known contract diverge from the quorum.
- The SDK rotates stale RPCs out of the quorum for the duration of the action; a degraded quorum (≤1 healthy member) blocks the action with `RpcQuorumDegraded`.

Provider-independence requirement (I-68):

The 2026-06-12 security audit flagged that 2-of-3 quorum is defeated if two of the three RPCs are operated by the same vendor, share the same upstream cache, or serve the same stale view. Phase 1 enforces provider independence:

- Each registered RPC quorum member carries a `providerFamily` tag in `LoopRegistry` (e.g., `coinbase_cloud`, `alchemy`, `infura`, `quicknode`, `ankr`, `self_hosted_base_node`, `tenderly`). The `providerFamily` taxonomy and current member assignments are pinned in the registry and require the O7 timelock to change.
- Quorum membership for a single action MUST include at least two distinct `providerFamily` values. A 2-of-3 with all three members tagged `providerFamily == alchemy` (e.g., three different Alchemy regions) is treated as a single-provider read and fails closed with `RpcQuorumNotIndependent`.
- A safety-critical read requires the matching quorum to span ≥2 distinct `providerFamily` values, NOT merely ≥2 raw endpoint URLs. A matching majority of 2 from family A + 1 from family B forms a valid quorum; a matching majority of 2 from family A alone does NOT.
- Phase 1 RPC roster MUST include at least one `self_hosted_base_node` or independently verified node OR an independent vendor (e.g., Tenderly direct, Ankr) so that the operator cannot be SaaS-monoculture-locked.
- The quorum policy explicitly rejects matching pairs from the same provider family in the same vote. If a quorum can form only by accepting two same-family RPCs, the SDK fails closed with `RpcQuorumNotIndependent` rather than degrading silently.

Monotonic-freshness check:

- The SDK ALSO compares each RPC's `latestBlock().timestamp` against the local wall clock (with a registry-pinned `walltimeDriftToleranceSeconds`, registry-pinned default 30s). An RPC whose reported block timestamp is more than `walltimeDriftToleranceSeconds` behind the wall clock is treated as stale even if its block number matches the other RPCs (this catches a quorum-of-two-stuck-on-the-same-block failure mode that block-number-only checks miss).
- The L1 batch / sequencer-feed cross-check (§7) provides a third independent freshness signal beyond the RPC quorum.

Indexer / API trust:

- Indexer responses are off-chain claims validated against the on-chain `StateSnapshotAccepted` anchor (§5.2) before consumption.
- The public read API is a convenience layer over the indexer plus RPC quorum; safety-critical SDK paths bypass the API when a direct on-chain read is necessary.

Keeper and risk-engine RPC posture:

- Keeper and risk-engine services run their own multi-RPC quorum with the same threshold rules. A keeper attempting to act against a degraded quorum is rejected at the SDK validation step before submission.
- the SDK type definitions names the canonical RPC provider list, rotation policy, and key-management requirements for the quorum signing infrastructure.


---

## 6. Execution Requirements

### 6.1 Open Loop

An open-loop transaction must:

- accept user-supplied wstDIEM as the only Phase 1 input asset; no `initialDIEM` user input is accepted in Phase 1.
- atomically construct the leveraged position by (a) flash-borrowing DIEM from Uniswap V3, (b) calling `vault.deposit(flashDIEM)` to mint additional wstDIEM, (c) combining the freshly minted wstDIEM with the user's transferred wstDIEM and supplying the combined balance as Morpho collateral, (d) borrowing DIEM from Morpho, and (e) repaying the flash. `vault.deposit` consumes flash-borrowed DIEM only — never any user-supplied DIEM. Curve is not invoked in the open path.
- quote Morpho collateral supply, Morpho borrow notional, vault deposit shares, flash fee, and post-loop health factor.
- enforce `minWstDiemReceived`, `minBorrowedDiem`, `maxBorrowedDiem`, `maxSlippageBps`, `maxPriceImpactBps`, `maxLeverageBps`, `minHealthFactor`, `minLiquidationDistanceBps`, `maxMorphoUtilizationImpactBps`, `deadline`, and the §6.4 nonce slot/bit.
- apply the §7.1 post-matrix orthogonal gates in order: G-PM-1 `HarvestConvergencePending` (block if registry-pinned harvest event observed within `harvestCoolingBlocks`), G-PM-4 `Eip1271PreimageNotAttested` (Open is high-risk; EIP-1271 path requires preimage attestation per I-66), G-PM-5 `MevWaiverMissing`, G-PM-6 `AutomationAttemptThrottled` / `CallerNotAllowed` (when permissionless). The SDK enforces G-PM-2 `IndexerAnchorStale` and G-PM-3 `RpcQuorumNotIndependent` before producing a signing payload.
- verify `LoopAuthorization` and the EIP-712 `Open` action digest before acting on behalf of the user or calling Morpho (via `LoopAuthorization.executeMorpho`).
- refund all dust below `MAX_DUST_BPS × inputAmount`; emit `LargeDustRefund` and revert above the bound.
- emit `LoopActionStarted(digest)` and `LoopOpened(digest, ...)` (signature-name versioned per §6.4).

Open-loop execution may use flash liquidity only after:

- callback context is cryptographically bound to all user parameters and the action digest.
- flash provider, pool, fee tier, token order, and expected fee are verified.
- the callback cannot be invoked outside an armed context.
- all intermediate balances and final balances are checked.
- callback domain separation includes chain id, executor, callback selector, action, owner, market, registry version, flash provider, route, quote digest, nonce, and deadline.

### 6.2 Rebalance

Phase 1 rebalance supports exactly three modes, derived at validate-time from the locked `RebalanceBounds` field pair `(maxDebtIncrease, maxCollateralSold)` (no `rebalanceMode` enum is added; the `RebalanceBounds` typehash is locked per the SDK type definitions §A6.11 item 2 PB1.5 closure):

- `LEVERAGE_INCREASE` — `(maxDebtIncrease > 0 && maxCollateralSold == 0)`; Morpho sequence `supplyCollateral → borrow`, terminal `borrow`. High-risk (`maxDebtIncrease > 0`) — §7.1 G-PM-1 and G-PM-4 apply.
- `PARTIAL_DELEVERAGE` — `(maxDebtIncrease == 0 && maxCollateralSold > 0)`; Morpho sequence `repay → withdrawCollateral`, terminal `withdrawCollateral`. Risk-reducing — §7.1 G-PM-1 / G-PM-4 bypass.
- `HEALTH_FACTOR_RECOVERY` — `(maxDebtIncrease == 0 && maxCollateralSold == 0)`; Morpho sequence `repay` only, terminal `repay`. Risk-reducing — §7.1 G-PM-1 / G-PM-4 bypass.

A `(maxDebtIncrease > 0 && maxCollateralSold > 0)` corner reverts `RebalanceModeAmbiguous()` (§5.5 v1.4); no Phase 1 mode combines debt-increase with collateral-sale.

Deferred to Phase G (require a typehash reclose because the locked `RebalanceBounds` cannot encode them):

- `BORROW_RATE_DOWNSHIFT` requires a second `MorphoMarketParams` tuple, which the Rebalance digest does not carry (the digest binds one canonical market per §6.4).
- `ROUTE_MIGRATION` requires a separate migration audit (preserved as the Phase G admission gate). Migration zaps remain out of scope.

The locked bound fields make these two modes structurally unreachable through Phase 1 `validateRebalance`; no `RebalanceModeNotSupportedInPhase1()` error is added.

Every rebalance enforces, via the §6.4 `Rebalance` digest envelope:

- `targetLeverageBps` and `targetLeverageToleranceBps`.
- `minPostHealthFactor`.
- `minLiquidationDistanceBps` — bounds the post-rebalance distance to liquidation; protects against bad-debt socialization on adverse oracle moves immediately after a leverage-increasing rebalance.
- `maxDebtIncrease`.
- `maxCollateralSold`.
- `maxSlippageBps`.
- `maxCurvePositionShareBps` — bounds the position's share of Curve pool depth post-rebalance.
- `maxMorphoUtilizationImpactBps` — bounds the rebalance's contribution to Morpho market utilization shift.
- `flashFeeCap`, `protocolFeeCap`, `automationFeeCap`.
- owner authorization, `deadline`, and stored-policy expiry.

The §6.4 envelope is a strict superset of this list; adding a runtime bound here without a corresponding `Rebalance` digest field is a Protocol Audit Gate v2 reclose condition.

Post-matrix gates applied to Rebalance: G-PM-1 `HarvestConvergencePending` fires when `digest.maxDebtIncrease > 0` (leverage-increasing variant); risk-reducing rebalances (deleverage; `maxDebtIncrease == 0`) bypass G-PM-1. G-PM-4 `Eip1271PreimageNotAttested` fires when `digest.maxDebtIncrease > 0` (per the digest-content-only high-risk classification in §6.4). G-PM-5 `MevWaiverMissing` and G-PM-6 throttle/allow-list apply to all rebalances. SDK applies G-PM-2 / G-PM-3 before signing.

### 6.3 Exit

The exit surface ships in two places: the `Exit` `primaryType` dispatched inside `LoopExecutorV2`, and the separately deployed `LoopForceExitExecutor` for force exit (§5.1). The shipped exit-only `LoopExecutor` is reference behavior for the unwind path; the Phase 1 two-executor topology is a fresh implementation that gates every Morpho call through `LoopAuthorization.executeMorpho` (§6.4).

Exit must support:

- full exit.
- partial deleverage.
- emergency repay-only mode.
- force exit only as a separately authorized, separately previewed, event-tagged path through `LoopForceExitExecutor`.
- no-WSTD exit at all times.

Exit must preserve the current constraints:

- live Curve liquidity evidence (registry-pinned pool, `routeMin` check).
- live Morpho position evidence (borrow shares + supply shares read at planning block; bound to digest via `quoteBlockNumber`).
- executor authorization evidence (`LoopAuthorization.validate` for the `Exit` or `ForceExit` digest).
- flash fee proof (Uniswap V3 pool fee tier registry-pinned).
- `minRepayment` covering Morpho repayment plus flash fee plus signed protocol and automation fees.
- `maxCurvePositionShareBps` — bounds the exit's transient share of Curve pool depth during the unwind; protects against bounded-extraction MEV when an exit briefly dominates Curve liquidity.
- `maxMorphoUtilizationImpactBps` — bounds the exit's contribution to Morpho market utilization shift; protects other positions in the same market from being pushed into liquidation distance by an exit's repay-debt impact on utilization.
- dust refund below `MAX_DUST_BPS × inputAmount`; above bound emits `LargeDustRefund` and reverts.
- zero residual executor balances and zero standing allowances per the §6.4 zero-after invariant.

Post-matrix gates applied to Exit / ForceExit: Exit is NOT high-risk for I-66 purposes (it reduces leverage), so G-PM-4 does not fire for normal Exit. ForceExit is unconditionally high-risk and the G-PM-4 EIP-1271 preimage gate applies. G-PM-1 `HarvestConvergencePending` does NOT fire for Exit / ForceExit (risk-reducing actions bypass cooling). G-PM-5 `MevWaiverMissing` and G-PM-6 throttle/allow-list apply to permissionless Exit / ForceExit paths. SDK applies G-PM-2 / G-PM-3 before signing.

Exit modes:

- Normal exit enforces the `Exit` digest envelope's slippage, fee, health, repayment, and dust-refund bounds.
- Repay-only mode never increases user debt and never sells collateral. The signed `Exit` digest with `maxCollateralSold == 0` and a Curve-free calldata path is the on-chain enforcement. When Morpho owner evidence is missing (§7.1 row), the repay-only path additionally accepts direct user repayment where the user supplies DIEM and the executor's role is limited to the Morpho `repay` step. Third-party repayment of an owner's position is permitted only when (a) the owner has opted in via a stored `acceptsThirdPartyRepay(policyId)` flag, and (b) the repayment notional meets a minimum threshold `minThirdPartyRepayDiem` (registry-pinned; default protects against dust grief that perturbs health-factor triggers and points attribution). Third-party repay events are emitted with a distinct event tag (`LoopRepayedByThirdParty`) separate from owner-initiated repay (`LoopRepayed`), preserving the accounting distinction for points, automation triggers, and incident review. Without the owner opt-in flag, attempted third-party repayment reverts `ThirdPartyRepayNotAccepted`.
- Emergency deleverage must satisfy the closed-form predicate `post_debt < pre_debt && post_health_factor > pre_health_factor`, measured from Morpho and oracle reads at action entry and at action completion. Violation reverts; this is not a "risk-reducing" free predicate.
- Force exit ships through `LoopForceExitExecutor` at the `LoopForceExitAuthorizer` `verifyingContract`. It requires:
  - a distinct EIP-712 `primaryType` (`ForceExit`) and the distinct `verifyingContract` so wallet display unambiguously distinguishes it from normal exit. Normal-exit signatures cannot be promoted to force-exit by dispatcher coercion; the executor entrypoint asserts `digest.primaryType == FORCE_EXIT`.
  - a distinct `LoopAuthorization` policy class; force-exit policies cannot be created or executed under a normal-exit policy lookup.
  - an `acknowledgedRisks` bitmask the user signs and the wallet shows decoded. Each bit corresponds to a specific waiver (e.g., `LOOSE_SLIPPAGE`, `STALE_ORACLE_OVERRIDE`, `INSUFFICIENT_CURVE_DEPTH`, `SEQUENCER_DOWN_OVERRIDE`, `VAULT_EVIDENCE_OVERRIDE`). The executor reverts when an action depends on a waiver whose bit is unset.
  - app and wallet preview that displays ≥3 seconds of sign-button dwell, non-default color warning, decoded `force=true`, decoded `maxCollateralSold`, decoded `minRepayment`, decoded `expiry`, decoded `verifyingContract`, and an explicit checkbox acknowledgment for each set bit in `acknowledgedRisks`. the signing-flow audit includes a phishing test where the test site presents a force-exit digest disguised as a normal exit.
  - `looseSlippageBps`, `looseFlashFeeCap`, `minRepayment`, `maxCollateralSold`, `deadline`, nonce, and `force=true` event tag.
  - Force mode loosens signed bounds; it does not skip checks. Slippage, allowance, spender, registry, signature, sub-hash, and the §7.1 force-exit cells still apply.

Phase 1 force-exit policy restrictions (I-67 — waiver minimality):

The 2026-06-12 security audit identified that broad, long-lived force-exit *stored policies* convert emergency-liveness authorization into a signed value-transfer envelope a compromised UI or smart-wallet module can weaponize. Phase 1 closes this surface:

- **No stored force-exit policies in Phase 1.** Force exit MUST be a one-shot signed action — `policyId == 0`, `executionKind == OWNER_DIRECT` or `OPERATOR_RECOVERY`. Permissionless execution against a *stored* force-exit policy is not enabled in Phase 1. `LoopAuthorization.createPolicy` rejects any policy whose `primaryType == FORCE_EXIT`.
- **Maximum force-exit `deadline`:** Phase 1 force-exit digests MUST sign `deadline <= block.timestamp + 24h` (registry-pinned). Long-deadline force-exit signatures are rejected at validate-time.
- **Single waiver per signed force-exit (waiver-minimality):** at most ONE of `STALE_ORACLE_OVERRIDE`, `INSUFFICIENT_CURVE_DEPTH`, `SEQUENCER_DOWN_OVERRIDE`, `VAULT_EVIDENCE_OVERRIDE` may be set per signed force-exit digest. `LOOSE_SLIPPAGE` may be combined with at most one of the four named waivers. The executor reverts `ForceExitWaiverOverbroad` when multiple critical-override bits are set together. Multi-failure-mode unwinds require multiple sequential force-exit signatures, each scoped to its specific failure mode — this surfaces the "we are accepting four risks at once" decision to the user as four distinct sign actions rather than one signature with four waivers stacked.
- **Decoded display of every set bit:** the wallet preview block-lists sign-button enable until every set bit in `acknowledgedRisks` has been independently checkbox-acknowledged AND the decoded name of each bit is visible (i.e., the user explicitly knows "I am waiving stale-oracle protection" and "I am waiving Curve-depth protection" as separate visible facts).
- **Operator-recovery path:** the `OPERATOR_RECOVERY` `executionKind` exists for the case where the owner is unreachable but a registry-pinned operator role needs to unwind a position to prevent bad-debt socialization. This path requires (a) a registry-pinned operator role with explicit timelock, (b) a separate audit-gate-reclose if the operator role membership changes, and (c) the same waiver-minimality rule.

Force-exit policies in Phase G (stored, automation-eligible) are explicitly out of Phase 1 scope and require a new SPEC with a separate audit gate.

### 6.4 Authorization And Revocation

Authorization is scoped tightly enough that approving the WSTDIEM router cannot become a general-purpose collateral drain.

User-granted authorizations:

- A user opens their position by performing exactly one Morpho-side grant: `morpho.setAuthorization(loopAuthorization, true)`. `LoopAuthorization` is the sole Morpho-authorized address per owner; executors never call Morpho directly. Executors call `LoopAuthorization.executeMorpho(digest, sig, morphoCalldata)` for each Morpho Blue operation. Per the action class, the executor first calls the matching `validate*` function on `LoopAuthorization` (`validateOpen`, `validateExit`, `validateAutomationExec`, `validateForceExit`; `validateRebalance` is a PR-2 non-arming stub at `phase-b/pr-2-authorization` tip; PR-3 (LoopExecutorV2) replaces it with the bounds-derived per-mode arming flow specified in the SDK type definitions §A6.4 PB1.5 closure of §A6.11 item 2), which verifies the digest, signature, freshness, bound parity, policy class, and EIP-1271 preimage attestation and writes a transient action context that `executeMorpho` reads. `validateForceExit` is the two-contract bridge specified in the SDK type definitions §A6.2.1: `LoopAuthorization.validateForceExit(...)` delegates EIP-712 force-exit-domain checks to `LoopForceExitAuthorizer.validateForceExitDigest(...)` (which preserves the distinct `verifyingContract == LoopForceExitAuthorizer` required for AC-1 wallet-display phishing defense) and then arms the `LoopAuthorization` action-context slot, enforces caller class, and consumes the nonce — never the other way round. `executeMorpho` decodes exactly one allowed Morpho function call (the Phase 1 set is `{supplyCollateral, borrow, repay, withdrawCollateral}` — every other selector reverts `MorphoSelectorForbidden`), exact-checks the selector against the action-class compatibility matrix, exact-checks the decoded `MarketParams` tuple against the registry-pinned canonical `MarketParams` for the digest's market (registry wins; the signed `marketParams` is parity / replay-protection only), exact-checks `onBehalf == digest.owner`, restricts any `receiver` to the per-pair allowlist in the SDK type definitions §A6.5, requires Morpho callback `data.length == 0`, requires `shares == 0` (Phase 1 assets-mode only), and validates runtime `assets` against the signed digest or stored-policy bounds published in the SDK type definitions §A1. The digest binds bounds and identity, not exact runtime amount calldata; byte-equality applies only to selector, identity, and configuration fields whose values are derivable from the digest and registry. The full per-function decode-and-validate rule and the per-action-class multi-call Morpho sequence are specified in the SDK type definitions §A6. Compromise of an executor cannot exceed actions explicitly authorized by a valid digest; compromise of `LoopAuthorization` is bounded by its non-upgradeable code and Protocol Audit Gate v2.
- Users revoke from the WSTDIEM app, directly through `LoopAuthorization.revoke(policyId)`, and via direct Morpho `setAuthorization(loopAuthorization, false)`.
- Token allowances follow strict zero-after rules. Per-action allowances are set to exact action amounts via `approve(0)` then `approve(N)` (or Permit2 transfer where the spender supports it). Post-action invariant: `IERC20(token).allowance(executor, X) == 0` for every `X ∈ LoopRegistry.allowedSpenders(actionType)`. Tested as protocol invariants; standing exceptions require explicit deployment-manifest entry.
- Any external spender used by an executor must be present in `LoopRegistry.allowedSpenders(actionType)`, match the action's scoped authorization, and pass bytecode/code-hash checks. EXTCODEHASH of the spender address is compared to the registry-stored hash. For proxied integrations the implementation slot CANNOT be read generically from another contract (Solidity SLOAD is restricted to `address(this)`); the executor instead requires either (a) a public implementation getter (e.g., `implementation()` for OZ-style proxies that expose it) whose return value is asserted equal to the registry-pinned implementation address AND whose EXTCODEHASH is asserted equal to the registry-pinned implementation hash, or (b) the proxy is on a registry-pinned "implementation-non-introspectable" list and the operator has committed to monitoring upgrades via the §7.3 `ExternalProtocolFingerprint` semantic-invariant cross-checks. Proxies that fail both paths are not eligible as registered spenders. The 2026-06-12 architect audit identified the original "check the implementation slot" text as factually impossible cross-contract; this clause is the corrected enforcement.
- The app displays every token allowance and spender before signing and exposes a revoke path for WSTDIEM authorization, Morpho authorization, and standing token approvals.
- Migration zaps are out of scope for the protocol. Any future zap requires its own SPEC, a distinct EIP-712 `primaryType`, a distinct policy class in `LoopAuthorization`, and an explicit reclose of Protocol Audit Gate v2.

Action digest schema:

Each action class has its own EIP-712 `primaryType` and a distinct struct. There is no shared `Action` struct with an `enum actionType` field. the SDK type definitions is the single source of truth for these structs. Canonical primary types: `Open`, `Rebalance`, `Exit`, `ForceExit`, `Revoke`, `AutomationExec`. `ForceExit` deploys at a distinct `verifyingContract` (`LoopForceExitAuthorizer`) so wallet domain display unambiguously distinguishes it from normal exit.

Every digest contains:

- Identity: `owner`, `chainId`, `verifyingContract`, `market` (Morpho `bytes32` id), `executor` (registry-pinned address — `LoopExecutorV2` for Open/Rebalance/Exit `primaryType` actions, `LoopForceExitExecutor` for `ForceExit`), `registryVersion`, `registryMerkleRoot` (binds the merkle-rooted spender/executor sets at signing time; executor reverts `RegistryMerkleRootMismatch` if `LoopRegistry.registryMerkleRoot()` advances between signing and execution), `marketParams` (full Morpho `MarketParams` tuple — loanToken, collateralToken, oracle, irm, lltv — signed for anti-replay parity; executor reverts `MorphoParamsMismatch` if the registry-pinned canonical params differ at execution. **Registry wins:** the executor's Morpho call uses the registry-pinned canonical `MarketParams`, NOT the signed value. Signed value is parity / replay-protection only — Implementers must NOT feed the signed `MarketParams` into the Morpho call), `policyId` (zero for one-shot direct actions), `nonceSlot`/`nonceBit`.
- Execution authorization (I-55): `executionKind` enum (`OWNER_DIRECT | KEEPER_PERMISSIONLESS | OPERATOR_RECOVERY`) — the user signs which classes of caller may execute this digest. The executor reverts `ExecutionKindMismatch` when the runtime caller class disagrees with the signed value (e.g., a keeper attempting to execute a digest signed `OWNER_DIRECT`). Replaces the `msg.sender == owner` heuristic that is broken under EIP-1271 / Safe / CSW / 7702. The signed field is mandatory; there is no default.
- Freshness: `deadline`, `quoteBlockNumber`, `maxQuoteAgeBlocks`, `maxQuoteDeviationBps`. Executor reverts `QuoteStale` if `block.number - quoteBlockNumber > maxQuoteAgeBlocks`. Automation paths re-read the quote at execution and revert when deviation exceeds the bound.
- MEV posture: `mevProtectionMode` enum (`PUBLIC | PRIVATE_BUILDER | SEQUENCER_DIRECT_FAILOPEN | SEALED_AUCTION`), default `PRIVATE_BUILDER`. Public mempool execution is permitted only when the user explicitly opts in via the policy AND the matching `mevWaiverBits` bit is set. `SEQUENCER_DIRECT_FAILOPEN` is a distinct mode from `PRIVATE_BUILDER` (split per the 2026-06-12 architect audit) so that bloXroute unavailability cannot silently degrade a `PRIVATE_BUILDER` policy into unprotected sequencer submission. See §6.5 for failover semantics. (`COMMIT_REVEAL` was considered for Phase 1 but removed O27 — Codex flagged that short-window commit-reveal gives false MEV protection unless the reveal tx is itself submitted via a protected channel; Phase G may reintroduce a properly designed commit-reveal mode.)
- MEV waiver bitmask (I-56): `mevWaiverBits` — a signed bitmask the user acknowledges before signing whenever `mevProtectionMode != PRIVATE_BUILDER`. Each bit corresponds to a named waiver (`PUBLIC_MEMPOOL_OPT_IN`, `SEQUENCER_DIRECT_FALLBACK_OPT_IN`, `BUILDER_KEY_OUTAGE_OPT_IN`). The executor reverts `MevWaiverMissing` if the runtime submission path requires a waiver bit that is unset. UI MUST surface each set bit decoded before sign-button enable (parallel to the force-exit `acknowledgedRisks` UX pattern).
- Per-action bound sub-struct. The on-chain verifier reconstructs calldata from the structured fields. `calldataHash` is emitted by the app and indexer for parity audit only and is not consumed by the verifier.

Per-action bound fields (each is its own EIP-712 sub-struct with a distinct `typeHash`, computed as `keccak256(abi.encode(typeHash, fields))`):

- `Open`: `minWstDiemReceived`, `minBorrowedDiem`, `maxBorrowedDiem`, `maxSlippageBps`, `maxPriceImpactBps`, `maxLeverageBps`, `minHealthFactor`, `minLiquidationDistanceBps`, `maxMorphoUtilizationImpactBps`, `flashFeeCap`, `protocolFeeCap`, `automationFeeCap`. (`maxCurvePositionShareBps` is omitted from `Open` because Phase 1 open does not invoke Curve.)
- `Rebalance`: `targetLeverageBps`, `targetLeverageToleranceBps`, `minPostHealthFactor`, `minLiquidationDistanceBps`, `maxDebtIncrease`, `maxCollateralSold`, `maxSlippageBps`, `maxCurvePositionShareBps`, `maxMorphoUtilizationImpactBps`, fee caps.
- `Exit`: `minRepayment`, `maxCollateralSold`, `maxSlippageBps`, `maxCurvePositionShareBps`, `maxMorphoUtilizationImpactBps`, fee caps. (Liquidation-distance is not bound on Exit because exit reduces leverage — the post-exit position is either zero or has strictly higher liquidation distance than pre-exit; that property is enforced by the closed-form §6.3 deleverage predicate.)
- `ForceExit`: `minRepayment`, `maxCollateralSold`, `looseSlippageBps`, `looseFlashFeeCap`, `maxCurvePositionShareBps`, plus a mandatory `acknowledgedRisks` bitmask the app must surface and the wallet must show decoded before sign-button enable.
- `AutomationExec`: `triggerConditionHash`, the underlying action's primary type discriminator, and the bound subset the policy authorizes.

`failureConditionHash` — **CLOSED 2026-06-12 (Round-2 audit cycle):** removed from the digest. The field was an opaque commitment to a future predicate with no on-chain consumer; same root issue as AutomationExec's `triggerConditionHash` (see §8 Phase 1 restriction below). Failure conditions are now emitted only in `TransactionPreview` metadata (not signed). Implementers must NOT bind `failureConditionHash` into `EVIDENCE_BUNDLE_TYPEHASH` or `DigestHashes`. O19 is closed accordingly.

Sub-hash domain separation: every sub-hash (spender-list, allowance-delta, evidence-bundle, etc.) is computed as `keccak256(abi.encode(typeHash, fields))` with a unique `typeHash` per sub-struct. Spender list is canonicalized as `sorted_by_(token, spender)[(token, spender, maxAllowance)]`. Allowance schedule is enumerated as the sequential delta list the executor consumes — the digest binds the schedule, not a summary.

Bound-parity invariant:

Every bound the executor checks at runtime appears in either the action digest's structured fields (one-shot direct actions) or the stored policy envelope (automation), and never neither. The the SDK type definitions MUST publish a bound-parity matrix mapping each per-action bound from §6.1/§6.2/§6.3 to its digest/policy field. Adding a runtime check without a corresponding signed bound is a Protocol Audit Gate v2 reclose condition.

Nonce model:

Nonces are owned by `LoopAuthorization`. The Permit2-style 256-bit bitmap per `(owner, policyId, actionType)` supports up to 256 parallel and out-of-order actions per slot. The nonce bit is set atomically with the final state-changing external call (the wrapping `executeMorpho` call frame). On revert the entire transaction reverts and the bit remains unset — failed automation does not consume a nonce. `LoopAuthorization.revoke(policyId)` sets `revocationBlock`; for `revocationGracePeriod = 5 blocks`, all automation execution against that policy reverts `PolicyRevoking` even with a valid digest. Direct one-shot signatures use `policyId = 0`; their nonce slots are namespaced separately from any policy.

Signature verification:

`LoopAuthorization.validate*` paths verify every signature via `SignatureChecker.isValidSignatureNow(owner, digest, sig)` — auto-routes ECDSA and EIP-1271. Safe, Coinbase Smart Wallet, and EIP-7702-delegated EOAs authorize without WSTDIEM forking its model. Implementations must use OpenZeppelin's `SignatureChecker` or an equivalent audited library; the validate function returns or reverts before any executor touches user funds, token allowances, Morpho, Curve, flash providers, or fee routing.

EIP-1271 preimage display requirement (I-66 — high-risk policy classes):

Generic `SignatureChecker.isValidSignatureNow` returns true whenever the smart wallet accepts the signature — including paths where the signer was shown a Safe transaction hash, a module operation summary, or a truncated message instead of the full WSTDIEM typed-data preimage. For high-risk policy classes that is insufficient: a malicious Safe app, compromised module, or batch obfuscator can get owners to approve what looks like a benign action but is actually a long-lived `ForceExit` or leverage-increasing policy whose decoded fields the signer never saw.

High-risk policy classes for Phase 1 (classification is monotonic and derived ENTIRELY from digest content — never from runtime state, to prevent a signed-then-executed digest from being reclassified by intervening state changes):

- `ForceExit` (`digest.primaryType == FORCE_EXIT`).
- `Open` (`digest.primaryType == OPEN`) — every Open is treated as high-risk because Open by construction creates new leveraged debt.
- `Rebalance` with `digest.maxDebtIncrease > 0` — the digest itself signs the maximum permitted debt increase; classification reads this field, never the runtime `currentLeverageBps`. A Rebalance signed with `maxDebtIncrease == 0` (e.g., deleverage-only Rebalance) is NOT high-risk regardless of runtime leverage state.
- `AutomationExec` whose underlying-action discriminator names a high-risk primaryType (`OPEN`, `FORCE_EXIT`, or `REBALANCE` with the policy's signed `maxDebtIncrease > 0`).

The classification function is `isHighRisk(digest) := digest.primaryType ∈ {FORCE_EXIT, OPEN} ∨ (digest.primaryType == REBALANCE ∧ digest.maxDebtIncrease > 0) ∨ (digest.primaryType == AUTOMATION_EXEC ∧ isHighRisk(digest.underlyingAction))`. The function is pure over digest fields, deterministic across resigning, and trivially testable in Foundry.

For high-risk policy classes signed via EIP-1271, `LoopAuthorization.validateHighRiskPolicy(...)` MUST additionally enforce one of:

- the smart wallet returns a non-zero `eip1271PreimageDisplayProof` (e.g., Safe Transaction Service / Safe app metadata) attesting that the canonical WSTDIEM typed-data preimage — specifically `primaryType`, `verifyingContract`, `policyClass`, `maxCollateralSold`, `maxDebtIncrease` (when applicable), `acknowledgedRisks` (force-exit), `mevWaiverBits`, and `expiry` — was displayed in decoded form to every required signer before signing; or
- the smart wallet is explicitly listed in the registry as "preimage-display-guaranteed" (i.e., the wallet's signing UX displays the full typed-data preimage by default — Coinbase Smart Wallet, EIP-7702 delegators on the registry list, and similar — and does not permit blind-signing for the typed data structure).

Where neither condition is met, `LoopAuthorization.validateHighRiskPolicy` reverts `Eip1271PreimageNotAttested`. The registry-pinned wallet allow-list and the format of `eip1271PreimageDisplayProof` are the SDK type definitions items.

For low-risk policy classes (revoke, repay-only, deleverage-only) EIP-1271 validation remains the existing `SignatureChecker.isValidSignatureNow` path with no preimage attestation requirement.

Blind-signing rationale: this mirrors the principle that wallet UX is the source of truth for what the user consented to, not the on-chain signature check. The architect/security audit (2026-06-12) identified blind-signing as the cheapest drain path against Safe/CSW users for force-exit and leverage policies.

Keeper fee derivation:

The protocol records a forced-choice decision among: (a) static fee cap denominated in DIEM (current default), (b) dynamic `min(feeCap, baseFee × gasUsed × marginBps)` with `gasPriceCap` and `marginBps` added to the digest, or (c) offchain bidding via the keeper service with on-chain settlement to the winning bid. If (a) is chosen, §8 must address the volatility liveness failure mode (no keeper executes during gas spikes — exactly the events automation policies exist for). If (b) is chosen, the gas oracle's manipulation surface is a protocol threat-model item.

Execution events:

Every action emits `LoopActionStarted(digest)` at entry and `LoopActionCompleted(digest, status)` at completion, bracketing all intermediate Morpho/Curve/flash events. The digest is the join key for indexer reconstruction; off-chain consumers compare the signed preview against the execution trace using the digest as the equality anchor. Event signature versioning uses the signature-name convention (`LoopOpenedV2`), not a leading version byte.

### 6.5 MEV And Mempool Posture

Public-mempool execution of signed action digests is a known sandwich vector. The protocol commits, at the spec level, to private-orderflow execution for permissionless actions; the digest field `mevProtectionMode` (§6.4) is the on-chain enforcement handle.

MEV protection modes (Phase 1):

- `PRIVATE_BUILDER` — submission via bloXroute Protect at `https://api.blxrbdn.com` (method `blxr_private_tx`, `blockchain_network: "Base-Mainnet"`). Requires operator-held API key. Provides actual MEV protection by routing the tx outside Base's normal sequencer path. **`PRIVATE_BUILDER` is NOT a superset of `SEQUENCER_DIRECT_FAILOPEN`.** A bloXroute outage does not auto-degrade the submission to sequencer-direct; the SDK / keeper MUST either retry, defer, or pause the policy (see failover semantics below). For permissionless price-sensitive automation (rebalance, partial deleverage, exit, force-exit), a sustained bloXroute outage MUST pause execution rather than silently fall through.
- `SEQUENCER_DIRECT_FAILOPEN` — submission via Base sequencer direct at `https://mainnet-sequencer.base.org`. Provides NO incremental MEV protection beyond Base's no-public-mempool model. Acceptable only for: (a) repay-only and Curve-free automation paths where MEV envelope is structurally bounded by exact-debt calldata; (b) policies whose `mevWaiverBits.SEQUENCER_DIRECT_FALLBACK_OPT_IN` is set; (c) operator-recovery `executionKind` paths. The executor reverts `MevWaiverMissing` for any digest whose `mevProtectionMode == SEQUENCER_DIRECT_FAILOPEN` and whose `mevWaiverBits.SEQUENCER_DIRECT_FALLBACK_OPT_IN` is unset.
- `PUBLIC` — the user opts into public-mempool submission (e.g., wallet-direct paths where the user controls submission). Requires `mevWaiverBits.PUBLIC_MEMPOOL_OPT_IN`. The executor reverts `MevWaiverMissing` when this bit is unset.
- `SEALED_AUCTION` — RESERVED for Phase G `INTENT_AUCTION` via CoW Protocol at `GPv2Settlement` `0x9008D19f58AAbD9eD0D60971565AA8510560ab41` on Base. Phase 1 does not enable this path.
- (`COMMIT_REVEAL` is removed from Phase 1 O27 — false MEV protection unless reveal is itself private.)

Required posture:

- Default `mevProtectionMode = PRIVATE_BUILDER` for every automation policy created through the canonical app and SDK. A policy may set `SEQUENCER_DIRECT_FAILOPEN` only with the matching `mevWaiverBits.SEQUENCER_DIRECT_FALLBACK_OPT_IN` set and surfaced in the UI like a `ForceExit` waiver; a policy may set `PUBLIC` only with `PUBLIC_MEMPOOL_OPT_IN` set.
- Force-exit policies default `PRIVATE_BUILDER`. `PUBLIC` is disallowed for permissionless force-exit execution; `SEQUENCER_DIRECT_FAILOPEN` is allowed only with both `SEQUENCER_DIRECT_FALLBACK_OPT_IN` AND the relevant `acknowledgedRisks` bit set.
- Direct wallet actions (the user signing and submitting their own action) may use any submission channel the wallet supports; the on-chain `mevProtectionMode` only constrains permissionless paths. Wallet-direct actions sign `executionKind = OWNER_DIRECT`; permissionless paths sign `executionKind = KEEPER_PERMISSIONLESS`.

Builder outage failover semantics (`PRIVATE_BUILDER` policies):

- bloXroute Protect outage detection is part of the keeper service's per-submission health check. On detected outage, the keeper:
  1. Retries against bloXroute with exponential backoff for up to `builderOutageRetryWindow` (registry-pinned; default 60s).
  2. If retry budget is exhausted, the keeper checks whether the policy carries `mevWaiverBits.BUILDER_KEY_OUTAGE_OPT_IN`. If set AND the action class is repay-only / Curve-free, the keeper MAY submit via `SEQUENCER_DIRECT_FAILOPEN` only if the digest also signed that mode. If the digest signed `PRIVATE_BUILDER` (not `SEQUENCER_DIRECT_FAILOPEN`), the keeper MUST NOT silently degrade — the submission is paused and `KeeperBuilderOutage` is emitted.
  3. Price-sensitive automation (rebalance, partial deleverage, exit, force-exit) NEVER falls through on a bloXroute outage. The policy pauses; a separate `BuilderOutage` incident annotation is recorded on `EmergencyGuardian` for the incident log.
- Keepers observed silently degrading `PRIVATE_BUILDER` policies to sequencer-direct submission are removed from the registry-pinned keeper set (§8).

Enforcement:

- The executor reads the digest's `mevProtectionMode` and the `executionKind` it was signed under. For non-owner callers, the executor reverts `MevModeMismatch` when the runtime submission channel disagrees with the signed `mevProtectionMode`, and reverts `MevWaiverMissing` when the channel requires a waiver bit (`PUBLIC_MEMPOOL_OPT_IN`, `SEQUENCER_DIRECT_FALLBACK_OPT_IN`, `BUILDER_KEY_OUTAGE_OPT_IN`) that is unset.
- For `PRIVATE_BUILDER` actions, the executor cannot directly verify the submission channel on-chain. The Protocol Audit Gate v2 manifest names the supported builders by URL + auth method; off-chain SDK and keeper code submit only through those endpoints. The keeper service must hold the bloXroute API key; key rotation procedure is defined in protocol operations. Any keeper observed submitting `PRIVATE_BUILDER` policies through public mempool or sequencer-direct without the matching waiver bit is removed from the registry-pinned keeper set (§8).
- `COMMIT_REVEAL` is RESERVED but unused in Phase 1 (deferred to Phase G O27). The `RevealTooEarly` error in §5.5 remains as a placeholder for Phase G reintroduction.

Bound interpretation:

- Slippage bounds (`maxSlippageBps`, `maxPriceImpactBps`) are the user's *floor*, not their *outcome*. Private orderflow (bloXroute Protect) narrows the realized-vs-bound gap; sealed-bid auction (CoW Protocol, Phase G `INTENT_AUCTION`) closes it further. `SEQUENCER_DIRECT_FAILOPEN` provides no narrowing and is therefore restricted to action classes whose MEV envelope is structurally bounded (repay-only, exact-debt calldata). The protocol threat model names the residual MEV envelope per `mevProtectionMode`.

Defaults summary:

- Direct wallet actions (`OWNER_DIRECT`): `mevProtectionMode = PUBLIC` is acceptable when the matching `PUBLIC_MEMPOOL_OPT_IN` waiver bit is signed; the user controls submission.
- Stored policies for automation (`KEEPER_PERMISSIONLESS`): default `PRIVATE_BUILDER`; `SEQUENCER_DIRECT_FAILOPEN` and `PUBLIC` each require their explicit waiver bit and are restricted to repay-only / Curve-free actions in Phase 1.
- Force-exit policies (`KEEPER_PERMISSIONLESS` permitted; `OPERATOR_RECOVERY` permitted): default `PRIVATE_BUILDER`; `PUBLIC` disallowed; `SEQUENCER_DIRECT_FAILOPEN` requires both the MEV waiver bit and the relevant `acknowledgedRisks` bit.


---

## 7. Risk And Oracle Requirements

The protocol must fail closed when any of the following holds. The §7.1 matrix is a strict superset of this list; every fail-closed condition here appears as at least one state row in the matrix.

- vault code is missing.
- wstDIEM `asset()` does not match configured DIEM (re-read at every action entry).
- wstDIEM `totalSupply()` or `totalAssets()` is zero when live execution is expected.
- Morpho market params differ from configured values.
- Morpho supply or borrow evidence is unavailable.
- owner position evidence is unavailable for rebalance or exit.
- executor config differs from registry/config values.
- registry merkle root or `registryVersion` differs from the digest-bound value.
- Curve liquidity is zero or below `routeMin`.
- Curve quote exceeds slippage or price-impact bounds.
- flash liquidity is insufficient.
- oracle data is stale, missing, or deviates beyond bounds (per pair and direction; thresholds registry-pinned,).
- Chainlink L2 Sequencer Uptime Feed reports the Base sequencer is down or within `sequencerGracePeriodSeconds` of resumption.
- chain id, deployed address, or `EXTCODEHASH` differs from published values.
- audit gate is closed.

Oracle requirements (Prisma + Lybra derived, plus Base-specific):

- `LoopRiskOracleAdapter` is a sanity checker only; never an execution price source. It produces a `RiskStatus` struct, not a normalized price.
- Each source has heartbeat, stale-data, and per-pair deviation thresholds, pinned in the registry and surfaced as open questions in .
- wstDIEM NAV is read via `convertToAssets(1e18)` (donation-resistant) and tracked block-to-block for unexplained step deviation beyond the registry-pinned `MAX_NAV_STEP_BPS`. NAV jumps without a corresponding `FeeRouter` harvest event are treated as suspect.
- Harvest-convergence cooling period (I-69): a recognized `FeeRouter` harvest event explains a NAV step but does NOT make a risk-increasing action safe in the immediate aftermath. The 2026-06-12 security audit identified harvest events as an oracle-front-run window — a keeper or MEV actor who can predict or trigger a harvest can time leverage-increase actions around the NAV step before Morpho oracle and external feed state have converged on the new NAV. Phase 1 enforces: for `harvestCoolingBlocks` blocks after every registry-pinned harvest event (registry-pinned; default 30 blocks ≈ 60s on Base), the executor refuses leverage-increasing actions (`Open`, leverage-increasing `Rebalance`) on the affected market with `HarvestConvergencePending`. Risk-reducing actions (repay, deleverage, exit) and force-exit remain available throughout the cooling window. The cooling clock resets on every harvest event observed in the market's read window.
- Convergence proof: leverage-increasing actions exiting the cooling window MUST additionally pass the §7.3 wstDIEM vault `ExternalProtocolFingerprint` `convertToAssets(1e18)` tolerance check against the post-harvest baseline AND the §7 cross-feed deviation check between the new NAV and the Morpho-oracle-derived collateral price. Both checks fire at action entry against the action's `quoteBlockNumber`.
- Cross-check oracle set MUST exclude the active route venue. If Curve is the route (rebalance, exit, deleverage), Curve-implied price is informational only and does not feed deviation gates.
- For Chainlink-style feeds on Base, the L2 Sequencer Uptime Feed is paired with the price feed. Sequencer-down or grace-period state forces fail-closed for every price-dependent action; only repay-only with exact-debt calldata and revoke remain (see §7.1).
- Route quotes cannot replace oracle evidence.
- Emergency pause may block new leverage on oracle degradation; repay-only and revoke remain available per §7.1.

`LoopRiskOracleAdapter` evidence is a launch blocker for readiness, transaction previews, automation proposals, keeper readiness, and Protocol Audit Gate v2. Each evidence bundle records:

- source addresses, source type, heartbeat, last update block, stale threshold, and per-pair deviation thresholds.
- current wstDIEM NAV, Morpho oracle price, external feed price (where configured; `notConfigured` is distinct from `missing`), and Curve-implied price (informational only).
- per-source status enum: `fresh | stale | missing | degraded | notConfigured | outsideDeviation`.
- Base sequencer-uptime status: `up | down | gracePeriod` with `lastUpdate` block.
- action-specific allow/block decision derived from §7.1 against the current state bitmask.
- the block number used for every read; reads spanning different blocks are flagged `blockInconsistent`.

### 7.1 Degraded-Mode Matrix

The app, SDK, CLI, keeper, and contracts enforce the same action-state matrix. "Allowed" means the action may proceed only when its action-specific authorization, digest, registry, spender, allowance, liquidity, fee, health, evidence, and §6.4 bound-parity checks pass. "Blocked" means the app, API, and CLI must not build a production transaction and the contract must revert when possible.

State is encoded as a `uint16` bitmap shared verbatim across the contract, SDK, app, and keeper. Bit assignments are in the SDK type definitions; an `enum StateBit` exposes:

```
AUDIT_GATE_CLOSED          = 1 << 0
CONFIG_INTEGRITY_FAILURE   = 1 << 1   // wrong chain, registry/version mismatch, executor-config drift, EXTCODEHASH mismatch, vault.asset() mismatch, Morpho params mismatch
PAUSE_OPEN_INCREASE        = 1 << 2
ORACLE_DEGRADED            = 1 << 3   // stale, missing, or outside deviation per registry thresholds
CURVE_LIQUIDITY_INSUFFICIENT = 1 << 4
FLASH_LIQUIDITY_UNAVAILABLE = 1 << 5
MORPHO_OWNER_EVIDENCE_MISSING = 1 << 6
SEQUENCER_DOWN_OR_GRACE    = 1 << 7
INCIDENT_INVESTIGATING     = 1 << 8
INCIDENT_MITIGATING        = 1 << 9
VAULT_EVIDENCE_MISSING     = 1 << 10  // vault code missing OR totalSupply/totalAssets == 0
```

Combination rule: **AND-over-rows**. For each set bit, the matrix row below is evaluated. An action is Allowed only if every applicable row returns Allowed (subject to its named predicate). Each predicate is independently checkable on-chain.

| State (bit set) | Open / Increase | Rebalance down | Repay-only | Partial deleverage | Full exit | Force exit | Revoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUDIT_GATE_CLOSED | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ direct on-chain only |
| CONFIG_INTEGRITY_FAILURE | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ direct on-chain on the correct chain only |
| PAUSE_OPEN_INCREASE | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ORACLE_DEGRADED | ✗ | ✓ if P1 | ✓ if P2 | ✗ | ✗ | ✓ if P6 | ✓ |
| CURVE_LIQUIDITY_INSUFFICIENT | ✓ (Phase 1 open does not use Curve) | ✓ if P4 | ✓ if P4 | ✓ if P4 | ✓ if P4 | ✓ if P7 | ✓ |
| FLASH_LIQUIDITY_UNAVAILABLE | ✗ | ✗ if uses flash | ✓ if P5 | ✓ if P5 | ✓ if P5 | ✓ if P5 ∨ P8 | ✓ |
| MORPHO_OWNER_EVIDENCE_MISSING | ✗ | ✗ | ✓ if P3 | ✗ | ✗ | ✗ | ✓ |
| SEQUENCER_DOWN_OR_GRACE | ✗ | ✗ | ✓ if P11 | ✗ | ✗ | ✓ if P9 | ✓ |
| INCIDENT_INVESTIGATING | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| INCIDENT_MITIGATING | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ |
| VAULT_EVIDENCE_MISSING | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ if P10 | ✓ |

Predicate glossary (each is closed-form and checkable on-chain at action entry and at action completion):

- **P1** (rebalance debt-reducing under degraded oracle): `post_debt < pre_debt && post_collateral <= pre_collateral && !calldata_uses_invalid_price_source`. Measured from Morpho `position(owner)` reads.
- **P2** (oracle-independent repay): `calldata_has_exact_debt_amount && !calldata_uses_curve`. The exact-debt amount is derived from `LoopAuthorization.executeMorpho` calldata's `assets` field, which the digest binds.
- **P3** (Morpho-evidence-free repay): direct user repayment supplies the DIEM; the executor's role is limited to `Morpho.repay` only. The executor reverts if `calldata` includes any non-repay step.
- **P4** (no Curve required): `!calldata_uses_curve`. The executor's static call graph for the action does not include Curve `exchange`.
- **P5** (no flash required): `!calldata_uses_flash`. The executor's static call graph for the action does not include a flash provider call.
- **P6** (oracle force-exit override): `digest.primaryType == FORCE_EXIT && validForceAuthorization(sig) && acknowledgedRisks.STALE_ORACLE_OVERRIDE && ActionEvidence.nonPriceFieldsValid`.
- **P7** (Curve-degraded force-exit): `digest.primaryType == FORCE_EXIT && validForceAuthorization(sig) && minRepayment <= executable_at_current_depth && maxCollateralSold >= required_at_current_depth && acknowledgedRisks.INSUFFICIENT_CURVE_DEPTH`.
- **P8** (alternate flash provider): **UNREACHABLE IN PHASE 1.** Phase 1 ships a single flash provider (Uniswap V3); `LoopRegistry.alternateFlashProvider(action)` is always `address(0)` in Phase 1, so the predicate `LoopRegistry.alternateFlashProvider(action) != 0` is always false. The cell evaluates to ✗ for Phase 1. P8 is retained as a Phase G predicate definition (Phase G adds alternate flash providers behind separate audit) and signals to readers that the matrix already encodes the future degraded-mode path; the architect-audit finding of "Phase G leaking into Phase 1 degraded-mode" is closed because runtime evaluation can never satisfy the predicate.
- **P9** (sequencer-down force-exit): `digest.primaryType == FORCE_EXIT && validForceAuthorization(sig) && morphoOracleFreshIndependently && acknowledgedRisks.SEQUENCER_DOWN_OVERRIDE`.
- **P10** (vault-evidence-missing force-exit): `digest.primaryType == FORCE_EXIT && validForceAuthorization(sig) && morphoEvidenceIndependent && acknowledgedRisks.VAULT_EVIDENCE_OVERRIDE`.
- **P11** (sequencer-down repay): `calldata_has_exact_debt_amount && !calldata_uses_price_source && !calldata_uses_curve`.

"Risk-reducing" is not a free predicate anywhere in this matrix. Every conditional cell resolves to one of the named P-predicates, each of which is a finite Solidity expression implemented as a pure function.

Incident state is an on-chain enum on `EmergencyGuardian` (`NONE | INVESTIGATING | MITIGATING | RESOLVED`); the matrix rows for `INCIDENT_INVESTIGATING` and `INCIDENT_MITIGATING` correspond directly to those enum values. There is no "incident runbook allows" clause — the guardian sets the enum, and the matrix is the rule.

Post-matrix orthogonal gates (v1.2 additions):

The §7.1 matrix encodes degraded-mode reachability based on the state bitmap. Several gates introduced by the v1.2 spec-stage audit integration fire *orthogonally* to the matrix — they apply at action entry regardless of state bitmap state. Each is enumerated here so the executor wires them into the executor's per-action entrypoint check sequence:

- **G-PM-1 `HarvestConvergencePending`** (I-69): for `Open` and leverage-increasing `Rebalance` actions, the executor reverts if a registry-pinned harvest event was observed within `harvestCoolingBlocks` of the action's block. Risk-reducing actions and force-exit bypass this gate.
- **G-PM-2 `IndexerAnchorStale`** (F-7): for any action whose evidence-bundle was constructed from indexer-served data, the SDK refuses to sign if no fresh `StateSnapshotAccepted` has appeared within `anchorMaxStaleBlocks × anchorEmergencyMultiplier`. On-chain this is enforced by the SDK refusing to submit; the executor itself does not introspect anchor staleness (the SDK is the enforcement point).
- **G-PM-3 `RpcQuorumNotIndependent`** (I-68): the SDK fails closed before signing or executing if the available RPC quorum cannot span ≥2 distinct `providerFamily` values. Enforced at the SDK layer, not on-chain.
- **G-PM-4 `Eip1271PreimageNotAttested`** (I-66): for high-risk policy classes signed via EIP-1271, `LoopAuthorization.validateHighRiskPolicy` reverts if the smart-wallet either does not return a non-zero `eip1271PreimageDisplayProof` or is not on the registry-pinned preimage-display-guaranteed allow-list. High-risk classification is determined entirely by digest content: `primaryType == FORCE_EXIT`, or `digest.maxDebtIncrease > 0`, or the `AutomationExec` underlying-action discriminator names a high-risk underlying. The classification is monotonic and digest-derivable; it does NOT depend on the runtime relationship to `currentLeverageBps` (so an action signed when leverage is X and executed when leverage is X+ε is classified the same way both times). See §6.4 high-risk policy class definition (revised) below.
- **G-PM-5 `MevWaiverMissing`** (F-2): for any action whose digest's signed `mevProtectionMode` requires a waiver bit at the runtime submission path, the executor reverts if the matching `mevWaiverBits` bit is unset.
- **G-PM-6 `AutomationAttemptThrottled` / `CallerNotAllowed`** (I-72): for permissionless executions against price-sensitive policies, the executor reverts if the caller is not on the registry-pinned `permissionlessCallerAllowList` (Phase 1 only) or if the per-policy failed-attempt rate has exceeded `maxFailedAttemptsPerWindow`.

Ordering: the orthogonal gates fire in the order listed above (G-PM-1 first, G-PM-6 last) so that the user / caller sees the deepest safety gate before a caller-grief throttle. Reverts at G-PM-1, G-PM-4, or G-PM-5 indicate a safety concern; reverts at G-PM-6 indicate a caller / liveness concern.

### 7.2 Reorg And Confirmation Policy

Base reorgs are real (sequencer transitions, future shared-sequencer changes). The protocol enforces a uniform finality posture across previews, signing, execution, indexer reporting, and points eligibility.

Finality thresholds:

- `finalityThreshold = 10 blocks` on Base for general indexing and points eligibility. Final value pinned in `LoopRegistry` and; raised if Base reorg behavior changes.
- `quoteBlockNumber + maxQuoteAgeBlocks` upper-bounds digest broadcast validity (§6.4); recommended `maxQuoteAgeBlocks = 5` for direct actions, `30` for automation on Base.
- Automation proposals carry `notBefore = max(triggerBlock, finalizedBlock)` to prevent execution against sub-finality evidence.

Reorg handling:

- Indexer: events below `finalityThreshold` are flagged `provisional: true`. On reorg, provisional events whose tx no longer appears in the canonical chain are marked `reorged: true` and excluded from subsequent reads. The indexer re-emits replacement events for the new canonical chain at the same block range; SDK consumers reconcile by `actionDigest` join (§11).
- SDK: refuses to build a production transaction whose readiness or evidence bundle includes any provisional event. Refuses to fire keeper automation against provisional state.
- Contract: no direct reorg awareness is required. A reorg invalidates the executed tx; the digest's nonce bit is set on the new chain head only when the executor re-runs successfully there. Re-execution requires a valid digest, so nothing replays without the user's signature.
- Wallet UX: pending-tx surfaces mark "provisional" submissions for below-finality confirmations. Tx hashes that reorg out are explicitly marked; the SDK does not auto-resubmit without explicit user prompt (avoids signing a stale action against a different chain state).

Quote freshness vs deadline:

- `deadline` is a wall-clock guard (timestamp).
- `quoteBlockNumber + maxQuoteAgeBlocks` is a market-state guard.
- The executor reverts on the stricter of the two: `QuoteStale` if the block guard fails, `DeadlineExceeded` if the wall-clock guard fails.

Points and accounting:

- SPEC003 points are credited only against `finalized: true` events (§11).
- The reporting pipeline reconciles against the most recent finalized snapshot; provisional accounting is internal-only and never user-visible.

### 7.3 External Protocol Semantic Fingerprint

Address pinning, `EXTCODEHASH` comparison, and timelocked registry changes catch direct address swaps and direct bytecode changes. They do NOT catch *semantic* drift of external venues whose behavior can change without WSTDIEM contracts changing — Curve pool parameter changes, Chainlink aggregator phase changes, wstDIEM vault accounting changes, Morpho oracle/IRM config changes, Uniswap V3 fee tier or tick-spacing changes, Base sequencer-feed behavior changes. The 2026-06-12 security audit (Codex) identified this as the cheapest "looks safe, isn't safe" failure mode: registry checks pass; signed digests succeed; the user eats slippage, oracle lag, or bad-debt exposure because the venue's semantics shifted underneath them.

Required: `LoopRegistry` MUST pin an `ExternalProtocolFingerprint` per integration in addition to address + `EXTCODEHASH`. Each fingerprint is a domain-separated hash of the venue's load-bearing semantic invariants; `LoopAuthorization.validateExternalConfig` re-derives the fingerprint at action entry and reverts `CONFIG_INTEGRITY_FAILURE` (state bit 1) on mismatch. The matrix is registry-pinned and timelocked; updates follow the §5.4 audit-gate reclose conditions.

Per-integration fingerprint contents (Phase 1 minimum):

- **Curve pool (wstDIEM ↔ DIEM route)**: `coins(0)`, `coins(1)`, `balances(0)`, `balances(1)` (latched at a registry-time block; tolerance band for live drift), `fee()`, `admin_fee()`, `A()` parameter, `oracle()` if exposed. Drift beyond registry-pinned tolerance bands raises `CONFIG_INTEGRITY_FAILURE`.
- **Uniswap V3 flash pool**: `factory()`, `token0()`, `token1()`, `fee()` (tier), `tickSpacing()`, `liquidity()` floor, `slot0().tick` band, plus EXTCODEHASH of the pool.
- **Chainlink price feed**: `aggregator()` (current phase), `decimals()`, `phaseId()`, `latestRoundData()` heartbeat-derived staleness baseline. Sequencer Uptime Feed: address, decimals, `latestRoundData()` baseline.
- **wstDIEM vault**: `asset()`, `decimals()`, current `totalSupply()` nonzero, current `totalAssets()` nonzero, `convertToAssets(1e18)` value at registry-time (tolerance band for organic drift, alarms beyond the registry-pinned `MAX_NAV_STEP_BPS`), harvest authority address, harvest event topic hashes (O20).
- **Morpho Blue**: full `MarketParams` (loanToken, collateralToken, oracle, irm, lltv), oracle implementation fingerprint, IRM fingerprint, market existence assertion via `idToMarketParams(market).oracle != address(0)`.
- **Base sequencer feed**: address, decimals, `latestRoundData()` startedAt baseline.

Tolerance bands vs hard equality:

- Hard-equality fields (revert on any drift): `factory`, `token0`, `token1`, `fee`/`tier`, `decimals`, `asset()`, `coins`, `MarketParams` fields, `aggregator` address.
- Tolerance-band fields (registry pins a target + max drift bps): `liquidity()`, `balances()`, `convertToAssets(1e18)`. The tolerance bands themselves are registry entries with the same timelock + reclose semantics.
- Live-baseline fields (registry pins a baseline + max staleness): `slot0().tick`, `latestRoundData().updatedAt`.

PR-5 concrete encoding: `hardEqualityHash`, `toleranceBandHash`, and `liveBaselineHash` are domain-separated `keccak256(abi.encode(...))` commitments over the fields above. `queueExternalFingerprintUpdate` re-reads the live venue, rejects contradictory hashes with `FingerprintInvalid(uint8)`, and stores the decoded queue-time baselines needed for tolerance/staleness checks. `validateExternalConfig` is enabled for markets that configure the external-protocol fingerprint venue (`SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT` or the Uniswap V3 flash pool); when enabled it re-reads every configured venue required by the primary type, skips zero-address venues, reverts missing stored fingerprints with `ConfigIntegrityFailure`, and reverts live drift with `FingerprintMismatch(1)` for hard equality, `FingerprintMismatch(2)` for tolerance-band failure, or `FingerprintMismatch(3)` for staleness/live-baseline failure.

Initial deployments MUST run a post-deploy fingerprint initialization ceremony after the atomic address/config batch: queue every required `ExternalProtocolFingerprint` with `queueExternalFingerprintUpdate`, wait the O7 timelock, then apply each queued row with `applyExternalFingerprintUpdate` before production actions are enabled. Until this ceremony completes, `validateExternalConfig` is expected to fail closed with `ConfigIntegrityFailure` for actions that depend on external protocol fingerprints.

Update path on legitimate venue change:

- A timelocked `LoopRegistry.updateExternalFingerprint(integrationId, newFingerprint)` requires the O7 timelock and triggers a Protocol Audit Gate v2 reclose for that integration. During the timelock window the SDK marks affected actions as `CONFIG_PENDING_UPDATE` and the executor continues to accept the old fingerprint. Once the timelock expires, only the new fingerprint is accepted.
- Phase 1 does NOT auto-detect "this looks like a legitimate change" — every drift is `CONFIG_INTEGRITY_FAILURE` until the operator explicitly queues a registry update.

the SDK type definitions pins:

- Canonical fingerprint encoding (which fields, which order, what tolerance metadata).
- The `validateExternalConfig` signature and call placement (before signature validation? after? per-action?).
- The `CONFIG_INTEGRITY_FAILURE` state-bit row in the §7.1 matrix already encodes the response: only Revoke remains permitted; every action class fails closed.

This is I-71 (external-protocol-semantic-fingerprint) from the protocol threat model.

---

## 8. Keeper And Automation Requirements

Phase 1 keepers are service operators, not governance token actors.

Automation is a user-owned policy layer, not discretionary operator control. Every automation policy must be represented by scoped `LoopAuthorization` constraints and must be visible, editable, expirable, and revocable from the app and by direct contract interaction.

Supported Phase 1 automation policies:

- repay or deleverage when health factor falls below a user-selected warning threshold.
- full-exit or stop-loss when health factor, liquidation distance, or price movement crosses a user-selected critical threshold.
- leverage increase only when explicitly enabled by the user and bounded by max leverage, max notional, max fee, max slippage, minimum post-action health factor, and expiry.
- route retry only inside the original user-approved action envelope.

Automation lifecycle:

1. Owner creates or updates a stored policy in `LoopAuthorization`.
2. Policy emits a stable policy ID, action envelope, expiry, fee cap, and revocation nonce.
3. Risk engine or keeper observes policy conditions at a pinned evidence block.
4. Automation proposal is generated with the §5.5 `ActionEvidence` struct (sources, `stateBitmap`, `blockNumber`), quote hash, action digest, execution window, fee quote, and failure conditions keyed to the §5.5 canonical error set.
5. Executor verifies the policy is active, conditions are met, evidence is fresh, digest matches, nonce is unused, and revocation has not occurred (5-block grace period after `revoke()` reverts execution with `PolicyRevoking`).
6. Any caller may execute the action within the policy envelope once conditions are met, subject to the §6.4 fee cap, the §6.5 `mevProtectionMode` (default `PRIVATE_BUILDER`; public mempool submission requires explicit `PUBLIC` opt-in and is rejected for force-exit policies), and replay protection via the Permit2-style nonce bitmap.
7. Success, failure, missed execution, stale evidence, expired proposal, revoked policy, and fee settlement are emitted as indexable events.

Automation liveness requirements:

- keeper service downtime must not prevent a user or third-party caller from executing a valid pre-authorized risk-reducing action.
- every policy must have a direct user fallback path through the app, SDK, and direct contract calls.
- cancellation or revocation wins over any pending automation proposal that has not already executed.
- failed automation attempts must not consume a nonce unless the contract actually changes user state.
- no keeper can execute outside the §6.4 stored-policy bound envelope (action / market / spender / notional / leverage / slippage / fee / health / expiry / registry-version / quote-age / `mevProtectionMode`); the §6.4 bound-parity invariant guarantees every executor-enforced bound has a corresponding signed digest or policy field.

Phase 1 permissionless AutomationExec scope restriction (closing AC-17, 2026-06-12 Round-2 audit):

The 2026-06-12 attacker audit identified that `triggerConditionHash` is an opaque commitment with no canonical preimage or on-chain validator. If permissionless keepers can execute against any stored policy whose digest carries an opaque trigger, the keeper effectively becomes the trigger arbiter — a discretionary authority class that contradicts §8's stated stance that automation is user-owned and risk-engine proposals are observability-only.

**Phase 1 closes the gap by restricting permissionless AutomationExec scope:** `KEEPER_PERMISSIONLESS` execution of stored automation policies is permitted ONLY for risk-reducing policy classes:

- `REPAY_ONLY` (Morpho `repay` only, calldata-shape-validated per I-51, no Curve, no leverage change).
- `DELEVERAGE_ONLY` (closed-form `post_debt < pre_debt && post_health_factor > pre_health_factor` predicate per §6.3 emergency-deleverage; bounded by signed `Exit` envelope with `maxCollateralSold > 0`).
**PB1.4 update (2026-06-12).** `FORCE_EXIT` is REMOVED from the AutomationExec permissionless underlying-class allowlist. The PR-2 audit cycle (PB2-3 / PB2-4) confirmed that allowing `FORCE_EXIT` as an AutomationExec underlying class combined with missing `policyHash` enforcement to produce a Critical drain path that bypassed §6.3's Phase-1 force-exit ban. The Phase 1 one-shot permissionless force-exit path is the direct `ForceExit` digest with `executionKind == KEEPER_PERMISSIONLESS` routed through `LoopAuthorization.validateForceExit` per the SDK type definitions §A6.2.1, **NOT** through an `AutomationExec(FORCE_EXIT)` wrapper. Stored force-exit policies remain disallowed by I-67. `validateAutomationExec` reverts `Phase1AutomationScopeViolation` for any `underlyingPrimaryType == FORCE_EXIT`. This closes the §6.3:534 (ForceExit must be `OWNER_DIRECT | OPERATOR_RECOVERY`) versus §8 AC-17 conflict by allowing `KEEPER_PERMISSIONLESS` only for one-shot ForceExit via §A6.2.1.

Permissionless execution of `Open`, leverage-increasing `Rebalance`, and stored full-`Exit` automation policies is **DEFERRED TO PHASE G**. Phase G must ship:
- A canonical `TriggerKind` enum and typed preimage schema for `triggerConditionHash`.
- An on-chain `validateTrigger(policyId, evidence)` predicate function.
- A matching SDK builder with deterministic encoding (G14 calldata-parity differential test extends to triggers).

Phase 1 owners CAN still create stored Open / leverage-increasing Rebalance / full-Exit policies; they just cannot be executed by a non-owner caller in Phase 1. Owner-direct execution (`executionKind == OWNER_DIRECT`) of any policy class remains available. `LoopAuthorization.createPolicy` and `executeFromPolicy` enforce the Phase 1 restriction at the policyClass boundary; attempting permissionless execution of an out-of-scope policy class reverts `Phase1AutomationScopeViolation` (new canonical error).

This Phase 1 scope is a deliberate liveness-vs-safety tradeoff: keeper-driven stop-loss, repay, and emergency-deleverage remain operational (the primary user-protection path); discretionary leverage management is owner-direct only in Phase 1.

Permissionless-attempt grief bound (I-72):

The 2026-06-12 security audit identified that failed automation attempts not consuming a nonce, combined with bloXroute Protect requiring an operator-held API key, creates a grief surface: an attacker can repeatedly submit near-bound stale proposals or spam private-relay quota to degrade stop-loss liveness when it matters. Phase 1 closes:

- Per-policy attempt throttle: `LoopAuthorization` tracks `failedAttempts(policyId)` and rate-limits permissionless callers to `maxFailedAttemptsPerWindow` failed attempts per `attemptThrottleWindowBlocks` (registry-pinned; default 5 attempts per 60 blocks ≈ 120s). Beyond the rate limit, permissionless execution against that policy reverts `AutomationAttemptThrottled` until the window expires. Owner-direct calls bypass the throttle.
- Caller allow-list (Phase 1 only): permissionless execution against price-sensitive policies (force-exit, leverage-increasing) requires the caller to be on a registry-pinned `permissionlessCallerAllowList` until keeper bonding (the WSTD token specification) is operational. This is a Phase 1 narrowing; Phase G removes the allow-list once bonding gates spam.
- Builder-relay quota protection: the keeper service tracks per-policy and per-policy-class consumption of bloXroute API quota; sustained quota burn beyond `builderQuotaPolicyBudget` per `builderQuotaWindow` (registry-pinned) triggers an alert and temporarily pauses permissionless execution for that policy class. Owner-direct submission is unaffected.
- The `AutomationAttemptThrottled` selector and the related events `AutomationAttemptRateLimited(policyId, caller)` and `BuilderQuotaExceeded(policyClass)` are part of the canonical fail-closed error set and §11 envelope.

Required keeper duties:

- monitor all approved markets.
- detect positions near warning and critical health thresholds.
- submit safe deleverage or exit proposals.
- execute only user-authorized actions.
- support permissionless execution of user-authorized actions by publishing proposal data and action digests.
- report missed execution, failed routes, oracle deviations, and incident state.
- never custody user funds.

Keeper incentives before WSTD:

- explicit automation fee derived per the §6.4 keeper-fee decision (static cap, dynamic `min(feeCap, baseFee × gasUsed × marginBps)`, or offchain bidding); the chosen mechanism is recorded in the protocol.
- optional fee share from successful user-authorized actions.
- points under SPEC003 for measured reliability, credited only against finalized events per §7.2.

Keeper incentives after WSTD:

- WSTD bonds and slashing only after the WSTD token specification and a later keeper-bond spec clear.
- no bonded keeper authority over uncapped user funds.

---

## 9. Fees And Revenue

Required fee types:

- execution fee.
- automation fee.
- protocol fee if approved.
- third-party route and flash-loan costs.
- optional premium monitoring tier.

Fee requirements:

- fees are quoted before signing.
- fees are capped per action.
- net user outcome must include protocol fees, Curve fees, slippage, borrow APY, vault APY, and flash fees.
- fee receiver emits enough events for SPEC003 revenue measurement.
- no WSTD is required to pay fees or exit.
- WSTD discounts are deferred to the WSTD token specification gates.

---

## 10. Public Product Requirements

The public app is a protocol safety surface. A user must be able to understand the market, route, authorization, risk, and transaction outcome before signing. The app must fail closed when the underlying readiness or evidence APIs fail closed.

The public WSTDIEM app must include:

- wallet connect.
- supported market list with live readiness state.
- market detail screen with collateral, debt asset, Morpho market, Curve route, oracle state, liquidity depth, borrow APY, base APY, utilization, and audit-gate status.
- loop sizing calculator backed by the same engine as CLI sizing.
- route and slippage quote display.
- APY spread display with assumptions.
- health factor and liquidation distance display.
- authorization setup and revoke screens.
- automation policy screens for repay/deleverage, full-exit or stop-loss, optional leverage increase, max fee, max slippage, min health factor, expiry, and revoke.
- open, rebalance, deleverage, and exit flows.
- transaction preview and calldata disclosure.
- event history and downloadable evidence.
- audit gate and incident banner.
- links to deployed addresses, docs, audits, status page, and source commits.

Every transaction preview must include:

- action type, EIP-712 `primaryType`, market, chain id, owner, executor address, `verifyingContract`, registry merkle root, `registryVersion`, spender addresses with EXTCODEHASH verification state, and — for proxied integrations — the registry-pinned implementation address + implementation EXTCODEHASH that the executor will assert against the proxy's public getter (or, for implementation-non-introspectable proxies, a "monitored-via-fingerprint" badge linking to §7.3).
- the §6.4 canonical action digest plus each sub-hash (spender-list, allowance-schedule, evidence-bundle, and — if retained — failure-condition). `calldataHash` is shown for parity audit and is labelled "not consumed by verifier."
- before and after collateral, debt, leverage, health factor, liquidation distance, and wallet balances. If any field cannot be computed from current Morpho/oracle evidence the preview blocks with `LEDGER_BEFORE_UNAVAILABLE`, `LEDGER_AFTER_UNAVAILABLE`, or `HEALTH_INDETERMINATE` — never a silent "—" or zero. For repay-only under sequencer-down (P11) or oracle-degraded (P2) states, `HEALTH_INDETERMINATE` is the canonical sentinel and the preview shows the explicit reason it cannot be computed.
- DIEM and wstDIEM input/output amounts, the Curve route (when used; not used in Phase 1 open), price impact, signed `maxSlippageBps`, `deadline`, nonce slot/bit, `quoteBlockNumber`, `maxQuoteAgeBlocks`, `maxQuoteDeviationBps`, `mevProtectionMode`, and expected dust refund with the `MAX_DUST_BPS` bound.
- protocol fee, automation fee, third-party route fees, flash-loan fee, borrow APY, vault APY, net APY spread, and the keeper-fee derivation chosen in the protocol (§6.4) with the corresponding inputs displayed (static cap, or `baseFee × gasUsed × marginBps`, or winning bid).
- token allowance changes (`approve(0)` then `approve(N)` per (token, spender)), Morpho authorization changes, WSTDIEM authorization changes, revocation path, and any standing approval that remains after execution.
- decoded calldata summary derived from the same schema the contract decodes; linkable raw calldata; protocol acceptance includes the SDK ↔ contract calldata parity differential test.
- for `ForceExit` previews: ≥3 seconds of sign-button dwell, non-default color warning, decoded `force=true`, decoded `maxCollateralSold`, decoded `minRepayment`, decoded `expiry`, decoded `verifyingContract`, and an explicit checkbox acknowledgment for each set bit in `acknowledgedRisks`.
- explicit failure conditions keyed to the §5.5 fail-closed error-code set, including stale oracle, closed audit gate, insufficient Curve liquidity, insufficient flash liquidity, exceeded slippage, health-factor bound failure, wrong chain, registry mismatch, executor mismatch, expired quote, sequencer down, incident state, and revoked authorization. The preview surfaces both the matched §7.1 state bits and the §7.1 predicate evaluation outcome.

The public SDK must include:

- `getMarkets()`.
- `getReadiness(market, owner?)`.
- `getMarketEvidence(market)`.
- `getPositionRisk(market, owner)`.
- `quoteOpen(params)`.
- `quoteRebalance(params)`.
- `quoteExit(params)`.
- `simulate(params)`.
- `previewTransaction(params)`.
- `getAutomationPolicies(owner, market?)`.
- `proposeAutomationAction(policyId)`.
- `executeAutomationProposal(proposalId | digest)`.
- `buildAuthorization(params)`.
- `buildTransaction(params)`.
- `decodeCalldata(calldata)`.
- `revokeAuthorization(policyId | digest)`.
- `decodeLoopEvent(log)`.
- `subscribePosition(owner, market)`.
- `getEvidenceBundle(owner, market?, range?)`.
- `getRiskStatus(market)` — returns the §5.1 `RiskStatus` struct with per-source enum and sequencer-uptime status.
- `getStateBitmap(market)` — returns the current §7.1 `uint16 stateBitmap` plus the resolved allow/block decision per action class.
- `getCanonicalErrors()` — returns the §5.5 canonical fail-closed error code set as `{ selector, name, category, humanReadable }` entries; used by integrators to render contract reverts.

---

## 11. Data, Events, And Points Evidence

Every protocol action is indexable. Events bracket each action's intermediate steps and carry the canonical action digest as the join key.

Action envelope pattern:

- Every action emits three event classes that together form the indexer reconstruction surface:
  - `LoopActionStarted(bytes32 indexed digest, uint8 indexed primaryType, address indexed owner, bytes32 marketId, uint256 blockNumber)` at executor entry.
  - `LoopActionStep(bytes32 indexed digest, uint8 indexed stepNo, address indexed target, bytes4 selector)` at each intermediate call site (Morpho, Curve, flash provider, fee router, vault). The executor emits one `LoopActionStep` per WSTDIEM-side call into an external venue, *before* making the external call. The step events label the call sequence so the indexer can correlate the external Morpho/Curve/Uniswap V3 logs that follow.
  - `LoopActionCompleted(bytes32 indexed digest, uint16 statusCode)` at completion.
- External contracts (Morpho, Curve, Uniswap V3, the wstDIEM vault, `LoopFeeRouter` if separately deployed) CANNOT emit `actionDigest` as a topic because they are not under WSTDIEM control and do not know the WSTDIEM-side digest. The indexer joins external logs into the WSTDIEM action envelope by `(txHash, blockNumber, logIndex)` falling between the matching `LoopActionStarted` and `LoopActionCompleted` brackets, using the immediately preceding `LoopActionStep` as the call-sequence label. This corrects the earlier spec text that mandated indexed `actionDigest` on intermediate logs; the canonical event envelope documents the design.
- Indexer reconstruction uses `actionDigest` as the equality anchor between WSTDIEM-emitted events: the off-chain reconstructed preview hash MUST equal the on-chain emitted `actionDigest`; mismatches raise an alert and fail closed for that action.
- Reverted transactions discard all logs. If a transaction receipt shows success but `LoopActionCompleted` is missing for a matching `LoopActionStarted`, that is an invariant breach — the executor MUST always close the envelope when the transaction succeeds. Failed-attempt records during simulation are keeper/SDK observability artifacts, never protocol events.
- Event signature versioning uses signature-name convention (`LoopOpenedV2`); the topic[0] selector change is the load-bearing signal indexers monitor. No leading version byte is used.

Required event groups (each may have multiple signatures over time; signature-name versioned):

- Market lifecycle: market registration, oracle adapter source update, sequencer status note.
- Authorization: `MorphoAuthorizationSet/Revoked` (mirror reads), `WstdiemAuthorizationSet/Revoked`, automation policy `Created/Updated/Revoked`, `PolicyRevoking` window opened.
- Automation: proposal `Created/Expired/Executed/Failed`; fee settlement.
- Action envelope: `LoopActionStarted`, `LoopActionCompleted`, `LoopOpened`, `LoopRebalanced`, `LoopDeleveraged`, `LoopExited`, `LoopForceExited`.
- Settlement substeps: route quote committed; allowance schedule step; fee charged; `FeePayoutFailed`; keeper proposal; keeper execution; `LargeDustRefund`.
- Emergency / integrity: `EmergencyPaused`/`EmergencyUnpaused` (per-action-class bitmask), `IncidentStateChanged(prev, next)`, `StateSnapshotAccepted(blockNumber, manifestHash)`.

Every action envelope event contains enough data to reconstruct:

- owner, market, executor address, `primaryType`, `verifyingContract`.
- canonical action digest plus every sub-hash bound in §6.4: `quoteHash`, `spenderListHash`, `allowanceScheduleHash`, `feeCapHash`, `evidenceBundleHash`, and (if retained) `failureConditionHash`. `calldataHash` is emitted for parity audit and is not consumed by the verifier.
- `registryVersion` and `registryMerkleRoot` at the action's read block.
- `policyId` and `proposalId` when automation is involved.
- input token and amount; collateral supplied or withdrawn; DIEM borrowed or repaid; vault deposit shares minted (open).
- health factor before and after; if any value cannot be computed from current Morpho/oracle evidence, the event carries the `HealthIndeterminate` reason code from the §5.5 canonical error set — never a silent zero.
- realized slippage, realized route output, and (for force exit) the executed `acknowledgedRisks` bitmask.
- protocol fee, automation fee, flash fee, third-party route fees.
- token allowance changes plus the post-action allowance-reset proof (per-(token, spender) zero-after assertion).
- keeper or executor caller address when permissionless execution was used; `mevProtectionMode` actually used.
- block number and transaction hash through indexing.

Reorg flagging and finality:

- Indexer marks any event with confirmation depth below `finalityThreshold` (§7.2) as `provisional: true`. SDK and keeper code refuse to act on provisional events. Once an event reaches the finality threshold the indexer flips it to `finalized: true`.
- `StateSnapshotAccepted` is itself an envelope event that records the indexer's claimed snapshot root at the current block; SDKs validate indexer responses against the most recently accepted snapshot before consuming them.

SPEC003 points use only durable, finalized records or reconciled accounting sources. Provisional events are never points-eligible.

---

## 12. Governance And Admin Requirements

Before WSTD governance, admin control must use multisig plus mandatory timelock for every non-emergency safety-critical change.

Requirements:

- every mutable parameter has a min/max bound.
- every mutable parameter emits an event.
- every privileged role is documented.
- every production address is published.
- registry, oracle, executor, fee receiver, keeper permission, route, spender, market, upgrade, and ownership changes require timelock, public queue visibility, and monitoring.
- emergency guardian authority is limited to pausing new risk-increasing actions and incident annotations; it cannot change registry entries, oracles, executors, fee receivers, spenders, keepers, user authorizations, or user balances.
- emergency guardian can pause new leverage but cannot block ordinary user repay, deleverage, revoke, or exit when the degraded-mode matrix allows the action.
- role transfer must use a two-step accept flow.
- upgradeable contracts require a published upgrade process, timelock, audit, and rollback plan.
- non-upgradeable contracts require constructor input publication and bytecode verification.

Lybra-derived guardrail:

- no single deployer key may retain unbounded long-term authority over minting, vault activation, fee routing, keeper permissions, or governance role assignment.

---

## 15. Explicit Non-Goals For First Complete Release

- Forking Prisma's full trove system.
- Forking Lybra's vault or reward contracts.
- Launching WSTD.
- Launching gauges.
- Launching sWSTD or backstop slashing.
- Cross-chain peUSD-style token expansion.
- DIEM entry in the first launch open-loop transaction.
- Migration zaps between markets.
- Broad Contango-style multi-protocol leverage marketplace.
- Arbitrary user-selected routes or unsupported external spenders.
- Pendle, restaking, points-farming, or generalized yield-strategy aggregation.
- Automation policies that can execute outside user-scoped caps, expiry, market, action, spender, or health-factor constraints.
- Unbounded governance control over oracles, executors, fees, routes, or user exits.
