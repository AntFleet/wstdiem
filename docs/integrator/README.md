# Integrator Documentation

Complete API reference and integration guide for developers building on the TypeScript SDK.

## What this covers

- **Install and quickstart** — get the SDK running in 5 minutes
- **API reference** — every method on `WstdiemSdk` with examples
- **Action types** — Open/Rebalance/Exit/ForceExit/AutomationExec envelopes
- **Evidence model** — ActionEvidence canonical-set encoding per §5.5
- **Gate evaluation** — G-PM-1..6 fail-closed gates explained
- **Canonical errors** — full error registry + handling patterns
- **Recipes** — common integration flows end-to-end
- **Migration guide** — what changed in this release

## Quick links

- [Getting Started](./01-getting-started.md) — npm install, config, hello-world
- [API Reference](./02-api-reference.md) — method signatures and examples
- [Recipes](./07-recipes.md) — open a loop, sign, broadcast, decode events
- [Error Handling](./06-errors.md) — interpret SDK errors
- [Migration Guide](./08-migration-pr17.md) — upgrade guide from the previous release

## Minimum requirements

- **Node 20+** or modern browser with ES2020 support
- **TypeScript 5.0+** (optional, but recommended)
- **viem 2.0+** — for PublicClient creation (SDK uses viem types throughout)

## Installation

```bash
npm install @wstdiem/sdk viem
```

## Minimum config

```ts
import { createSdk, asChainId } from "@wstdiem/sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

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

// Ready to use
const markets = await sdk.getMarkets();
```

## Architecture

- **Isomorphic** — runs in Node 20+ or browser (no fork, no build-time config)
- **ESM only** — modern import/export syntax
- **Type-safe** — full TypeScript support, branded types for addresses and IDs
- **Pure functions** — no hidden side effects, no global state
- **Fail-closed** — invalid reads throw or return degraded results; never silent failures

## Security model

The SDK enforces fail-closed behavior throughout:

- **RPC quorum** — multi-client agreement required for safety-critical reads
- **Indexer signature verification** — responses validated against registry-pinned key
- **Evidence canonical-set** — sorted, unique, address-bound per §5.5
- **Block pinning** — all sub-reads within a preview/quote pin to the same block

See the [Security model section](./01-getting-started.md#security-model) in Getting Started for details.

## Key types

- **Action** — discriminated union: Open | Rebalance | Exit | ForceExit | AutomationExec | Revoke
- **ActionDigest** — bytes32 hash of the signed action
- **ActionEvidence** — canonical-set of oracle, position, and route evidence per §5.5
- **TransactionPreview** — complete quote + calldata ready to sign
- **ReadinessResult** — per-action decision matrix + state bitmap per §7.1

All IDs (MarketId, PolicyId, ActionDigest, etc.) are branded types so the compiler catches misuse.

## Documentation map

| Topic | File |
|-------|------|
| Install, config, hello-world | [Getting Started](./01-getting-started.md) |
| Every SDK method with signature + example | [API Reference](./02-api-reference.md) |
| Open/Rebalance/Exit/ForceExit envelopes | [Action Types](./03-action-types.md) |
| Evidence canonical-set + sources | [Evidence Model](./04-evidence-model.md) |
| G-PM-1..6 gate evaluation | [Gate Evaluation](./05-gate-evaluation.md) |
| Canonical error registry + patterns | [Error Registry](./06-errors.md) |
| Open end-to-end, sign+broadcast, decode events | [Recipes](./07-recipes.md) |
| What changed in this release | [Migration Guide](./08-migration-pr17.md) |

## Examples

See [Getting Started](./01-getting-started.md) and [Recipes](./07-recipes.md) for working examples.

## Support

- **Issues:** GitHub issues on the wstDIEM repo
- **Examples:** See the reference implementation at `app/src/hooks/useSdk.ts`
- **Spec:** [the SDK type definitions (SDK interface)](../../PROTOCOL.md) is the source of truth

## See also

- [the SDK type definitions — SDK interface spec](../../PROTOCOL.md)
- [SDK README](../../sdk/README.md) — architecture and security model
- [INTERFACE-APPENDIX-A — full type definitions](../../INTERFACE-APPENDIX-A.md)
