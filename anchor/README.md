# @wstdiem/anchor

wstDIEM v0.1.0-rc1 anchor submitter. Periodically reads the indexer's view of registry + indexed-block state, computes a canonical manifest hash, and submits it to `LoopAnchorRegistry.submitStateSnapshot()` respecting the on-chain cadence cap.

**Status:** MVP release. The manifest schema is the minimum-viable starting commitment; the full the protocol spec §5.2 indexer-integrity manifest expands in a subsequent release.

## Quickstart

```sh
cd anchor
npm install            # installs hoisted workspace deps from repo root
cp .env.example .env   # edit RPC URL, indexer URL, submitter private key
npm run build
npm run dev -- run     # or: node dist/cli.js run
```

## Configuration (env vars)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `WSTDIEM_CHAIN_ID` | yes | — | e.g. `8453` for Base mainnet |
| `WSTDIEM_RPC_URL` | yes | — | Primary JSON-RPC HTTP endpoint |
| `WSTDIEM_RPC_FALLBACK_URLS` | no | — | Comma-separated fallback endpoints |
| `WSTDIEM_INDEXER_API_URL` | yes | — | e.g. `http://127.0.0.1:8080` |
| `WSTDIEM_REGISTRY_ADDRESS` | yes | — | LoopRegistry — used to read `anchorCadenceBlocks()` |
| `WSTDIEM_ANCHOR_REGISTRY_ADDRESS` | yes | — | LoopAnchorRegistry deployment address |
| `WSTDIEM_ANCHOR_SUBMITTER_PRIVATE_KEY` | yes | — | 0x-prefixed 32-byte private key for the submitter |
| `WSTDIEM_ANCHOR_CADENCE_OVERRIDE` | no | — | Override the on-chain cadence (use only for testing / forks) |
| `WSTDIEM_MIN_INDEXER_LAG` | no | `1` | Skip submission if `currentBlock - indexedBlock` < this |
| `WSTDIEM_ANCHOR_POLL_INTERVAL_MS` | no | `15000` | Poll cadence |
| `WSTDIEM_ANCHOR_TX_CONFIRMATIONS` | no | `2` | Wait N confirmations before treating submission as complete |
| `WSTDIEM_ANCHOR_LOG_LEVEL` | no | `info` | Same levels as the indexer |

## How it works

```
+------------+        HTTP GET /health, /registry/latest, /snapshots/latest
| anchor     | ----------------------------------------------------------->  +---------+
| submitter  |                                                                | indexer |
|            | <---- IndexerSnapshot { head, registry, latestSnapshot } ----  +---------+
|            |
|            |        eth_call LoopRegistry.anchorCadenceBlocks()
|            | ---------------------------------------------------------> Base RPC
|            | <---- cadence ---------------------------------------------
|            |
|            |        decideSubmit({ currentBlock, lastSubmitted, cadence, ... })
|            |
|            |        eth_sendRawTransaction:
|            |          LoopAnchorRegistry.submitStateSnapshot(
|            |            blockNumber: indexedBlock,
|            |            manifestHash: keccak256(abi.encode(
|            |              chainId, indexedBlock, indexedBlockHash,
|            |              registryVersion, registryMerkleRoot
|            |            ))
|            |          )
|            | ---------------------------------------------------------> Base RPC
+------------+
```

## Manifest hash schema (MVP release)

```solidity
manifestHash = keccak256(abi.encode(
  uint256 chainId,
  uint256 indexedBlockNumber,
  bytes32 indexedBlockHash,
  uint256 registryVersion,
  bytes32 registryMerkleRoot
));
```

This binds the indexer's view of (a) the block height + canonical hash it has consumed up to, and (b) the latest `RegistryConfigBatchCommitted` it has observed. SDK consumers can reproduce this hash from the indexer's HTTP API and reject any indexer whose claimed state disagrees with the submitted manifest.

The SDK will expand this to the full the protocol spec §5.2 ActionEvidence canonical-set commitment.

## Cadence semantics

- The on-chain cadence floor is read from `LoopRegistry.anchorCadenceBlocks()` at startup (cached for the process lifetime).
- An override can be provided via `WSTDIEM_ANCHOR_CADENCE_OVERRIDE` for fork / staging environments.
- Submission fires when `(indexedBlock - lastSubmittedAnchorBlock) >= cadence` AND `(currentBlock - indexedBlock) >= minIndexerLag`.

## Testing

```sh
npm test
```

Tests cover the cadence decision (every boundary) and manifest-hash determinism + sensitivity.

## What this anchor submitter does NOT do (future scope)

- Multi-submitter consensus or coordination (Phase G)
- Re-submission on revert with backoff (basic retry only in MVP)
- Hot key rotation (operator runbook)
- Hardware-wallet signing (the production deployment ceremony)
