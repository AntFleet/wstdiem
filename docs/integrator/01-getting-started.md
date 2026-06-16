# Getting Started

This guide takes you from zero to a working SDK integration in 5 minutes.

## Install the SDK

```bash
npm install @wstdiem/sdk viem
```

The SDK is isomorphic and runs in Node 20+ or browser. No build-time setup needed.

## Create the SDK

```ts
import { createSdk, asChainId } from "@wstdiem/sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// Create a viem PublicClient pointed at Base mainnet
const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// Create the SDK
const sdk = createSdk({
  // Chain ID (8453 for Base mainnet)
  chainId: asChainId(8453),
  
  // Public client for RPC reads
  publicClient,
  
  // Indexer URL (MVP stage)
  indexerBaseUrl: "https://indexer.your-host.test",
  
  // Contract addresses (pinned at construction time)
  contracts: {
    loopRegistry: "0xabcd1234...",
    loopAuthorization: "0xabcd1234...",
    loopForceExitAuthorizer: "0xabcd1234...",
    loopExecutorV2: "0xabcd1234...",
    loopForceExitExecutor: "0xabcd1234...",
    loopAnchorRegistry: "0xabcd1234...",
    loopRiskOracleAdapter: "0xabcd1234...",
    loopFeeRouter: "0xabcd1234...",
    emergencyGuardian: "0xabcd1234...",
  },
});
```

## Hello world: Fetch markets

```ts
const markets = await sdk.getMarkets();

markets.forEach((market) => {
  console.log(`Market: ${market.id}`);
  console.log(`Exchange rate: ${market.exchangeRate}`);
  console.log(`Spread: ${market.estimatedYieldSpreadBps} bps`);
});
```

## Build an Open action

```ts
import {
  asMarketId,
  asBasisPoints,
  asBlockNumber,
  asUnixSeconds,
  type OpenAction,
} from "@wstdiem/sdk";

const now = Math.floor(Date.now() / 1000);

const openAction: OpenAction = {
  owner: "0x1234..." as Address,
  market: asMarketId(markets[0].id),
  
  // Bounds (parsed from user input)
  bounds: {
    minWstDiemReceived: 90n, // 90% minimum received
    minBorrowedDiem: 100n * 10n ** 18n,
    maxBorrowedDiem: 200n * 10n ** 18n,
    maxSlippageBps: asBasisPoints(100), // 1% max slippage
    maxPriceImpactBps: asBasisPoints(50), // 0.5% max price impact
    maxLeverageBps: asBasisPoints(500), // 5x max leverage
    minHealthFactor: 1500n, // 1.5 minimum health
    minLiquidationDistanceBps: asBasisPoints(2000), // 20% min distance to liquidation
    maxMorphoUtilizationImpactBps: asBasisPoints(200), // 2% max impact on Morpho utilization
    deadline: asUnixSeconds(now + 60), // Expires in 60 seconds
  },

  // Metadata
  chainId: asChainId(8453),
  nonce: { slotIndex: 0n, bitIndex: 0n },
  mevProtectionMode: "PRIVATE_BUILDER",
  acknowledgmentBits: 0n,
};
```

## Get a quote

```ts
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

console.log(`You will borrow: ${preview.calldata}`);
console.log(`Health factor: ${preview.readinessResult.healthFactorWad}`);
console.log(`Gates: `, preview.gateStatuses);
```

## Check gate statuses

```ts
const { gateStatuses } = preview;

gateStatuses.forEach((gate) => {
  console.log(`${gate.name}: ${gate.decision}`);
  if (gate.decision === "blocked") {
    console.log(`  Reason: ${gate.error}`);
  }
});

// All must pass before signing
if (!gateStatuses.every((g) => g.decision !== "blocked")) {
  throw new Error("Gates not passing, cannot sign");
}
```

## Build authorization for signing

```ts
const auth = await sdk.buildAuthorization(openAction);

console.log(`Digest: ${auth.digest}`);
console.log(`Typed data for wallet:`, auth.typedData);
console.log(`Evidence:`, auth.evidence);
```

The wallet signs `auth.typedData` (EIP-712 message). The signature proves the user authorized this exact action.

## Sign with wallet (pseudocode)

```ts
// In a browser/wallet context:
const signature = await window.ethereum.request({
  method: "eth_signTypedData_v4",
  params: [
    userAddress,
    JSON.stringify(auth.typedData),
  ],
});
```

In a real app, use a wallet library like ConnectKit (what the canonical app uses) or wagmi.

## Build transaction with signature

```ts
const tx = await sdk.attachSignature(
  openAction,
  signature,
  auth.digest, // Optional: verify signature matches expected digest
);

console.log(`To: ${tx.to}`);
console.log(`Data: ${tx.data}`);
console.log(`Value: ${tx.value}`);
```

This returns the executor calldata ready to broadcast.

## Broadcast (pseudocode)

```ts
const hash = await publicClient.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: tx.value,
  account: userAddress,
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
```

## Decode events

After the transaction lands:

```ts
const logs = receipt.logs;

logs.forEach(async (log) => {
  const event = await sdk.decodeLoopEvent(log);
  console.log(`Event:`, event);
});
```

## Check position after open

```ts
const risk = await sdk.getPositionRisk(
  markets[0].id,
  userAddress,
);

console.log(`Health factor: ${risk.healthFactorWad}`);
console.log(`Leverage: ${risk.leverageBps}`);
console.log(`Liquidation distance: ${risk.liquidationDistanceBps}`);
```

## Readiness and state matrix

```ts
const readiness = await sdk.getReadiness(
  markets[0].id,
  userAddress,
);

console.log(`State bitmap: ${readiness.stateBitmap}`);
console.log(`Per-action decisions:`, readiness.perAction);

// Check if open is allowed
const openDecision = readiness.perAction.open;
console.log(`Open allowed: ${openDecision.decision}`);
if (openDecision.decision === "blocked") {
  console.log(`  Reason: ${openDecision.error}`);
}
```

## Error handling

```ts
try {
  await sdk.quoteOpen({ /* ... */ });
} catch (err) {
  if (err instanceof Error && err.message.includes("QuoteStale")) {
    console.log("Quote expired, refresh");
  } else if (err instanceof Error && err.message.includes("RpcQuorumDegraded")) {
    console.log("RPC quorum is degraded, cannot proceed");
  } else {
    console.log("Unknown error:", err);
  }
}
```

See [Error Registry](./06-errors.md) for the full canonical error set.

## Security model

### RPC Quorum (fail-closed default)

By default, the SDK requires multiple distinct RPC providers for safety-critical reads:

```ts
const sdk = createSdk({
  publicClients: [
    createPublicClient({
      chain: base,
      transport: http("https://alchemy.base.org"),
    }),
    createPublicClient({
      chain: base,
      transport: http("https://quick.base.org"),
    }),
  ],
  publicClientThreshold: 2, // Require 2-of-2 agreement
});
```

If you cannot provide a quorum, explicitly opt in to single-client reads:

```ts
const sdk = createSdk({
  publicClient,
  allowSingleClientReads: true, // Acknowledge the risk
});
```

### Indexer signature verification

The SDK validates indexer responses against a registry-pinned signing key:

```ts
const sdk = createSdk({
  indexerSigningKey: "0x...", // Public key
  indexerVerifier: recoverMessageAddress, // viem function
});
```

The indexer is configured with the corresponding private key and signs every response.

### Evidence resolver

For actions that require evidence (e.g., opening requires oracle price), supply an evidence resolver:

```ts
const sdk = createSdk({
  evidenceResolver: {
    resolveEvidence: async (action) => {
      // Fetch oracle price, route, position evidence from your sources
      return {
        sources: [
          {
            sourceId: "morpho-position",
            sourceAddress: contractAddress,
            status: "fresh",
            lastUpdateBlock: blockNumber,
            valueHash: keccak256("..."),
          },
          // ... more sources per action type ...
        ],
      };
    },
  },
});
```

If no resolver is supplied and evidence is required, the SDK throws.

## Configuration defaults

```ts
interface SdkConfig {
  chainId: ChainId;
  publicClient: PublicClient; // Required for reads
  publicClients?: PublicClient[]; // Optional multi-client quorum
  publicClientThreshold?: number; // Default: publicClients.length (all must agree)
  allowSingleClientReads?: boolean; // Default: false (fail-closed)
  
  indexerBaseUrl: string; // Required
  indexerSigningKey?: Hex; // Optional (if not supplied, no signature verification)
  indexerVerifier?: VerifyFn; // Optional (default: viem recoverMessageAddress)
  
  contracts: SdkContractAddresses; // All 9 addresses required
  
  evidenceResolver?: EvidenceResolver; // Optional (required if actions need evidence)
  
  initialMarkets?: Market[]; // Optional bootstrap (overridden by getMarkets)
  
  positionPollIntervalMs?: number; // Default: 12000ms (Base block time)
}
```

## See also

- [API Reference](./02-api-reference.md) — every method signature
- [Recipes](./07-recipes.md) — complete working examples
- [Error Registry](./06-errors.md) — handle errors gracefully
- [SDK README](../../sdk/README.md) — architecture and security deep-dive
