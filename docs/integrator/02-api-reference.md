# API Reference

Complete reference for every method on `WstdiemSdk`.

All methods are async. The SDK is isomorphic (Node + browser) and purely functional (no side effects).

## Discovery

### getMarkets()

```ts
getMarkets(): Promise<Market[]>
```

Fetch all available loop markets from the indexer.

**Returns:** Array of Market objects with exchange rates, spreads, and metadata.

**Example:**
```ts
const markets = await sdk.getMarkets();
markets.forEach(m => console.log(`${m.id}: ${m.exchangeRate}`));
```

### getReadiness(market, owner?)

```ts
getReadiness(
  market: MarketId,
  owner?: Address
): Promise<ReadinessResult>
```

Fetch the state-bitmap decision matrix for a market and optional owner. Returns per-action decisions (open/rebalance/exit) and whether each is allowed, blocked, or not applicable.

Includes `gateStatuses` populated with G-PM-1..6 evaluations.

**Parameters:**
- `market` — Market ID from `getMarkets()`
- `owner` — Optional owner address (if supplied, position-specific decisions; else market-wide)

**Returns:** ReadinessResult with state bitmap, per-action decisions, and gate statuses.

**Example:**
```ts
const readiness = await sdk.getReadiness(market.id, owner);
console.log(`Open allowed: ${readiness.perAction.open.decision}`);
console.log(`Audit gate: ${readiness.perAction.open.gateStatuses}`);
```

### getMarketEvidence(market, primaryType?)

```ts
getMarketEvidence(
  market: MarketId,
  primaryType?: PrimaryType
): Promise<ActionEvidence>
```

Fetch the canonical evidence bundle for a market (oracle, position, route evidence). Used by integrations that build custom evidence.

**Parameters:**
- `market` — Market ID
- `primaryType` — Optional action type filter (Open, Rebalance, etc.)

**Returns:** ActionEvidence with sorted sources and evidenceBundleHash.

**Example:**
```ts
const evidence = await sdk.getMarketEvidence(market.id, "Open");
console.log(`Timestamp: ${evidence.blockNumber}`);
```

### getPositionRisk(market, owner)

```ts
getPositionRisk(
  market: MarketId,
  owner: Address
): Promise<PositionRisk>
```

Fetch health factor, leverage, liquidation distance, and error status for an owner's position.

**Parameters:**
- `market` — Market ID
- `owner` — Owner address

**Returns:** PositionRisk with healthFactorWad, leverageBps, liquidationDistanceBps, and error details.

**Example:**
```ts
const risk = await sdk.getPositionRisk(market.id, owner);
if (risk.errors.length > 0) {
  console.log(`Position has errors: ${risk.errors.map(e => e.name)}`);
}
```

## Quoting

All quote methods return a complete `TransactionPreview` ready to sign.

### quoteOpen(params)

```ts
quoteOpen(
  params: CommonActionEnvelope & {
    primaryType: "Open";
    bounds: OpenBounds;
  }
): Promise<TransactionPreview>
```

Quote an Open action (open a new loop position).

**Parameters:** See [Action Types](./03-action-types.md) for bounds shape.

**Returns:** TransactionPreview with calldata, gas estimate, gate statuses, and readiness.

**Example:**
```ts
const preview = await sdk.quoteOpen({
  owner: "0x...",
  market: market.id,
  primaryType: "Open",
  bounds: { /* ... */ },
  chainId: asChainId(8453),
  nonce: { slotIndex: 0n, bitIndex: 0n },
  mevProtectionMode: "PRIVATE_BUILDER",
  mevWaiverBits: 0,
});
```

### quoteRebalance(params)

```ts
quoteRebalance(
  params: CommonActionEnvelope & {
    primaryType: "Rebalance";
    bounds: RebalanceBounds;
  }
): Promise<TransactionPreview>
```

Quote a Rebalance action (adjust existing leverage).

### quoteExit(params)

```ts
quoteExit(
  params: CommonActionEnvelope & {
    primaryType: "Exit";
    bounds: ExitBounds;
    routeKind: ExitRouteKind;
  }
): Promise<TransactionPreview>
```

Quote an Exit action (close a position).

**Parameters:** routeKind is "CURVE" or other routes per registry.

### quoteForceExit(params)

```ts
quoteForceExit(
  params: CommonActionEnvelope & {
    primaryType: "ForceExit";
    bounds: ForceExitBounds;
  }
): Promise<TransactionPreview>
```

Quote a ForceExit action (high-risk exit with critical-override bits).

## Simulation

### simulate(action)

```ts
simulate(action: Action): Promise<TransactionPreview>
```

Run a full simulation of an action against current state.

**Parameters:** Fully-formed Action union (Open | Rebalance | Exit | ForceExit | AutomationExec | Revoke).

**Returns:** TransactionPreview with simulated results.

**Example:**
```ts
const preview = await sdk.simulate(openAction);
```

Currently an alias for `previewTransaction` in Phase 1 (Anvil fork-based simulation deferred).

### previewTransaction(action)

```ts
previewTransaction(action: Action): Promise<TransactionPreview>
```

Same as `simulate()` in Phase 1.

## Automation

### getAutomationPolicies(owner, market?)

```ts
getAutomationPolicies(
  owner: Address,
  market?: MarketId
): Promise<Policy[]>
```

Fetch all automation policies for an owner (optionally filtered by market).

**Returns:** Array of Policy objects with creation time, expiry, state, and optional acknowledgedRisks for FORCE_EXIT policies.

**Example:**
```ts
const policies = await sdk.getAutomationPolicies(owner);
policies.forEach(p => {
  console.log(`Policy: ${p.id}, expires in block ${p.expiryBlock}`);
  if (p.actionClass === "FORCE_EXIT" && p.acknowledgedRisks) {
    const risks = decodeAcknowledgedRisks(p.acknowledgedRisks);
    console.log(`Acknowledged risks: ${risks.map(r => r.name)}`);
  }
});
```

### proposeAutomationAction(policyId)

```ts
proposeAutomationAction(
  policyId: PolicyId
): Promise<TransactionPreview>
```

Generate a proposal transaction for an automation policy (keeper-callable).

**Parameters:** Policy ID from getAutomationPolicies().

**Returns:** TransactionPreview with the proposed action details.

**Phase 1 Status:** Keeper automation is restricted per AC-17. Permissionless execution returns degraded results.

### executeAutomationProposal(proposalIdOrDigest)

```ts
executeAutomationProposal(
  proposalIdOrDigest: ProposalId | ActionDigest
): Promise<Hex>
```

Execute a proposed automation action (keeper-callable).

**Parameters:** Proposal ID or Action Digest.

**Returns:** Transaction hash.

**Phase 1 Status:** Deferred per AC-17.

## Authorization + Transaction Building

### buildAuthorization(action)

```ts
buildAuthorization(action: Action): Promise<{
  typedData: unknown;
  digest: ActionDigest;
  evidence: ActionEvidence;
}>
```

Build an EIP-712 typed-data message for the wallet to sign.

**Parameters:** Fully-formed Action union.

**Returns:**
- `typedData` — Pass to wallet signing endpoint (eth_signTypedData_v4)
- `digest` — bytes32 hash the wallet signs
- `evidence` — The ActionEvidence bundle used in the digest

**Example:**
```ts
const auth = await sdk.buildAuthorization(openAction);
const signature = await wallet.signTypedData(auth.typedData);
```

### buildTransaction(action)

```ts
buildTransaction(action: Action): Promise<{
  to: Address;
  data: Hex;
  value: bigint;
  digest: ActionDigest;
}>
```

Build the executor transaction calldata (before signing).

**Parameters:** Fully-formed Action union.

**Returns:**
- `to` — Executor address from registry
- `data` — Encoded function call
- `value` — ETH value (usually 0n)
- `digest` — ActionDigest (same as buildAuthorization)

**Example:**
```ts
const tx = await sdk.buildTransaction(openAction);
console.log(`Will call: ${tx.to}`);
```

### attachSignature(action, signature, expectedDigest?, opts?)

```ts
attachSignature(
  action: Action,
  signature: Hex,
  expectedDigest?: ActionDigest,
  opts?: { pinnedBlockNumber?: BlockNumber }
): Promise<{
  to: Address;
  data: Hex;
  value: bigint;
  digest: ActionDigest;
}>
```

Splice the wallet signature into the executor calldata.

Re-runs full action assembly with optional `pinnedBlockNumber` to prevent quote drift between signing and broadcast.

**Parameters:**
- `action` — The signed action
- `signature` — 0x-prefixed hex signature from wallet
- `expectedDigest` — Optional digest for verification (throws QuoteDrift if mismatch)
- `opts.pinnedBlockNumber` — Block to pin evidence/quotes to

**Returns:** Transaction ready to broadcast (same shape as buildTransaction).

**Throws:** QuoteDrift if expectedDigest is supplied and recomputed digest disagrees.

**Example:**
```ts
const signature = await wallet.sign(auth.digest);
const tx = await sdk.attachSignature(action, signature, auth.digest, {
  pinnedBlockNumber: buildTxBlock,
});
// tx is ready to broadcast
```

### decodeCalldata(calldata)

```ts
decodeCalldata(calldata: Hex): Promise<Action>
```

Decode executor calldata back into an Action union (round-trip inverse of buildTransaction).

**Parameters:** Hex calldata from a broadcast transaction.

**Returns:** Reconstructed Action.

**Example:**
```ts
const txData = "0x...";
const action = await sdk.decodeCalldata(txData);
console.log(`Action type: ${action.primaryType}`);
```

### revokeAuthorization(target)

```ts
revokeAuthorization(
  target: PolicyId | ActionDigest
): Promise<{
  typedData: unknown;
  transaction: { to: Address; data: Hex };
}>
```

Build a revocation message (for policies) or transaction (for one-time digests).

**Parameters:** Policy ID or Action Digest.

**Returns:**
- For policies: typedData + transaction to broadcast
- For digests: transaction shape (revoke is on-chain only, no EIP-712 for one-time)

**Example:**
```ts
const revoke = await sdk.revokeAuthorization(policyId);
// Sign + broadcast revoke.transaction
```

## Event / Subscription / Risk

### decodeLoopEvent(log)

```ts
decodeLoopEvent(log: {
  address: Address;
  topics: Hex[];
  data: Hex;
}): Promise<unknown>
```

Decode a raw log into a typed loop event.

Recognizes: LoopActionStarted, LoopActionStep, LoopActionCompleted, LoopOpenedV2, LoopRebalancedV2, LoopExitedV2, LoopForceExitedV2, PolicyCreated, PolicyUpdated, PolicyRevoking, AutomationExecuted, AutomationFailed, StateSnapshotAccepted.

**Parameters:** Raw log from transaction receipt.

**Returns:** Typed event object (varies per event type).

**Example:**
```ts
const events = receipt.logs.map(log => sdk.decodeLoopEvent(log));
```

### subscribePosition(owner, market, cb)

```ts
subscribePosition(
  owner: Address,
  market: MarketId,
  cb: (risk: PositionRisk) => void
): () => void
```

Subscribe to position risk updates. Polls getPositionRisk at configurable interval and calls callback on change.

**Parameters:**
- `owner` — Owner address
- `market` — Market ID
- `cb` — Callback function (called with each new PositionRisk)

**Returns:** Unsubscribe function (idempotent).

**Example:**
```ts
const unsubscribe = sdk.subscribePosition(owner, market, (risk) => {
  console.log(`HF: ${risk.healthFactorWad}`);
});
// Later: unsubscribe();
```

### getEvidenceBundle(owner, market?, range?)

```ts
getEvidenceBundle(
  owner: Address,
  market?: MarketId,
  range?: { fromBlock: BlockNumber; toBlock: BlockNumber }
): Promise<ActionEvidence[]>
```

Fetch all evidence bundles for an owner (optionally filtered by market and block range).

**Parameters:**
- `owner` — Owner address
- `market` — Optional market filter
- `range` — Optional block range

**Returns:** Array of ActionEvidence objects from indexer.

**Example:**
```ts
const evidence = await sdk.getEvidenceBundle(owner, market.id, {
  fromBlock: asBlockNumber(1000000n),
  toBlock: asBlockNumber(1001000n),
});
```

### getRiskStatus(market)

```ts
getRiskStatus(market: MarketId): Promise<ReadinessResult>
```

Alias for `getReadiness(market)` without owner (market-wide risk).

### getStateBitmap(market)

```ts
getStateBitmap(market: MarketId): Promise<{
  stateBitmap: ReadinessResult["stateBitmap"];
  decisions: ReadinessResult["perAction"];
}>
```

Fetch state bitmap and per-action decisions for a market (shortcut for getReadiness).

## Static / Registry-pinned

### getCanonicalErrors()

```ts
getCanonicalErrors(): Promise<CanonicalError[]>
```

Fetch the canonical fail-closed error registry (77 errors).

**Returns:** Array of CanonicalError with name, selector, humanReadable description.

**Example:**
```ts
const errors = await sdk.getCanonicalErrors();
const quoteStaleErr = errors.find(e => e.name === "QuoteStale");
console.log(`Selector: ${quoteStaleErr.selector}`);
```

### getExternalProtocolFingerprints(market)

```ts
getExternalProtocolFingerprints(
  market: MarketId
): Promise<ExternalProtocolFingerprint[]>
```

Fetch semantic invariant fingerprints for external protocols (Curve, Morpho, Chainlink, vault).

**Returns:** Array of fingerprints with protocol, baseline, tolerance band.

**Example:**
```ts
const fingerprints = await sdk.getExternalProtocolFingerprints(market.id);
fingerprints.forEach(f => {
  console.log(`${f.protocol}: ${f.baseline} ±${f.toleranceBand}`);
});
```

### getAnchorFreshness()

```ts
getAnchorFreshness(): Promise<AnchorFreshness>
```

Fetch indexer anchor freshness status (last anchored block, staleness, emergency mode).

**Returns:** AnchorFreshness with lastAnchoredBlock, isStale, isEmergency flags.

**Example:**
```ts
const anchor = await sdk.getAnchorFreshness();
if (anchor.isEmergency) {
  console.log("Anchor in emergency mode, SDK refusing new actions");
}
```

## Contract Addresses

### sdk.contracts

```ts
readonly contracts: SdkContractAddresses
```

Readonly bundle of canonical contract addresses pinned at SDK construction.

**Fields:**
- `loopRegistry`
- `loopAuthorization`
- `loopForceExitAuthorizer`
- `loopExecutorV2`
- `loopForceExitExecutor`
- `loopAnchorRegistry`
- `loopRiskOracleAdapter`
- `loopFeeRouter`
- `emergencyGuardian`

**Example:**
```ts
const authAddr = sdk.contracts.loopAuthorization;
console.log(`LoopAuthorization: ${authAddr}`);
```

### authorizerNameFor(verifyingContract)

```ts
authorizerNameFor(verifyingContract: Address): AuthorizerName
```

Resolve a verifyingContract address to its canonical name.

**Returns:** "LoopAuthorization" | "LoopForceExitAuthorizer" | "UNRECOGNIZED"

**Example:**
```ts
const name = sdk.authorizerNameFor(contractAddr);
if (name === "UNRECOGNIZED") {
  throw new Error("Phishing attack detected");
}
```

## Incident History

### getIncidentHistory(opts?)

```ts
getIncidentHistory(opts?: {
  fromBlock?: BlockNumber;
  toBlock?: BlockNumber;
  limit?: number;
  finalityThreshold?: number;
}): Promise<IncidentTransition[]>
```

Fetch EmergencyGuardian incident state transitions in reverse chronological order.

**Parameters:**
- `fromBlock` — Start block (default 0n, may exceed RPC range cap)
- `toBlock` — End block (default current head)
- `limit` — Max results (default all)
- `finalityThreshold` — Blocks to consider final (default 10)

**Returns:** Array of IncidentTransition with previousState, state, blockNumber, blockTimestamp, txHash, finality (provisional | finalized).

**Throws:** IncidentReaderUnavailable if emergencyGuardian address is zero.

**Example:**
```ts
const history = await sdk.getIncidentHistory({ limit: 10 });
history.forEach(t => {
  console.log(`${t.previousState} -> ${t.state} at block ${t.blockNumber}`);
});
```

## Exported Utilities

### decodeAcknowledgedRisks(mask)

```ts
decodeAcknowledgedRisks(mask: bigint): DecodedRiskBits[]
```

Decode a FORCE_EXIT risk acknowledgment bitmask into named risk categories.

**Returns:** Array of {name, humanReadable, acknowledged} per set bit.

**Example:**
```ts
const risks = decodeAcknowledgedRisks(policyMask);
risks.forEach(r => {
  if (r.acknowledged) {
    console.log(`${r.name}: ${r.humanReadable}`);
  }
});
```

### decodeMevWaiverBits(mask)

```ts
decodeMevWaiverBits(mask: bigint): DecodedRiskBits[]
```

Decode MEV waiver bits into named waiver categories.

**Returns:** Array of {name, humanReadable, acknowledged}.

## See also

- [Getting Started](./01-getting-started.md) — quickstart examples
- [Action Types](./03-action-types.md) — detailed bounds shapes
- [Recipes](./07-recipes.md) — end-to-end integration patterns
- [Error Registry](./06-errors.md) — handle errors
