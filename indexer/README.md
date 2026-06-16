# @wstdiem/indexer

wstDIEM indexer service. Consumes G12 events (LoopActionStep + policy + registry + anchor + role-rotation) from the deployed the protocol contracts into a queryable SQLite store, with HTTP API for SDK / app / anchor-submitter consumers.

**Status:** MVP release. Tracks the event surface declared in `contracts/v2/interfaces/ILoopV1Events.sol` at the the v6 release.

## Quickstart

```sh
cd indexer
npm install            # installs hoisted workspace deps from repo root
cp .env.example .env   # edit RPC URL + contract addresses
npm run build
npm run dev -- run     # or: node dist/cli.js run
```

The indexer writes to `./data/indexer.db` by default and serves the HTTP API on `127.0.0.1:8080`.

## Configuration (env vars)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `WSTDIEM_CHAIN_ID` | yes | — | e.g. `8453` for Base mainnet |
| `WSTDIEM_RPC_URL` | yes | — | Primary JSON-RPC HTTP endpoint |
| `WSTDIEM_RPC_FALLBACK_URLS` | no | — | Comma-separated fallback endpoints |
| `WSTDIEM_START_BLOCK` | yes | — | Block to begin indexing from (usually the deployment block) |
| `WSTDIEM_CONFIRMATIONS` | no | `2` | Indexer waits N blocks behind chain head before consuming |
| `WSTDIEM_POLL_INTERVAL_MS` | no | `2000` | Poll cadence in ms |
| `WSTDIEM_REORG_DEPTH` | no | `64` | Maximum reorg depth the indexer can recover from |
| `WSTDIEM_DB_PATH` | no | `./data/indexer.db` | SQLite database path |
| `WSTDIEM_API_PORT` | no | `8080` | HTTP API port |
| `WSTDIEM_API_HOST` | no | `127.0.0.1` | HTTP API bind address |
| `WSTDIEM_LOG_LEVEL` | no | `info` | `fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `WSTDIEM_REGISTRY_ADDRESS` | yes | — | LoopRegistry deployment address |
| `WSTDIEM_AUTHORIZATION_ADDRESS` | yes | — | LoopAuthorization deployment address |
| `WSTDIEM_FORCE_EXIT_AUTHORIZER_ADDRESS` | yes | — | LoopForceExitAuthorizer deployment address |
| `WSTDIEM_EXECUTOR_V2_ADDRESS` | yes | — | LoopExecutorV2 deployment address |
| `WSTDIEM_FORCE_EXIT_EXECUTOR_ADDRESS` | yes | — | LoopForceExitExecutor deployment address |
| `WSTDIEM_ANCHOR_REGISTRY_ADDRESS` | yes | — | LoopAnchorRegistry deployment address |
| `WSTDIEM_FEE_ROUTER_ADDRESS` | yes | — | LoopFeeRouter deployment address |
| `WSTDIEM_EMERGENCY_GUARDIAN_ADDRESS` | yes | — | EmergencyGuardian deployment address |

## HTTP API

All endpoints return JSON with `bigint` values serialized as decimal strings.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Indexer head, chain id, indexed block hash |
| GET | `/actions?actionId=0x...` | All LoopActionStep events for a given action id |
| GET | `/policies` | Active + revoking + revoked policies |
| GET | `/registry/commits?limit=50` | `RegistryConfigBatchCommitted` history |
| GET | `/registry/latest` | Latest registry config commit |
| GET | `/snapshots?limit=50` | `StateSnapshotAccepted` history |
| GET | `/snapshots/latest` | Latest anchor snapshot |
| GET | `/roles/rotations?kind=indexerSigner&limit=50` | Role rotation events (filter by `kind`) |

## Reorg handling

On every poll the indexer compares the on-chain hash of its currently-indexed head against the stored hash. If they diverge, it walks backwards `WSTDIEM_REORG_DEPTH` blocks (or to genesis) to find the most recent block where stored == on-chain, deletes all indexed state at or above (ancestor + 1), and resumes forward indexing from the ancestor.

Reorgs deeper than `WSTDIEM_REORG_DEPTH` raise `ReorgDepthExceededError` and the indexer exits — re-seed from a known-good snapshot in that case.

## Architecture

```
config       config.ts            zod-validated config from env
db           db/{client,schema}   better-sqlite3 with forward-only migrations
rpc          rpc/client.ts        viem PublicClient with fallback transport
events       events/{abi,decoder} typed event ABIs + decodeEventLog wrapper
events       events/handlers.ts   decoded-event -> repository writes
state        state/repositories.ts CRUD on each table (Head, Block, Action, Policy, Registry, Snapshot, RoleRotation)
reorg        reorg/detector.ts    chain-reorg detection + rollback
api          api/server.ts        Fastify HTTP server
indexer.ts                         main poll loop
cli.ts                             commander-based entry point
```

## Testing

```sh
npm test
```

Tests cover repositories (round-trip with `:memory:` SQLite) and event decoders (against synthetic logs constructed with viem's `encodeEventTopics`). An end-to-end test against a local Anvil instance is on the release roadmap.

## What this indexer does NOT do (future scope)

- Multi-keeper consensus on indexed state (out of MVP scope; Phase G)
- RPC quorum across providers (release: the indexer trusts its configured RPC)
- ActionEvidence canonical-set verification (SDK)
- Indexer-key-signed responses (when SDK + indexer signing key are wired)
- Subscription / push delivery to clients (websocket layer)
