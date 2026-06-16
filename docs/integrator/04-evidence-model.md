# Evidence Model

The `ActionEvidence` canonical-set encoding per §5.5. Every action proof includes sorted, unique evidence from required sources.

## ActionEvidence structure

```ts
interface ActionEvidence {
  actionId: Bytes32;              // EIP-712 primaryType hash
  evidenceSetId: Bytes32;         // Route variant discriminator (CURVE, CURVE_FREE, REPAY_ONLY)
  owner: Address;                 // Owner address
  market: MarketId;               // Morpho market id
  blockNumber: BlockNumber;       // Canonical read block
  stateBitmap: Uint16;            // State bitmap from §7.1
  sources: EvidenceSource[];      // Sorted canonical sources
  // evidenceBundleHash is derived, not stored:
  // keccak256(abi.encode(EVIDENCE_BUNDLE_TYPEHASH, actionId, evidenceSetId, 
  //   owner, market, blockNumber, stateBitmap, keccak256(abi.encode(sources))))
}

interface EvidenceSource {
  sourceId: Bytes32;              // Type: "morpho-position", "vault-nav", "chainlink-oracle", etc.
  sourceAddress: Address;         // Canonical address for this source (registry-pinned)
  status: SourceStatus;           // "fresh" | "stale" | "missing" | "degraded" | "notConfigured" | "outsideDeviation"
  lastUpdateBlock: BlockNumber;   // Block where this source was last updated
  valueHash: Bytes32;             // Hash of the read value (oracle price, position, etc.)
}

type SourceStatus = "fresh" | "stale" | "missing" | "degraded" | "notConfigured" | "outsideDeviation";
```

## Canonical-set rules

The phase A spec (§5.5) imposes strict rules to prevent ambiguity:

1. **Sorted strict-ascending** by `(sourceId, sourceAddress)` lexicographic order
2. **Exactly required set** — no more, no fewer sources than the action class requires
3. **Unique entries** — each `(sourceId, sourceAddress)` pair appears exactly once
4. **Address-bound** — `sourceAddress` must match the registry-pinned canonical address for that source
5. **No unknown extra fields** — struct shape is exact-match by ABI hash

## Required sources by action

**Open** (leverage-increasing, highest risk):
- morpho-position (borrower state)
- vault-nav (collateral value)
- chainlink-oracle (price oracle)
- curve-pool (exit liquidity)
- sequencer-uptime (L2 sequencer status)

**Rebalance** (LEVERAGE_INCREASE variant):
- morpho-position
- vault-nav
- chainlink-oracle
- curve-pool (if exiting collateral)
- sequencer-uptime

**Rebalance** (PARTIAL_DELEVERAGE and HEALTH_FACTOR_RECOVERY):
- morpho-position only (risk-reducing, oracle optional)

**Exit**:
- morpho-position (to compute final debt)
- vault-nav (to compute final collateral)
- curve-pool (to fetch quote if needed)

**ForceExit**:
- morpho-position (minimal, may be stale)
- vault-nav (minimal)

## Building evidence

The SDK provides a builder:

```ts
import { buildActionEvidence, validateExactSet } from "@wstdiem/sdk";

const sources: EvidenceSource[] = [
  {
    sourceId: "morpho-position",
    sourceAddress: morphoAddress,
    status: "fresh",
    lastUpdateBlock: blockNumber,
    valueHash: keccak256(abi.encode(position)),
  },
  {
    sourceId: "vault-nav",
    sourceAddress: vaultAddress,
    status: "fresh",
    lastUpdateBlock: blockNumber,
    valueHash: keccak256(abi.encode(exchangeRate)),
  },
  // ... more sources ...
];

// Validates: sorting, uniqueness, required set
const validated = validateExactSet({
  sources,
  required: [
    { sourceId: "morpho-position", sourceAddress: morphoAddress },
    { sourceId: "vault-nav", sourceAddress: vaultAddress },
    // ...
  ],
});

const evidence = buildActionEvidence({
  actionId: openAction.primaryType,
  evidenceSetId: routeVariant, // "CURVE" for exit
  owner: openAction.owner,
  market: openAction.market,
  blockNumber,
  stateBitmap,
  sources: validated,
});

console.log(`Bundle hash: ${evidence.evidenceBundleHash}`);
```

## Evidence resolver pattern

For integrations that fetch their own evidence:

```ts
interface EvidenceResolver {
  resolveEvidence(action: Action): Promise<ActionEvidence>;
}

const sdk = createSdk({
  evidenceResolver: {
    resolveEvidence: async (action) => {
      // Fetch oracle price, position, route quotes, etc.
      // Build canonical ActionEvidence
      return evidence;
    },
  },
});
```

If no resolver is supplied and evidence is required, the SDK throws `EvidenceRequired`.

## Finality envelope

Evidence comes with finality markers:

```ts
interface EvidenceBundle {
  evidence: ActionEvidence;
  finality: "provisional" | "finalized";
  // finality = "provisional" when blockNumber is within finalityThreshold blocks of current head
  // finality = "finalized" when blockNumber is > finalityThreshold blocks old
}
```

Provisional evidence is not suitable for automation execution. Only finalized evidence may be used.

## Source types

| sourceId | sourceAddress | Provides | Status values |
|----------|---------------|----------|----------------|
| morpho-position | Morpho contract | Borrower position state | fresh, stale, missing |
| vault-nav | wstDIEM vault | Exchange rate | fresh, stale, missing |
| chainlink-oracle | Chainlink feed | DIEM/wstDIEM price | fresh, stale, missing, outsideDeviation |
| curve-pool | Curve pool | wstDIEM liquidity + price | fresh, stale, degraded |
| sequencer-uptime | Sequencer feed | L2 sequencer status | fresh, down, gracePeriod |

## Error handling

```ts
import { EvidenceSetError } from "@wstdiem/sdk";

try {
  const validated = validateExactSet({ sources, required });
} catch (err) {
  if (err instanceof EvidenceSetError) {
    if (err.message.includes("EvidenceUnsorted")) {
      console.log("Sources must be sorted strictly ascending");
    } else if (err.message.includes("EvidenceSourceMissing")) {
      console.log(`Missing required source: ${err.details}`);
    } else if (err.message.includes("EvidenceSourceAddressMismatch")) {
      console.log(`Address mismatch for source: ${err.details}`);
    }
  }
}
```

Canonical error names (on-chain and SDK): `EvidenceUnsorted`, `EvidenceSourceUnexpected`, `EvidenceSourceMissing`, `EvidenceSourceAddressMismatch`.

## See also

- [Getting Started](./01-getting-started.md) — buildActionEvidence example
- [Spec §5.5](../../PROTOCOL.md) — canonical-set rules
- [Error Registry](./06-errors.md) — evidence-related errors
