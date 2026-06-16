# Setup

RPC quorum configuration, indexer setup, and environment variables for keeper deployment.

## RPC quorum requirements

Per §5.6, keepers must use a multi-RPC quorum with distinct provider families.

**Minimum:** 2 distinct provider families (e.g., Alchemy + Quicknode).

**Recommended:** 3+ families (e.g., Alchemy + Quicknode + self-hosted node).

### Provider families

Canonical families:

- `alchemy` — Alchemy Polygon endpoints
- `infura` — Infura
- `quicknode` — Quicknode
- `ankr` — Ankr
- `blast` — Blast
- `publicrpc` — Public RPC endpoint
- `selfHostedBaseNode` — Your own Base node

**Phase 1 requirement:** Quorum must include at least one of:
- `selfHostedBaseNode` (operator-controlled node)
- Independent vendor endpoint (e.g., Ankr, Tenderly)

This prevents SaaS vendor lock-in.

### Configuration

```bash
# .env
KEEPER_RPC_ALCHEMY=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
KEEPER_RPC_QUICKNODE=https://your-quicknode-endpoint
KEEPER_RPC_SELF_HOSTED=http://localhost:8545

KEEPER_RPC_THRESHOLD=2  # Require 2-of-3 agreement
```

Keeper SDK initialization:

```ts
import { createSdk } from "@wstdiem/sdk";
import { createPublicClient, http } from "viem";

const sdk = createSdk({
  chainId: asChainId(8453),
  publicClients: [
    {
      client: createPublicClient({
        chain: base,
        transport: http(process.env.KEEPER_RPC_ALCHEMY!),
      }),
      providerFamily: "alchemy",
    },
    {
      client: createPublicClient({
        chain: base,
        transport: http(process.env.KEEPER_RPC_QUICKNODE!),
      }),
      providerFamily: "quicknode",
    },
    {
      client: createPublicClient({
        chain: base,
        transport: http(process.env.KEEPER_RPC_SELF_HOSTED!),
      }),
      providerFamily: "selfHostedBaseNode",
    },
  ],
  publicClientThreshold: 2,
  // ... other config ...
});
```

## Indexer setup

The keeper reads automation policies and market evidence from an indexer (Phase C service).

**Indexer URL:**
```bash
KEEPER_INDEXER_URL=https://indexer.wstdiem.example
```

**Indexer signing key:**

When indexer signature verification is enabled, supply the registry-pinned public key:

```bash
KEEPER_INDEXER_SIGNING_KEY=0x...
```

The keeper SDK validates indexer responses against this key.

**Indexer API endpoints used by keeper:**
- `GET /policies` — List all automation policies
- `GET /registry/latest` — Current registry config
- `GET /snapshots/latest` — Latest anchor snapshot
- `GET /actions?actionId=0x...` — Completed actions (for audit log)

## Contract addresses

```bash
KEEPER_LOOP_REGISTRY=0x...
KEEPER_LOOP_AUTHORIZATION=0x...
KEEPER_LOOP_FORCE_EXIT_AUTHORIZER=0x...
KEEPER_LOOP_EXECUTOR_V2=0x...
KEEPER_LOOP_FORCE_EXIT_EXECUTOR=0x...
KEEPER_LOOP_ANCHOR_REGISTRY=0x...
KEEPER_RISK_ORACLE_ADAPTER=0x...
KEEPER_LOOP_FEE_ROUTER=0x...
KEEPER_EMERGENCY_GUARDIAN=0x...
```

These are pinned in `sdk.contracts` at SDK construction time.

## Keeper wallet / signer

The keeper needs an on-chain wallet to submit transactions. This can be:

1. **EOA (recommended for Phase 1):** Simple single-wallet signing
2. **Multi-sig (optional):** Safe for institutional keepers
3. **Threshold signature (future):** Distributed signing for multi-keeper networks

**Phase 1:** EOA wallet is sufficient. Create a funded Base account.

```bash
KEEPER_SIGNER_PRIVATE_KEY=0x...  # Your keeper's private key
KEEPER_SIGNER_ADDRESS=0x...       # Your keeper's public address
```

**Do not commit private keys to version control.** Use a secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.).

### Allowlist verification

The keeper allow-list is enforced by the SDK at G-PM-6 evaluation time, not via a direct registry-read on the public interface. When you call `proposeAutomationAction`, the returned `TransactionPreview.gateStatuses` includes the G-PM-6 result; if your keeper address is not on the registry's `permissionlessCallerAllowList`, G-PM-6 evaluates to `fail` with `CallerNotAllowed`.

```ts
const preview = await sdk.proposeAutomationAction(policyId);
const g6 = preview.gateStatuses.find((g) => g.name === "CallerNotAllowed");
if (g6?.decision === "blocked") {
  throw new Error(
    "Keeper address not on allow-list. Request whitelist addition.",
  );
}
```

## Chain ID verification

Always pin to Base mainnet (8453) or Base Sepolia testnet (84532).

```bash
KEEPER_CHAIN_ID=8453  # Base mainnet
# OR
KEEPER_CHAIN_ID=84532 # Base Sepolia testnet
```

The SDK will throw if the configured RPC differs from the pinned chain ID.

## Readiness check

Before starting the keeper, verify setup:

```ts
async function verifyKeeperSetup(sdk: WstdiemSdk): Promise<void> {
  console.log("Verifying keeper setup...");

  // Check RPC quorum + indexer anchor freshness
  const anchor = await sdk.getAnchorFreshness();
  console.log(`✓ Last anchor block: ${anchor.lastAnchorBlock}`);

  // Check indexer
  const markets = await sdk.getMarkets();
  console.log(`✓ Indexer reachable, ${markets.length} markets`);

  // Check contract addresses (sdk.contracts)
  console.log(`✓ LoopRegistry: ${sdk.contracts.loopRegistry}`);
  console.log(
    `✓ Keeper allow-list enforced at G-PM-6 evaluation time per call`,
  );

  // Check incident state
  const incidentState = await sdk.getIncidentHistory({ limit: 1 });
  console.log(`✓ Incident state: ${incidentState[0]?.state ?? "NONE"}`);

  console.log("\n✓ Setup verified. Ready to start.");
}
```

## Full .env example

```bash
# RPC Configuration
KEEPER_RPC_ALCHEMY=https://base-mainnet.g.alchemy.com/v2/...
KEEPER_RPC_QUICKNODE=https://...
KEEPER_RPC_SELF_HOSTED=http://localhost:8545
KEEPER_RPC_THRESHOLD=2

# Indexer
KEEPER_INDEXER_URL=https://indexer.wstdiem.example
KEEPER_INDEXER_SIGNING_KEY=0x...

# Contracts
KEEPER_LOOP_REGISTRY=0x...
KEEPER_LOOP_AUTHORIZATION=0x...
KEEPER_LOOP_FORCE_EXIT_AUTHORIZER=0x...
KEEPER_LOOP_EXECUTOR_V2=0x...
KEEPER_LOOP_FORCE_EXIT_EXECUTOR=0x...
KEEPER_LOOP_ANCHOR_REGISTRY=0x...
KEEPER_RISK_ORACLE_ADAPTER=0x...
KEEPER_LOOP_FEE_ROUTER=0x...
KEEPER_EMERGENCY_GUARDIAN=0x...

# Keeper Signing
KEEPER_CHAIN_ID=8453
KEEPER_SIGNER_PRIVATE_KEY=0x...
KEEPER_SIGNER_ADDRESS=0x...

# Monitoring
KEEPER_LOG_LEVEL=info
KEEPER_METRICS_PORT=9090
```

## See also

- [Automation Lifecycle](./03-automation-lifecycle.md) — flow after setup
- [Monitoring](./07-monitoring.md) — health checks to run
- [Spec §5.6](../../PROTOCOL.md) — RPC quorum requirements
