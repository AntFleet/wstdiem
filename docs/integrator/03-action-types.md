# Action Types

Every loop action is a discriminated union with a `primaryType` field and corresponding `bounds` payload.

## Common envelope

All actions share these fields:

```ts
interface CommonActionEnvelope {
  owner: Address;                    // User's address
  market: MarketId;                  // Market identifier
  chainId: ChainId;                  // Chain ID (8453 for Base mainnet)
  nonce: { slotIndex: bigint; bitIndex: bigint };  // Permit2-style nonce
  mevProtectionMode: MevProtectionMode;            // PRIVATE_BUILDER | PUBLIC_MEMPOOL | etc.
  acknowledgmentBits: bigint;                       // Risk acknowledgment bitmap
}
```

Each action adds a `primaryType` discriminator and action-specific `bounds`.

## Open

Opens a new leveraged loop position. Highest risk (leverage-increasing).

```ts
interface OpenAction extends CommonActionEnvelope {
  primaryType: "Open";
  bounds: OpenBounds;
}

interface OpenBounds {
  minWstDiemReceived: bigint;              // Minimum wstDIEM received (wei)
  minBorrowedDiem: bigint;                 // Minimum DIEM borrowed (wei)
  maxBorrowedDiem: bigint;                 // Maximum DIEM borrowed (wei)
  maxSlippageBps: BasisPoints;             // Max slippage (1 bps = 0.01%)
  maxPriceImpactBps: BasisPoints;          // Max price impact on Curve
  maxLeverageBps: BasisPoints;             // Max leverage multiple (2.0x = 2000 bps)
  minHealthFactor: bigint;                 // Minimum health factor (wad, ~1.5e18 = 1.5)
  minLiquidationDistanceBps: BasisPoints;  // Minimum distance to liquidation
  maxMorphoUtilizationImpactBps: BasisPoints;  // Max impact on Morpho utilization
  deadline: UnixSeconds;                   // Expiration time
}
```

**When to use:** User is opening their first position, or adding to an existing position significantly.

**Gates:**
- G-PM-1 (HarvestConvergencePending) — fails if within cooling period of harvest event
- G-PM-4 (Eip1271PreimageNotAttested) — for smart wallets, requires preimage attestation
- G-PM-5 (MevWaiverMissing) — if mevProtectionMode is not PRIVATE_BUILDER
- G-PM-6 (CallerNotAllowed) — if permissionless execution (keeper)

**Evidence required:** Morpho position, vault NAV, Chainlink oracle, Curve pool, sequencer uptime.

## Rebalance

Adjust an existing position's leverage (up or down). Derives mode from bounds pair.

```ts
interface RebalanceAction extends CommonActionEnvelope {
  primaryType: "Rebalance";
  bounds: RebalanceBounds;
}

interface RebalanceBounds {
  maxDebtIncrease: bigint;        // Max DIEM to borrow (0n for deleveraging)
  maxCollateralSold: bigint;      // Max wstDIEM to withdraw (0n for leverage increase)
  maxSlippageBps: BasisPoints;
  maxPriceImpactBps: BasisPoints;
  minHealthFactor: bigint;
  minLiquidationDistanceBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  deadline: UnixSeconds;
}
```

**Mode derivation (§6.2):**

- `(maxDebtIncrease > 0, maxCollateralSold == 0)` → **LEVERAGE_INCREASE** — high risk, needs G-PM-1/4
- `(maxDebtIncrease == 0, maxCollateralSold > 0)` → **PARTIAL_DELEVERAGE** — risk-reducing
- `(maxDebtIncrease == 0, maxCollateralSold == 0)` → **HEALTH_FACTOR_RECOVERY** — risk-reducing, repay only

Combining both (debt increase + collateral sale) reverts `RebalanceModeAmbiguous`.

**When to use:** 
- LEVERAGE_INCREASE: User wants more exposure to wstDIEM
- PARTIAL_DELEVERAGE: User wants to reduce risk, withdraw collateral
- HEALTH_FACTOR_RECOVERY: User wants to improve health factor without withdrawing

**Gates:** LEVERAGE_INCREASE applies G-PM-1/4/5/6. PARTIAL_DELEVERAGE and HEALTH_FACTOR_RECOVERY bypass them.

## Exit

Close a position and receive back DIEM. Risk-reducing.

```ts
interface ExitAction extends CommonActionEnvelope {
  primaryType: "Exit";
  bounds: ExitBounds;
  routeKind: ExitRouteKind;  // "CURVE" or other registry-pinned routes
}

interface ExitBounds {
  minDiemReturned: bigint;            // Minimum DIEM received after slippage
  minHealthFactor: bigint;             // Not applicable, ignored (already exiting)
  minLiquidationDistanceBps: BasisPoints;  // Not applicable
  maxSlippageBps: BasisPoints;
  maxPriceImpactBps: BasisPoints;
  maxMorphoUtilizationImpactBps: BasisPoints;
  deadline: UnixSeconds;
}
```

**When to use:** User wants to close their position and get back DIEM.

**Gates:** None (risk-reducing, always allowed if readiness permits).

**Exit route:** Currently only "CURVE" is supported in Phase 1. The routeKind is pinned in registry per market.

## ForceExit

Force-close a position with critical-override acknowledgment bits. Highest risk.

```ts
interface ForceExitAction extends CommonActionEnvelope {
  primaryType: "ForceExit";
  bounds: ForceExitBounds;
}

interface ForceExitBounds {
  minDiemReturned: bigint;
  deadline: UnixSeconds;
  // All other bounds are deferred or locked
}
```

**When to use:** Position is at risk of liquidation and user must exit immediately, overriding normal safety checks.

**Acknowledgment bits:**
- Must acknowledge liquidation risk
- Must acknowledge oracle risk
- Must acknowledge irreversible loss possible
- Maximum 24h deadline per audit gate (I-67)

**Gates:** 
- G-PM-1/4 bypass (force exit can happen in emergency)
- G-PM-5 (MevWaiverMissing) — requires high MEV protection or waiver
- Requires EIP-1271 preimage attestation per I-66

**Deferred to Phase G:** Automated force-exit coordination with keepers.

## Revoke

Cancel authorization for a stored policy or one-time action.

```ts
interface RevokeAction extends CommonActionEnvelope {
  primaryType: "Revoke";
  target: PolicyId | ActionDigest;  // Policy to revoke, or one-time digest to invalidate
}
```

**When to use:** User no longer trusts the authorization (e.g., lost the key, policy condition no longer applies).

**Revocation grace period:** After revocation is signed, the contract enters a 5-block "PolicyRevoking" state during which automation cannot execute.

## AutomationExec

Execute an automation proposal (keeper-only in Phase 1).

```ts
interface AutomationExecAction extends CommonActionEnvelope {
  primaryType: "AutomationExec";
  policyId: PolicyId;
  proposalId: ProposalId;
}
```

**Phase 1 Status:** Restricted per AC-17. Permissionless execution returns degraded results.

## Using the Action union

```ts
type Action = OpenAction | RebalanceAction | ExitAction | ForceExitAction | RevokeAction | AutomationExecAction;

// Type guard to check action type
function isOpenAction(a: Action): a is OpenAction {
  return a.primaryType === "Open";
}

// All actions carry bounds
const example: Action = /* ... */;
console.log(`Deadline: ${example.deadline}`);
```

## See also

- [Getting Started](./01-getting-started.md) — examples of building actions
- [Evidence Model](./04-evidence-model.md) — what evidence each action requires
- [Gate Evaluation](./05-gate-evaluation.md) — how gates interpret bounds
- [Spec §6.1, §6.2, §6.3](../../PROTOCOL.md) — formal execution requirements per action
