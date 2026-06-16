# MEV Posture

How keepers select MEV protection mode and handle waiver bits per §6.5.

## mevProtectionMode options

Per `sdk/src/types/enums.ts` and §6.5, exactly four modes are defined. Phase 1 ships with `PUBLIC`, `PRIVATE_BUILDER`, and `SEQUENCER_DIRECT_FAILOPEN` operationally; `SEALED_AUCTION` is reserved for Phase G.

| Mode | Behavior | Default? | When to use |
|------|----------|---------|------------|
| `PRIVATE_BUILDER` | bloXroute Protect (or registered private builder) | YES — for all automation policies created via the canonical app/SDK (§6.5 line 638) | Default; safest sandwich-resistant path |
| `PUBLIC` | Public mempool broadcast | No | Owner-direct paths only; user opts in via `PUBLIC_MEMPOOL_OPT_IN` waiver |
| `SEQUENCER_DIRECT_FAILOPEN` | Direct submission to Base sequencer (`mainnet-sequencer.base.org`) | No | Acceptable only for repay-only / Curve-free actions; requires `SEQUENCER_DIRECT_FALLBACK_OPT_IN` waiver |
| `SEALED_AUCTION` | Sealed-bid intent auction (CoW-style) | No | Phase G only; not enabled in Phase 1 |

`PUBLIC` is **disallowed** for permissionless force-exit execution. Force-exit policies default to `PRIVATE_BUILDER`; `SEQUENCER_DIRECT_FAILOPEN` requires both the matching waiver bit AND the relevant `acknowledgedRisks` bit (§6.5 line 639).

## Phase 1 default: PRIVATE_BUILDER

PRIVATE_BUILDER is the default for every automation policy created through the canonical app and SDK. The user's transaction is encrypted and hidden from the public mempool until a builder includes it in a block.

```ts
const proposal = await sdk.proposeAutomationAction(policyId);

// Keeper submits via the registered private builder (e.g. bloXroute Protect).
await privateBuilderClient.sendTransaction({
  to: proposal.to,
  data: proposal.data,
  value: proposal.value,
  // ... signed by keeper wallet ...
});
```

No waiver bit is required to use PRIVATE_BUILDER. It is the safe default.

## Waiver bits (Phase 1)

Per `sdk/src/types/enums.ts` (`MevWaiverBit` enum), exactly three waiver bits are defined in Phase 1:

| Bit | Name | Purpose |
|-----|------|---------|
| `1 << 0` | `PUBLIC_MEMPOOL_OPT_IN` | User opts into public mempool submission for `PUBLIC` mode |
| `1 << 1` | `SEQUENCER_DIRECT_FALLBACK_OPT_IN` | User opts into sequencer-direct submission for `SEQUENCER_DIRECT_FAILOPEN` mode |
| `1 << 2` | `BUILDER_KEY_OUTAGE_OPT_IN` | User opts into broader builder-outage handling (keeper may switch private builders) |

The executor reverts `MevWaiverMissing` for any digest whose signed `mevProtectionMode` requires a waiver bit that the user did not set.

## Alternative modes (with waiver bits)

### Public mempool mode (`PUBLIC`)

**When permitted.** Owner-direct paths only (`OWNER_DIRECT` execution kind). Keepers submitting permissionless actions cannot use `PUBLIC` — the digest's signed mode must match the runtime submission channel, and force-exit + automation paths reject `PUBLIC`.

**Required waiver.** `PUBLIC_MEMPOOL_OPT_IN` on `mevWaiverBits`.

```ts
import { MevWaiverBit } from "@wstdiem/sdk";

const policy = await sdk.getAutomationPolicies(owner).then((ps) => ps[0]);

const optedIn =
  (policy.mevWaiverBits & MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN) !== 0;

if (!optedIn) {
  throw new Error(
    "Public mempool mode requires PUBLIC_MEMPOOL_OPT_IN waiver",
  );
}
```

**Risk.** Transaction is visible in the mempool. Searchers can front-run, back-run, or sandwich it.

### Sequencer-direct fallback (`SEQUENCER_DIRECT_FAILOPEN`)

**When permitted.** Acceptable only for (a) repay-only / Curve-free automation paths where the MEV envelope is structurally bounded by exact-debt calldata; (b) policies whose `SEQUENCER_DIRECT_FALLBACK_OPT_IN` waiver bit is set; (c) operator-recovery `executionKind` paths. See §6.5 line 631.

**Required waiver.** `SEQUENCER_DIRECT_FALLBACK_OPT_IN`.

```ts
import { MevWaiverBit } from "@wstdiem/sdk";

const optedIn =
  (policy.mevWaiverBits & MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN) !==
  0;

if (!optedIn) {
  throw new Error(
    "Sequencer-direct fallback requires SEQUENCER_DIRECT_FALLBACK_OPT_IN waiver",
  );
}
```

`SEQUENCER_DIRECT_FAILOPEN` provides no incremental MEV protection beyond Base's no-public-mempool model. Use only where the action's MEV envelope is structurally bounded.

## bloXroute outage handling

**Scenario.** The registered private builder (e.g. bloXroute Protect) is unavailable. The digest was signed with `mevProtectionMode = PRIVATE_BUILDER`.

**Keeper rules** (per §6.5 line 646):

1. The keeper retries against the registered private builder up to a configured retry budget.
2. If retry budget is exhausted, the keeper checks whether the policy carries `mevWaiverBits.BUILDER_KEY_OUTAGE_OPT_IN`.
3. If set AND the action class is repay-only / Curve-free AND the digest also signed `SEQUENCER_DIRECT_FAILOPEN`, the keeper MAY submit via `SEQUENCER_DIRECT_FAILOPEN`.
4. If the digest signed `PRIVATE_BUILDER` only (not `SEQUENCER_DIRECT_FAILOPEN`), the keeper MUST NOT silently degrade — the submission is paused and `KeeperBuilderOutage` is emitted for observability.

```ts
import { MevWaiverBit } from "@wstdiem/sdk";

async function submitWithOutageHandling(
  proposal: TransactionPreview,
  policy: Policy,
): Promise<Hex> {
  try {
    return await privateBuilderClient.sendTransaction(proposal);
  } catch (err) {
    if (!isBuilderOutage(err)) throw err;

    // Retry once
    try {
      return await privateBuilderClient.sendTransaction(proposal);
    } catch {
      // Outage persists. Check waiver + signed-mode compatibility.
      const outageOptIn =
        (policy.mevWaiverBits & MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN) !==
        0;
      const signedSeqDirect =
        proposal.action.mevProtectionMode === "SEQUENCER_DIRECT_FAILOPEN";

      if (!outageOptIn || !signedSeqDirect) {
        // Pause submission; emit observable event upstream.
        throw new Error(
          "Builder outage: digest signed PRIVATE_BUILDER without SEQUENCER_DIRECT_FAILOPEN fallback waiver. Pausing submission.",
        );
      }

      // Safe to degrade.
      return await sequencerDirectClient.sendTransaction(proposal);
    }
  }
}
```

## G-PM-5 gate enforcement

The SDK's G-PM-5 (`MevWaiverMissing`) gate evaluator surfaces the constraint client-side before signing:

```ts
const preview = await sdk.previewTransaction(action);
const g5 = preview.gateStatuses.find((g) => g.name === "MevWaiverMissing");

if (g5?.decision === "blocked") {
  throw new Error(
    "G-PM-5 blocking: signed mevProtectionMode requires a waiver bit that is unset",
  );
}
```

If the keeper attempts to broadcast in a channel that doesn't match the signed `mevProtectionMode`, the on-chain executor reverts with `MevModeMismatch`. If the runtime submission path requires a waiver bit that's unset, the executor reverts with `MevWaiverMissing`.

## Monitoring builder status

```ts
async function monitorBuilderHealth() {
  const builderUrl = "https://builder.wstdiem.example";

  setInterval(async () => {
    try {
      const health = await fetch(`${builderUrl}/health`);
      const status = await health.json();

      if (status.status !== "ok") {
        console.warn("Private builder health degraded:", status);
        // Alert operational team; consider switching builders per policy.
      }
    } catch (err) {
      console.error("Private builder unreachable:", err);
      // Builder is down — engage outage handling per signed waiver.
    }
  }, 30 * 1000); // Check every 30 seconds
}
```

## Best practices

1. **Default to PRIVATE_BUILDER.** Never degrade unless the user signed both `SEQUENCER_DIRECT_FAILOPEN` mode AND the matching waiver bit.
2. **Check waiver bits.** Read `policy.mevWaiverBits` before considering any fallback. The bit pattern is the user's explicit consent envelope.
3. **Never silently degrade.** Surface `KeeperBuilderOutage` and pause the submission. The user opt-in is the only license to switch channels.
4. **Force-exit policies default PRIVATE_BUILDER.** `PUBLIC` is disallowed for permissionless force-exit. `SEQUENCER_DIRECT_FAILOPEN` requires both the waiver bit AND the relevant `acknowledgedRisks` bit.
5. **Fail closed.** If uncertain about waiver-vs-channel compatibility, do not execute.

## See also

- [Automation Lifecycle](./03-automation-lifecycle.md) — when keeper submits
- [Spec §6.5](../../PROTOCOL.md) — MEV posture requirements
- [Gate Evaluation](../integrator/05-gate-evaluation.md) — G-PM-5 gate (integrator docs)
- [Permissionless Fallback](./05-permissionless-fallback.md) — keeper allow-list + G-PM-6
