# Recipes

Common integration patterns end-to-end.

## Recipe 1: Open a loop position

Complete flow from user input to transaction confirmation.

```ts
import { createSdk, asChainId, asMarketId } from "@wstdiem/sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// 1. Set up SDK
const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

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
});

// 2. Get markets
const markets = await sdk.getMarkets();
const market = markets[0];

// 3. Build action from user input
const userInput = {
  owner: "0x1234...",
  wstDiemAmount: 100n * 10n ** 18n,
  leverageMultiple: 3n,
  maxSlippageBps: 100n, // 1%
  deadline: Math.floor(Date.now() / 1000) + 60,
};

const openAction = {
  owner: userInput.owner,
  market: market.id,
  primaryType: "Open",
  bounds: {
    minWstDiemReceived: (userInput.wstDiemAmount * 99n) / 100n,
    minBorrowedDiem: 0n,
    maxBorrowedDiem: userInput.wstDiemAmount * userInput.leverageMultiple,
    maxSlippageBps: userInput.maxSlippageBps,
    maxPriceImpactBps: 50n,
    maxLeverageBps: userInput.leverageMultiple * 1000n,
    minHealthFactor: 1500n, // 1.5
    minLiquidationDistanceBps: 2000n,
    maxMorphoUtilizationImpactBps: 200n,
    deadline: asUnixSeconds(userInput.deadline),
  },
  chainId: asChainId(8453),
  nonce: { slotIndex: 0n, bitIndex: 0n },
  mevProtectionMode: "PRIVATE_BUILDER",
  acknowledgmentBits: 0n,
};

// 4. Get quote
const preview = await sdk.quoteOpen({
  owner: openAction.owner,
  market: openAction.market,
  primaryType: "Open",
  bounds: openAction.bounds,
  chainId: openAction.chainId,
  nonce: openAction.nonce,
  mevProtectionMode: openAction.mevProtectionMode,
  acknowledgmentBits: openAction.acknowledgmentBits,
});

// 5. Check gates
if (!preview.gateStatuses.every(g => g.decision !== "blocked")) {
  console.error("Gates blocking. Cannot sign.");
  throw new Error("Action blocked by gates");
}

// 6. Build authorization for signing
const auth = await sdk.buildAuthorization(openAction);

// 7. Request signature from wallet
const signature = await window.ethereum.request({
  method: "eth_signTypedData_v4",
  params: [userInput.owner, JSON.stringify(auth.typedData)],
});

// 8. Attach signature to calldata
const tx = await sdk.attachSignature(
  openAction,
  signature,
  auth.digest,
);

// 9. Broadcast to network
const hash = await publicClient.sendTransaction({
  account: userInput.owner,
  to: tx.to,
  data: tx.data,
  value: tx.value,
});

// 10. Wait for confirmation
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`Position opened in block ${receipt.blockNumber}`);
```

## Recipe 2: Check position health and monitor

Real-time monitoring of position risk.

```ts
// Monitor position health factor and liquidation distance
function subscribeToPosition(owner: Address, market: MarketId) {
  let lastHealth = 0n;

  const unsubscribe = sdk.subscribePosition(owner, market, async (risk) => {
    console.log(`Block ${risk.blockNumber}:`);
    console.log(`  Health: ${risk.healthFactorWad}`);
    console.log(`  Leverage: ${risk.leverageBps}`);
    console.log(`  Liquidation distance: ${risk.liquidationDistanceBps}`);

    // Alert if health is degrading
    if (risk.healthFactorWad < 1500n && lastHealth >= 1500n) {
      console.warn("⚠ Health factor dropped below 1.5");
    }

    // Critical alert if liquidation is near
    if (risk.liquidationDistanceBps < 1000n) {
      console.error("🚨 CRITICAL: Liquidation distance below 10%");
    }

    lastHealth = risk.healthFactorWad;
  });

  return unsubscribe;
}

// Usage
const unsub = subscribeToPosition(ownerAddress, marketId);
// ... later ...
unsub(); // Stop monitoring
```

## Recipe 3: Rebalance to reduce leverage

Delever when health factor is low.

```ts
async function deleveragePosition(
  owner: Address,
  market: MarketId,
  targetHealthFactor: bigint,
) {
  // 1. Get current position
  const risk = await sdk.getPositionRisk(market, owner);
  
  if (risk.healthFactorWad > targetHealthFactor) {
    console.log("Already healthy, no rebalance needed");
    return;
  }

  // 2. Build deleverage rebalance (repay only)
  const rebalanceAction = {
    owner,
    market,
    primaryType: "Rebalance",
    bounds: {
      maxDebtIncrease: 0n, // Not borrowing more
      maxCollateralSold: 10n * 10n ** 18n, // Withdraw up to 10 wstDIEM
      maxSlippageBps: 100n,
      maxPriceImpactBps: 50n,
      minHealthFactor: targetHealthFactor,
      minLiquidationDistanceBps: 1500n,
      maxMorphoUtilizationImpactBps: 200n,
      deadline: asUnixSeconds(Math.floor(Date.now() / 1000) + 60),
    },
    chainId: asChainId(8453),
    nonce: { slotIndex: 0n, bitIndex: 0n },
    mevProtectionMode: "PRIVATE_BUILDER",
    acknowledgmentBits: 0n,
  };

  // 3. Quote and sign
  const preview = await sdk.quoteRebalance({
    owner: rebalanceAction.owner,
    market: rebalanceAction.market,
    primaryType: "Rebalance",
    bounds: rebalanceAction.bounds,
    chainId: rebalanceAction.chainId,
    nonce: rebalanceAction.nonce,
    mevProtectionMode: rebalanceAction.mevProtectionMode,
    acknowledgmentBits: rebalanceAction.acknowledgmentBits,
  });

  const auth = await sdk.buildAuthorization(rebalanceAction);
  const signature = await wallet.sign(auth.typedData);
  const tx = await sdk.attachSignature(rebalanceAction, signature, auth.digest);

  // 4. Broadcast
  const hash = await publicClient.sendTransaction({
    account: owner,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Rebalance confirmed: ${receipt.transactionHash}`);
}
```

## Recipe 4: Decode events from transaction

Parse loop events from transaction receipt.

```ts
async function processLoopEvents(receipt: TransactionReceipt) {
  const events = [];

  for (const log of receipt.logs) {
    try {
      const event = await sdk.decodeLoopEvent({
        address: log.address,
        topics: log.topics,
        data: log.data,
      });

      if (event) {
        events.push(event);
        console.log(`Event: ${event.type}`, event);
      }
    } catch (err) {
      // Ignore logs that don't decode (not loop events)
    }
  }

  // Find the main action completion event
  const completed = events.find(e => e.type === "LoopActionCompleted");
  if (completed) {
    console.log(`Action digest: ${completed.actionId}`);
  }

  return events;
}

// Usage
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const events = await processLoopEvents(receipt);
```

## Recipe 5: Exit a position

Close position and receive back DIEM.

```ts
async function exitPosition(owner: Address, market: MarketId) {
  // 1. Get quote
  const exitAction = {
    owner,
    market,
    primaryType: "Exit",
    bounds: {
      minDiemReturned: 0n, // Don't enforce minimum on exit
      minHealthFactor: 0n, // N/A when exiting
      minLiquidationDistanceBps: 0n,
      maxSlippageBps: 200n,
      maxPriceImpactBps: 100n,
      maxMorphoUtilizationImpactBps: 200n,
      deadline: asUnixSeconds(Math.floor(Date.now() / 1000) + 60),
    },
    routeKind: "CURVE",
    chainId: asChainId(8453),
    nonce: { slotIndex: 1n, bitIndex: 0n },
    mevProtectionMode: "PRIVATE_BUILDER",
    acknowledgmentBits: 0n,
  };

  const preview = await sdk.quoteExit({
    owner: exitAction.owner,
    market: exitAction.market,
    primaryType: "Exit",
    bounds: exitAction.bounds,
    routeKind: exitAction.routeKind,
    chainId: exitAction.chainId,
    nonce: exitAction.nonce,
    mevProtectionMode: exitAction.mevProtectionMode,
    acknowledgmentBits: exitAction.acknowledgmentBits,
  });

  console.log(`You will receive: ${preview.readinessResult.diem} DIEM`);

  // 2. Sign
  const auth = await sdk.buildAuthorization(exitAction);
  const signature = await wallet.sign(auth.typedData);
  const tx = await sdk.attachSignature(exitAction, signature, auth.digest);

  // 3. Broadcast
  const hash = await publicClient.sendTransaction({
    account: owner,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const events = await processLoopEvents(receipt);
  
  const exited = events.find(e => e.type === "LoopExitedV2");
  if (exited) {
    console.log(`Exit confirmed. DIEM received: ${exited.diem}`);
  }
}
```

## Recipe 6: Check readiness before signing

Verify market state and action eligibility before proceeding.

```ts
async function checkBeforeSigning(
  owner: Address,
  market: MarketId,
  primaryType: string,
): Promise<boolean> {
  const readiness = await sdk.getReadiness(market, owner);

  console.log(`State bitmap: 0x${readiness.stateBitmap.toString(16)}`);

  const decision = readiness.perAction[primaryType.toLowerCase()];
  if (!decision) {
    console.error(`No decision for ${primaryType}`);
    return false;
  }

  if (decision.decision === "blocked") {
    console.error(`${primaryType} is blocked:`, decision.error);
    return false;
  }

  if (decision.decision === "notApplicable") {
    console.warn(`${primaryType} is not applicable in current state`);
    return false;
  }

  console.log(`✓ ${primaryType} is allowed`);

  // Check gate statuses
  const blockedGates = readiness.gateStatuses.filter(g => g.decision === "blocked");
  if (blockedGates.length > 0) {
    console.error("Gates blocking:");
    blockedGates.forEach(g => console.error(`  ${g.name}: ${g.error}`));
    return false;
  }

  return true;
}

// Usage
const canSign = await checkBeforeSigning(owner, market.id, "Open");
if (canSign) {
  // Proceed with quote and signature
}
```

## Recipe 7: Error handling and recovery

Graceful error handling with retry logic.

```ts
async function safeQuoteWithRetry(
  action: Action,
  maxRetries = 3,
): Promise<TransactionPreview> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Quote attempt ${attempt}...`);
      
      const preview = await sdk.quoteOpen({
        owner: action.owner,
        market: action.market,
        primaryType: "Open",
        bounds: action.bounds,
        chainId: action.chainId,
        nonce: action.nonce,
        mevProtectionMode: action.mevProtectionMode,
        acknowledgmentBits: action.acknowledgmentBits,
      });

      // Check for non-retriable gate failures
      const blockedGates = preview.gateStatuses.filter(
        g => g.decision === "blocked" && !isRetriable(g.error?.name)
      );
      
      if (blockedGates.length > 0) {
        throw new Error(`Non-retriable gate failure: ${blockedGates[0].error}`);
      }

      return preview;
    } catch (err) {
      const errorName = extractErrorName(err);
      
      if (!isRetriable(errorName)) {
        throw err; // Give up immediately on non-retriable errors
      }

      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts: ${errorName}`);
      }

      // Wait before retry (exponential backoff)
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function isRetriable(errorName?: string): boolean {
  const retriable = [
    "QuoteStale",
    "RpcQuorumDegraded",
    "IndexerAnchorStale",
  ];
  return retriable.includes(errorName ?? "");
}

function extractErrorName(err: unknown): string {
  if (err instanceof Error) {
    return err.message.split(":")[0];
  }
  return "Unknown";
}
```

## See also

- [Getting Started](./01-getting-started.md) — basic SDK setup
- [API Reference](./02-api-reference.md) — all available methods
- [Error Registry](./06-errors.md) — handling error conditions
