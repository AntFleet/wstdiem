# Governance: Safe + timelock ownership (D-7)

## Phase-1 model (already on-chain)

`LoopRegistry` implements defense-in-depth **without** embedding OpenZeppelin `TimelockController`:

| Control | Mechanism |
|---------|-----------|
| Ownership transfer | `Ownable2Step` (`transferOwnership` → `acceptOwnership`) |
| Fingerprints | `queueExternalFingerprintUpdate` → `REGISTRY_TIMELOCK_BLOCKS` (130 000 ≈ 3d on Base) → apply via batch |
| Critical roles | queue → apply after same delay (indexer, anchor, guardian, governance, harvest) |
| Config batches | Immediate only while `bootstrapClosed == false`; after close, `batchUpdate` queues → `applyBatchUpdate` after delay |
| Spend allowlist | Cannot disable after bootstrap (`spendAllowlistLocked`) |

An external TimelockController **inside** the registry would duplicate delay and inflate bytecode. Prefer **Safe as owner**.

## Recommended production topology

```
Gnosis Safe (governance multisig)
  └── (optional) Zodiac Delay / Timelock module for Safe txs
        └── owns LoopRegistry (after acceptOwnership)
              └── in-contract 130k-block queues still apply to batch/fingerprint/role
```

### Bootstrap sequence

1. Deployer deploys registry + core; `batchUpdate` initial ops (immediate).
2. Queue + apply external fingerprints (timelock).
3. `setSpendAllowlistEnforced(true)`; wire evidence sets.
4. `closeBootstrap()` — further batches are timelocked.
5. `assertProductionReadiness(market)`.
6. `transferOwnership(SAFE)`; Safe `acceptOwnership()`.
7. Optionally enable Safe delay module so *initiating* queue also requires multi-sig delay.

### Double-timelock warning

If Safe has a 48h delay **and** registry has ~3d apply delay, operators must plan for **sum** of delays before config is live. Document intended total in the runbook.

## Testnet / beta

EOA owner is acceptable for Sepolia mocks. Do not use EOA owner for mainnet capital.

## What we deliberately skip

- Redeploying queue logic as TimelockController targets (size + dual sources of truth)
- Shipping a full Safe tx builder in this repo (use Safe UI / Safe Transaction Service)

## Checklist fields for deploy configs

Suggested keys in `script/v2/configs/*.json` (informational):

```json
{
  "governanceMultisig": "0x…",
  "governanceSafe": "0x…",
  "notes": "Safe is registry owner after bootstrap; in-contract 130k delay remains"
}
```
