# Error Registry

The canonical set of 80+ fail-closed errors. Each error is both a Solidity `error` selector and an SDK enum value with the same name.

## Overview

Errors are grouped by category:

| Category | Count | Examples |
|----------|-------|----------|
| Configuration / Identity | 9 | WrongChain, RegistryVersionMismatch, ExecutorMismatch |
| Authorization / Signing | 12 | InvalidSignature, NonceAlreadyUsed, Eip1271PreimageNotAttested |
| Freshness / Oracle | 7 | QuoteStale, EvidenceStale, OracleStale, SequencerDown |
| RPC / Submission | 3 | RpcQuorumDegraded, MevModeMismatch, RevealTooEarly |
| Liquidity / Route | 6 | CurveLiquidityInsufficient, CurveSlippageExceeded, FlashLiquidityUnavailable |
| Position / Bounds | 11 | HealthFactorBoundFailure, LeverageBoundFailure, DustBoundExceeded |
| Lifecycle / Gates | 9 | AuditGateClosed, PausedAction, IncidentInvestigating |
| Anchor / Registry | 8 | IndexerAnchorStale, AnchorSubmitterOnly, AnchorTooFrequent |
| Evidence Integrity | 4 | EvidenceUnsorted, EvidenceSourceMissing, EvidenceSourceAddressMismatch |
| Automation / Access | 2 | CallerNotAllowed, AutomationAttemptThrottled |

## Using the error registry

### Get canonical errors

```ts
import { getCanonicalErrors } from "@wstdiem/sdk";

const errors = await sdk.getCanonicalErrors();
// Returns all 80 error definitions

const quoteStaleErr = errors.find(e => e.name === "QuoteStale");
console.log(`Selector: 0x${quoteStaleErr.selector.toString(16)}`);
console.log(`Human: ${quoteStaleErr.humanReadable}`);
```

### Decode a revert selector

```ts
import { decodeRevertSelector } from "@wstdiem/sdk";

const returnData = "0x..."; // From a failed transaction
const err = decodeRevertSelector(returnData);

if (err) {
  console.log(`Error: ${err.name}`);
  console.log(`Selector: ${err.selector}`);
  console.log(`Message: ${err.humanReadable}`);
  console.log(`Contract emitted: ${err.contractEmitted}`);
}
```

## Common errors by scenario

### Quote is stale

```ts
try {
  const preview = await sdk.quoteOpen({
    // ... action ...
    deadline: asUnixSeconds(now + 60),
  });
} catch (err) {
  if (err.message?.includes("QuoteStale")) {
    console.log("Quote expired. Refresh and try again.");
    // Call getReadiness() + quoteOpen() again
  }
}
```

**What it means:** The quote was computed too long ago. The exchange rate changed. Call `quoteOpen()` again to get a fresh quote.

### RPC quorum degraded

```ts
const readiness = await sdk.getReadiness(market.id, owner);
if (readiness.perAction.open.error?.name === "RpcQuorumDegraded") {
  console.log("Cannot proceed: not enough healthy RPC providers");
  return;
}
```

**What it means:** Less than the required number of RPC providers are responding or agreeing. Cannot proceed safely. Check RPC configuration and wait for providers to recover.

### Health factor too low

```ts
try {
  const preview = await sdk.quoteRebalance({
    // ... bounds with minHealthFactor = 1.5 ...
  });
} catch (err) {
  if (err.message?.includes("HealthFactorBoundFailure")) {
    console.log("Rebalance would make position unhealthy. Reduce amount.");
  }
}
```

**What it means:** The action would result in a health factor below your specified minimum. Reduce leverage, increase collateral, or repay more debt.

### Curve liquidity insufficient

```ts
if (preview.gateStatuses.some(g => g.error?.name === "CurveLiquidityInsufficient")) {
  console.log("Curve pool does not have enough liquidity for this exit. Try later.");
}
```

**What it means:** Curve cannot fill your order without extreme price impact. Reduce amount or wait for liquidity to improve.

### Evidence missing

```ts
try {
  const auth = await sdk.buildAuthorization(openAction);
} catch (err) {
  if (err.message?.includes("EvidenceSourceMissing")) {
    console.log("Required oracle evidence not available");
    console.log("Cannot sign action without fresh oracle data");
  }
}
```

**What it means:** A required source (oracle, position, route) is missing or stale. The action cannot proceed without it. Check market readiness and try again.

### Audit gate closed

```ts
const readiness = await sdk.getReadiness(market.id);
if (readiness.perAction.open.error?.name === "AuditGateClosed") {
  console.log("Protocol is in early-release mode. External audit pending.");
  console.log("You can still exit existing positions.");
  // Allow only Exit and Revoke actions
}
```

**What it means:** The protocol has not passed external security audit. Production use is gated. Only exit and revoke actions are allowed.

### Action paused

```ts
if (readiness.perAction.open.error?.name === "PausedAction") {
  console.log("Open is currently paused. Only exit is allowed.");
}
```

**What it means:** The EmergencyGuardian has paused this action class. Likely due to a discovered vulnerability being fixed. Only risk-reducing actions (Exit, Revoke) are allowed.

### Incident investigating

```ts
if (readiness.perAction.open.error?.name === "IncidentInvestigating") {
  console.log("Protocol is investigating an incident. New positions blocked.");
  console.log("Check the Evidence screen for incident status.");
}
```

**What it means:** The EmergencyGuardian has declared an incident. The protocol is investigating. Some actions are blocked. Wait for status update.

## Error handling patterns

### Fail-closed default

```ts
async function safeQuote(action: Action): Promise<TransactionPreview | null> {
  try {
    const preview = await sdk.quoteOpen(/* ... */);
    
    // Check all gates pass
    if (!preview.gateStatuses.every(g => g.decision !== "blocked")) {
      console.log("Gates blocking:");
      preview.gateStatuses
        .filter(g => g.decision === "blocked")
        .forEach(g => console.log(`  ${g.name}: ${g.error}`));
      return null; // Fail closed
    }
    
    return preview;
  } catch (err) {
    console.error("Quote failed:", err);
    return null; // Fail closed on any exception
  }
}
```

### Retry logic

```ts
async function quoteWithRetry(
  action: Action,
  maxRetries = 3,
  delayMs = 1000,
): Promise<TransactionPreview> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const preview = await sdk.quoteOpen(/* ... */);
      
      // Check for retriable errors
      const hasRetriableError = preview.gateStatuses.some(g =>
        ["IndexerAnchorStale", "RpcQuorumDegraded", "QuoteStale"].includes(g.error?.name ?? "")
      );
      
      if (!hasRetriableError) {
        return preview;
      }
      
      // Retriable error, wait and retry
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (err) {
      if (err.message?.includes("RpcQuorumDegraded") && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err; // Not retriable
    }
  }
  
  throw new Error("Quote failed after retries");
}
```

### User-facing error messages

```ts
function errorToUserMessage(err: FailClosedErrorName | undefined): string {
  const messages: Record<string, string> = {
    // Operational
    "QuoteStale": "Quote expired. Refresh your preview.",
    "RpcQuorumDegraded": "Network unavailable. Please try again.",
    "IndexerAnchorStale": "Indexer out of sync. Please wait.",
    
    // User action
    "HealthFactorBoundFailure": "This would make your position unsafe. Reduce leverage.",
    "CurveLiquidityInsufficient": "Insufficient liquidity for this amount. Try less.",
    "MevWaiverMissing": "You must enable MEV waiver for public mempool mode.",
    
    // Infrastructure
    "AuditGateClosed": "Protocol is in early release. External audit pending.",
    "PausedAction": "This action is temporarily paused.",
    "IncidentInvestigating": "Protocol is investigating an incident. Check status.",
    
    // Signature
    "InvalidSignature": "Signature is invalid. Please sign again.",
    "NonceAlreadyUsed": "This nonce was already used. Refresh the page.",
    "Eip1271PreimageNotAttested": "Smart wallet requires preimage display.",
  };
  
  return messages[err ?? ""] ?? "Action failed. Please try again.";
}
```

## Canonical error list (by name)

See `sdk/src/errors/registry.ts` or `getCanonicalErrors()` for the complete list with selectors.

Key reference:
- All 80 errors are sourced in the SDK as `FailClosedErrorName` enum
- Solidity selectors are in `sdk/snapshots/abi-selectors.json`
- Contract revert data can be decoded with `decodeRevertSelector()`

## See also

- [API Reference](./02-api-reference.md) — getCanonicalErrors() and decodeRevertSelector()
- [Gate Evaluation](./05-gate-evaluation.md) — error names from gate failures
- [Spec §5.5](../../PROTOCOL.md) — formal error definitions and closure history
- [SDK README](../../sdk/README.md) — error handling deep-dive
