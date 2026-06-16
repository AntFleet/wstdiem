# Gate Evaluation

The six orthogonal post-matrix gates (G-PM-1 through G-PM-6) that control when actions may execute. Per §7.1, these are "fail-closed" gates: when a gate blocks, the action cannot proceed.

## Overview

| Gate | Name | Applies to | Input source |
|------|------|-----------|--------------|
| G-PM-1 | HarvestConvergencePending | Open, LEVERAGE_INCREASE | Registry (harvest event block) |
| G-PM-2 | IndexerAnchorStale | All safety-critical | Indexer anchor check |
| G-PM-3 | RpcQuorumNotIndependent | All safety-critical | RPC provider families |
| G-PM-4 | Eip1271PreimageNotAttested | Open, LEVERAGE_INCREASE (smart wallets) | Caller must supply |
| G-PM-5 | MevWaiverMissing | All (if mev mode requires) | mevWaiverBits in digest |
| G-PM-6 | CallerNotAllowed / AutomationAttemptThrottled | Permissionless / Automation | Registry allow-list + rate limit |

## G-PM-1: HarvestConvergencePending

**Applies to:** Open, LEVERAGE_INCREASE rebalance.

**What it checks:** Blocks new leverage-increasing actions within `harvestCoolingBlocks` of a registry-pinned harvest event.

**Why:** Harvest events change the vault exchange rate suddenly. Opening within the cooling period creates slippage risk that the user did not sign for.

**Input:** Registry-pinned harvest event block + cooling blocks window.

**Decision:**
- ✓ PASS: Current block is outside cooling window
- ✗ BLOCK: Current block is within cooling window → error: `HarvestConvergencePending`

**SDK evaluation:**
```ts
const g1 = evaluatePostMatrixGates({
  g1: {
    primaryType: "Open",
    blockNumber: currentBlock,
    lastHarvestBlock: lastHarvestBlock,
    harvestCoolingBlocks: 100n, // Registry value
  },
});
```

## G-PM-2: IndexerAnchorStale

**Applies to:** All actions (SDK-enforced before signing).

**What it checks:** The indexer's `StateSnapshotAccepted` anchor is fresh (within `anchorMaxStaleBlocks`).

**Why:** Stale anchor means the indexer is lagged behind chain reality. Cannot trust the evidence.

**Input:** Last anchored block from `LoopAnchorRegistry`.

**Decision:**
- ✓ PASS: Anchor block is ≤ `anchorMaxStaleBlocks` behind current head
- ✗ BLOCK: Anchor is stale → error: `IndexerAnchorStale`
- ⚠ EMERGENCY: Anchor is > `anchorMaxStaleBlocks × anchorEmergencyMultiplier` old → SDK refuses all new actions

**SDK enforcement:**
```ts
const anchor = await sdk.getAnchorFreshness();
if (anchor.isEmergency) {
  console.log("Anchor stale in emergency mode, SDK refusing all new actions");
}
```

The SDK short-circuits and returns `gateStatuses: [{name: "IndexerAnchorStale", decision: "blocked"}]` before attempting any other checks.

## G-PM-3: RpcQuorumNotIndependent

**Applies to:** All safety-critical reads (SDK-enforced before signing).

**What it checks:** RPC quorum members come from ≥2 distinct provider families.

**Why:** Per §5.6, a 2-of-3 quorum all from the same vendor (e.g., three Alchemy regions) is still single-provider and fails closed.

**Input:** Configured RPC clients with `providerFamily` tags.

**Decision:**
- ✓ PASS: Quorum majority comes from ≥2 distinct families
- ✗ BLOCK: All quorum members are same family → error: `RpcQuorumNotIndependent`

**SDK enforcement:**
```ts
const sdk = createSdk({
  publicClients: [
    { client: alchemyClient, providerFamily: "alchemy" },
    { client: quicknodeClient, providerFamily: "quicknode" },
    { client: selfHostedClient, providerFamily: "self_hosted_base_node" },
  ],
  publicClientThreshold: 2, // 2-of-3 must agree
  // Must be from ≥2 distinct families
});
```

If quorum is degraded or family set is insufficient, `getReadiness` returns fully-blocked results before executing action-level checks.

## G-PM-4: Eip1271PreimageNotAttested

**Applies to:** Open, LEVERAGE_INCREASE rebalance; **only for smart-wallet signers** (EIP-1271).

**What it checks:** For high-risk actions signed by a smart wallet, the user must have displayed and acknowledged the full action details (preimage).

**Why:** Smart wallet signers (Safe, Coinbase Smart Wallet) can hide action parameters in the wallet UI. Attestation proves the user saw the preimage.

**Input:** Caller must supply `preimageProof` or set `signerOnAllowList: true`.

**Decision:**
- ✓ PASS: EOA signer (no EIP-1271)
- ✓ PASS: Smart wallet signer with `preimageProof` (user attested)
- ✓ PASS: Smart wallet signer on high-trust allow-list
- ✗ BLOCK: Smart wallet signer without preimage → error: `Eip1271PreimageNotAttested`

**SDK evaluation:**
```ts
const g4 = evaluatePostMatrixGates({
  g4: {
    primaryType: "Open",
    signerOnAllowList: false, // Does signer wallet have preimage attestation?
    preimageProof: preimageAttestationFromWallet, // User display proof
  },
});
```

The app must surface the preimage before allowing user to sign high-risk actions from smart wallets (see the app design for preimage display screens).

## G-PM-5: MevWaiverMissing

**Applies to:** All actions (when mev protection is not at default).

**What it checks:** When mevProtectionMode is not PRIVATE_BUILDER, user must set the corresponding waiver bit in the digest.

**Why:** Private Builder is the safest MEV mode (hidden until execution). Public Mempool or other modes expose the tx to front-running. User must explicitly acknowledge this.

**Input:** `mevProtectionMode` (from bounds) + `mevWaiverBits` (from acknowledgmentBits).

**Decision:**
- ✓ PASS: mevProtectionMode = PRIVATE_BUILDER (no waiver needed)
- ✓ PASS: mevProtectionMode ≠ PRIVATE_BUILDER AND corresponding bit is set in mevWaiverBits
- ✗ BLOCK: mevProtectionMode ≠ PRIVATE_BUILDER AND bit is NOT set → error: `MevWaiverMissing`

**SDK evaluation:**
```ts
const g5 = evaluatePostMatrixGates({
  g5: {
    signedMode: openAction.mevProtectionMode,
    observedChannel: "PRIVATE_BUILDER", // What the builder actually provides
    signedWaiverBits: openAction.acknowledgmentBits,
    builderKeyAvailable: builderIsHealthy,
  },
});
// If signedMode == PUBLIC_MEMPOOL but waiver bit not in acknowledgmentBits, blocks
```

**Waiver bits:** One bit per MEV mode. Defined in `@wstdiem/sdk` as `MevWaiverBits` enum.

## G-PM-6: CallerNotAllowed / AutomationAttemptThrottled

**Applies to:** Permissionless / Automation executions.

**What it checks:**
- For permissionless execution: caller must be on the registry-pinned allow-list (AC-17 Phase 1 restriction).
- For automation: per-policy failed-attempt rate-limit (I-72).

**Why:** Phase 1 gates permissionless execution to a trusted set (prevents griefing). Automation rate-limits failed attempts.

**Input:** Caller address + registry allow-list; or policy ID + failure history.

**Decision (permissionless):**
- ✓ PASS: Caller is on allow-list
- ✗ BLOCK: Caller not on list → error: `CallerNotAllowed`

**Decision (automation):**
- ✓ PASS: Policy has not exceeded failed-attempt rate limit
- ✗ BLOCK: Rate limit exceeded → error: `AutomationAttemptThrottled`

**SDK evaluation:**
```ts
const g6_permissionless = evaluatePostMatrixGates({
  g6: {
    callerAddress: permissionlessCaller,
    allowListAddresses: allowList, // From registry
  },
});

const g6_automation = evaluatePostMatrixGates({
  g6: {
    policyId,
    recentFailureCount,
    failureRateThreshold,
  },
});
```

## Using gate evaluation in integration

```ts
import { evaluatePostMatrixGates, gatesAllPass } from "@wstdiem/sdk";

// When quoting or previewing an action:
const preview = await sdk.quoteOpen({
  owner: "0x...",
  market: marketId,
  primaryType: "Open",
  bounds: { /* ... */ },
  // ... other fields ...
});

// Check if gates pass
const allPass = preview.gateStatuses.every(g => g.decision !== "blocked");
if (!allPass) {
  console.log("Gates blocking, cannot sign:");
  preview.gateStatuses.forEach(g => {
    if (g.decision === "blocked") {
      console.log(`  ${g.name}: ${g.error}`);
    }
  });
  return; // Don't sign
}

// Safe to sign and broadcast
const auth = await sdk.buildAuthorization(action);
```

## Gate status structure

```ts
interface GateStatus {
  name: string;                    // "HarvestConvergencePending" etc.
  decision: "pass" | "blocked" | "notApplicable";
  error?: FailClosedErrorName;     // Error name if blocked
  details?: string;                // Human-readable reason
}
```

When gates are not applicable (e.g., G-PM-1 on an Exit action), they return `notApplicable`.

## See also

- [Spec §7.1](../../PROTOCOL.md) — formal gate specifications
- [API Reference](./02-api-reference.md) — gateStatuses in TransactionPreview
- [Error Registry](./06-errors.md) — canonical error names

