# Migration Guide

This document covers the SDK surface changes between the previous release and v0.1.0-rc1.

This release closes five SDK surface gaps from the previous release to achieve production parity with the SDK type definitions / §6.4 / §6.5 / §7.1 / §11 of the protocol spec.

## What changed

### Gap 1: `attachSignature` on WstdiemSdk interface

**Before:**
```ts
// Could only build unsigned calldata, then splice signature manually
const tx = await sdk.buildTransaction(action);
const signature = await wallet.sign(action);
// ... manually re-run assembly with signature ...
const calldata = encodeSignature(tx.data, signature);
```

**After:**
```ts
// Call buildTransaction once, sign in wallet, then attachSignature
const tx = await sdk.buildTransaction(action);
const signature = await wallet.sign(auth.digest);

const signedTx = await sdk.attachSignature(
  action,
  signature,
  auth.digest, // Optional: verify signature matches expected digest
  { pinnedBlockNumber: tx.blockNumber }, // Optional: pin quotes/evidence to same block
);
```

**Why:** `attachSignature` handles the digest recomputation to catch quote drift between signing and broadcast. It pins evidence and quotes to a specific block so chain advancement doesn't cause spurious `QuoteDrift` errors.

**Migration:**
1. Keep `buildTransaction` as-is
2. Replace manual signature splicing with `sdk.attachSignature(action, sig, expectedDigest, opts)`
3. Pass `expectedDigest` to verify the signature matches (throws `QuoteDrift` on mismatch)

### Gap 2: `gateStatuses` populated on ReadinessResult and TransactionPreview

**Before:**
```ts
// Gates were computed synthetically on the frontend
const readiness = await sdk.getReadiness(market.id, owner);
// readiness.gateStatuses was empty []
// App had to re-compute G-PM-1..6 manually in useGpmGates.ts
```

**After:**
```ts
const readiness = await sdk.getReadiness(market.id, owner);
readiness.gateStatuses.forEach(g => {
  console.log(`${g.name}: ${g.decision} ${g.error ?? ""}`);
});

const preview = await sdk.quoteOpen({ /* ... */ });
// preview.gateStatuses also populated with G-PM-1..6
```

**Why:** Gates are now wired through `evaluatePostMatrixGates` and populated by every `quote*`, `previewTransaction`, and `getReadiness` call.

**Migration:**
1. Remove manual gate computation from your frontend code
2. Use `readiness.gateStatuses` and `preview.gateStatuses` directly
3. Check `g.decision === "blocked"` to block signing

### Gap 3: `sdk.contracts` + `authorizerNameFor()`

**Before:**
```ts
// App read contract addresses from env directly
const authAddr = process.env.VITE_LOOP_AUTHORIZATION;
const forceExitAuthAddr = process.env.VITE_LOOP_FORCE_EXIT_AUTHORIZER;

// No easy way to resolve a verifyingContract address to its canonical name
```

**After:**
```ts
// Canonical addresses pinned at SDK construction
const authAddr = sdk.contracts.loopAuthorization;
const forceExitAuthAddr = sdk.contracts.loopForceExitAuthorizer;

// Resolve any verifyingContract address to its canonical name
const name = sdk.authorizerNameFor(contractAddr);
// Returns: "LoopAuthorization" | "LoopForceExitAuthorizer" | "UNRECOGNIZED"
```

**Why:** Centralizes contract address configuration in the SDK. Enables phishing-resistance: the C-1 banner checks if wallet's signing dialog address matches the SDK-pinned contract name (detects address substitution attacks).

**Migration:**
1. Move contract address configuration into SDK `createSdk({ contracts: { ... } })`
2. Replace env-based reads (`VITE_LOOP_AUTHORIZATION`) with `sdk.contracts.loopAuthorization`
3. Use `sdk.authorizerNameFor()` to resolve addresses in signing banners

### Gap 4: `getIncidentHistory()`

**Before:**
```ts
// No method to read incident history
// App placeholder just said "Check Evidence" with no actual implementation
```

**After:**
```ts
const history = await sdk.getIncidentHistory({
  limit: 10,
  finalityThreshold: 10, // Blocks before marking as finalized
});

history.forEach(transition => {
  console.log(`${transition.previousState} -> ${transition.state}`);
  console.log(`Block: ${transition.blockNumber}, Finality: ${transition.finality}`);
});
```

**Why:** D.5 Evidence screen now displays actual incident transitions. Reads `EmergencyGuardian.IncidentStateChanged` events in reverse chronological order.

**Migration:**
1. Replace Evidence screen placeholder with `sdk.getIncidentHistory()`
2. Display state transitions in reverse chronological order
3. Flag provisional transitions (< finalityThreshold blocks old) with a ⚠ badge

### Gap 5: Policy risk acknowledgment decoders

**Before:**
```ts
// App had duplicate risk-bit registry in app/src/lib/risk-bits.ts
// SDK did not expose the canonical mapping
```

**After:**
```ts
import { decodeAcknowledgedRisks, decodeMevWaiverBits } from "@wstdiem/sdk";

// When rendering Force Exit policies:
const policies = await sdk.getAutomationPolicies(owner);
const forceExitPolicies = policies.filter(p => p.actionClass === "FORCE_EXIT");

forceExitPolicies.forEach(policy => {
  if (policy.acknowledgedRisks) {
    const risks = decodeAcknowledgedRisks(policy.acknowledgedRisks);
    risks.forEach(risk => {
      if (risk.acknowledged) {
        console.log(`✓ ${risk.name}: ${risk.humanReadable}`);
      }
    });
  }
});

// MEV waiver bits
const waiverBits = decodeM evWaiverBits(policy.mevWaiverBits);
```

**Why:** Canonical source of truth for risk and waiver bit names. Replaces the app's duplicate registry.

**Migration:**
1. Remove `app/src/lib/risk-bits.ts` (or mark as deprecated)
2. Replace all imports with `import { decodeAcknowledgedRisks, decodeMevWaiverBits } from "@wstdiem/sdk"`
3. Call decoders on policy masks instead of looking up values locally

## New in this release

### `TransactionPreview.gateStatuses`

Every quote (`quoteOpen`, `quoteRebalance`, `quoteExit`, `quoteForceExit`) returns:

```ts
interface TransactionPreview {
  // ... existing fields ...
  gateStatuses: GateStatus[]; // Now populated with G-PM-1..6
}

interface GateStatus {
  name: string; // "HarvestConvergencePending" | "IndexerAnchorStale" | ...
  decision: "pass" | "blocked" | "notApplicable";
  error?: FailClosedErrorName;
  details?: string;
}
```

### `ReadinessResult.gateStatuses`

`getReadiness()` also returns populated gates:

```ts
interface ReadinessResult {
  // ... existing fields ...
  gateStatuses: GateStatus[]; // Now populated
}
```

### `sdk.contracts`

Readonly contract addresses:

```ts
interface SdkContractAddresses {
  readonly loopRegistry: Address;
  readonly loopAuthorization: Address;
  readonly loopForceExitAuthorizer: Address;
  readonly loopExecutorV2: Address;
  readonly loopForceExitExecutor: Address;
  readonly loopAnchorRegistry: Address;
  readonly loopRiskOracleAdapter: Address;
  readonly loopFeeRouter: Address;
  readonly emergencyGuardian: Address;
}
```

### `Policy.acknowledgedRisks`

Optional field on FORCE_EXIT policies:

```ts
interface Policy {
  // ... existing fields ...
  acknowledgedRisks?: number; // Bitmask of acknowledged risks (Force Exit only)
}
```

### Error registry additions

New canonical errors:
- `ContractsConfigInvalid` — constructor zero-address check failed
- `IncidentReaderUnavailable` — emergencyGuardian address is zero when `getIncidentHistory()` is called

## Breaking changes

**None in the public interface.** All changes are additive:
- New methods: `attachSignature`, `getIncidentHistory`
- New readonly field: `contracts`
- New synchronous method: `authorizerNameFor()`
- New exported utilities: `decodeAcknowledgedRisks`, `decodeMevWaiverBits`
- Populated fields: `gateStatuses` on ReadinessResult and TransactionPreview (was empty before)
- New optional field: `acknowledgedRisks` on Policy

Existing code continues to work. Remove deprecated workarounds at your own pace.

## Recommended migration order

1. **Phase 1 (non-blocking):** Replace env-based contract reads with `sdk.contracts`
2. **Phase 2 (non-blocking):** Remove frontend gate computation; use `readiness.gateStatuses` and `preview.gateStatuses`
3. **Phase 3 (recommended):** Add `attachSignature` call between signing and broadcast to catch quote drift
4. **Phase 4 (non-blocking):** Implement Evidence screen with `getIncidentHistory()`
5. **Phase 5 (non-blocking):** Replace risk-bits registry with `decodeAcknowledgedRisks` + `decodeMevWaiverBits`

All phases are independently deployable. No coordination needed.

## Testing

Regression test suite:
- SDK vitest: `npm run test` from /sdk — 292/292 tests passing
- App vitest: `npm run test` from /app — 111/111 tests passing
- No SDK or app code changes required for existing consumers (gaps were additive)

## See also


- [API Reference](./02-api-reference.md) — new methods and changes
- [Getting Started](./01-getting-started.md) — updated examples
