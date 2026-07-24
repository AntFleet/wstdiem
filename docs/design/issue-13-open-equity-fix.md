# Design: fix OPEN omitting user equity (issue #13)

Status: **proposed** (awaiting review before implementation)
Scope: core contracts + EIP-712 `OPEN_TYPEHASH` + SDK + wallet-parity oracle + redeploy
Related: issue #13, `LAUNCH_READINESS.md` P0 (2026-07-24), the #6 canonical-digest work

## 1. Problem

`LoopExecutorV2._executeOpenInCallback` (`contracts/v2/LoopExecutorV2.sol:274-279`) supplies only the
flash-borrowed principal (converted to wstDIEM via `vault.deposit`) as Morpho collateral. The user's
equity is never transferred in and never combined. Result: every open is under-collateralized and
reverts `HealthFactorBoundFailure` at all leverages (post-open HF ≈ LLTV/NAV ≈ 0.86 < 1.05). Spec
`PROTOCOL.md:269` requires "combining the freshly minted wstDIEM with the user's transferred wstDIEM".

Two concrete defects:
1. **No transfer:** there is no `_safeTransferFrom(collateralToken, owner, executor, equity)` in the open path.
2. **Overwrite:** line 278 does `collateralAssets = deposit(...)` (`=`), discarding `context.supplyCollateralAssets`.

There is also **no signed field** carrying the equity: `OpenBounds` has none, and
`context.supplyCollateralAssets` is seeded from `minWstDiemReceived` (a slippage floor).

## 2. Design decision

Add a **signed** `equityCollateral` (uint256, wstDIEM) field to `OpenBounds`. It must be signed so a
permissionless keeper cannot substitute a different amount; that means an EIP-712 `OpenBounds` /
`OPEN_TYPEHASH` change (digest changes — intended, one-time, testnet only, no prod signers exist).

The SDK already has this value: `BuildOpenParamsInput.collateralAmount` (`sdk/src/types/action.ts:174`,
"wstDIEM collateral (equity) the user supplies") is used today only to size the flash/borrow in
`deriveOpenBounds`. The fix propagates it into the new signed field.

### Field placement
Add as the **first** field of `OpenBounds` (`uint256 equityCollateral`). Placement is free (the typehash
changes regardless), but it MUST be byte-identical across all seven encode sites (see §4). First-field
keeps it visually the base of the position.

### Execution semantics
In the open callback, with signed `equity = action.bounds.equityCollateral`:
```solidity
// pull the user's equity wstDIEM (owner must have approved the executor as an allowed spender)
_safeTransferFrom(context.params.collateralToken, context.owner, address(this), equity);
uint256 collateralAssets = equity;                       // start from equity, do NOT discard it
if (context.useVaultDeposit && context.flashAmount != 0) {
    ...
    collateralAssets += IERC4626Minimal(vault).deposit(context.flashAmount, address(this)); // ACCUMULATE
}
```
Then the existing `_safeTransfer` → `executeMorpho(supplyCollateral(..., collateralAssets, owner))` supplies
the combined balance. Leverage identity becomes correct: collateral = equity + flashShares, debt = flash +
fee, so `leverage = (equity + notional)/equity` and HF clears the bound.

- `equity` is taken from the **signed** bound, never from a balance read (keeper-manipulation safe).
- Reuse the existing `LoopV1TokenApproval.requireAllowedSpender` path for the pull (owner approves the
  executor for the collateral token; the app already needs an approve step, and the smoke sets it manually).
- `minWstDiemReceived` stays the slippage floor on the flash-deposit output only.

### Validation
Add `equityCollateral != 0` (open must contribute equity) and optionally assert
`maxBorrowedDiem ≈ equity·(leverage-1)` consistency in `LoopV1ActionValidation` for defense in depth.

## 3. Alternatives considered
- **Balance-based (executor supplies its own wstDIEM balance):** rejected — funds parked in the executor
  are unsafe and racy under permissionless execution; amount isn't bound to the signature.
- **Unsigned equity param:** rejected — a keeper could open at a different size than the user signed.
- **No new field, reuse `minWstDiemReceived` as equity:** rejected — conflates a slippage floor with the
  equity principal; breaks the flash-deposit min-out check.

## 4. Ripple — files to change (all must stay byte-identical for the wallet-parity oracle)

**Contracts**
- `contracts/v2/libraries/LoopV1EIP712.sol`: `OpenBounds` struct (+`equityCollateral`); `OPEN_BOUNDS_TYPEHASH`
  string; `OPEN_TYPEHASH` string (embedded `OpenBounds(...)` definition).
- `contracts/v2/libraries/LoopV1Hashing.sol`: `_hashOpenBounds` `abi.encode` (+field, matching order).
- `contracts/v2/LoopExecutorV2.sol`: `executeOpen` (read `bounds.equityCollateral` into context);
  `_executeOpenInCallback` (pull + accumulate per §2).
- `contracts/v2/LoopExecutorBase.sol`: `FlashContext` (carry `equity`, or repurpose `supplyCollateralAssets`).
- `contracts/v2/libraries/LoopV1ActionValidation.sol`: `equityCollateral != 0` (and optional consistency).

**SDK**
- `sdk/src/types/action.ts`: `OpenBounds` interface (+`equityCollateral`).
- `sdk/src/eip712/typehashes.ts`: `OpenBounds` + `Open` strings.
- `sdk/src/eip712/typed-data.ts`: `OpenBounds` field array (+field) and the builder (~line 285).
- `sdk/src/eip712/sub-hashes.ts`: `OpenBoundsInputs` + `hashOpenBounds` `abi.encode`.
- `sdk/src/eip712/digest.ts`: `hashOpenBounds({ ... })` caller (~line 100).
- `sdk/src/live/sdk-impl.ts`: `deriveOpenBounds` (emit `equityCollateral = input.collateralAmount`);
  the executor-calldata builder (~line 1288); `buildTypedData`.

**Oracle + tests (regenerate the shared digest fixture)**
- `sdk/test/eip712-wallet-parity.test.ts` + `sdk/test/fixtures/eip712-open-parity.json` (new digest).
- `test/foundry/v2/Eip712WalletParity.t.sol` (contract-side oracle).
- Contract unit/E2E: `test/foundry/v2/MockDeploymentE2E.t.sol` (open now yields HF ≥ 1.05 and succeeds);
  add a regression asserting equity is transferred + supplied.
- `scripts/sepolia-open-exit-smoke.ts`: include `equityCollateral` in the built open action.

## 5. Redeploy
The typehash change lives in libraries embedded by both `LoopExecutorV2` and `LoopAuthorization` (which
recomputes the digest), so a fresh **Phase B redeploy + Phase C apply** on the corrected contracts is
required (same runbook as the 2026-07-20 redeploy). The owner must approve wstDIEM to the *new* executor
(the app's approve step; the smoke does it via `cast`).

## 6. Verification plan
1. `forge test` full suite green, incl. the updated open E2E (healthy HF) + a new equity-transfer regression.
2. **Wallet-parity oracle green for the NEW typehash:** contract `hashOpen` == viem `hashTypedData` == SDK
   digest, from a single regenerated fixture. This is the gate that the digest change is consistent everywhere.
3. `forge build --sizes` still 0 (the field adds trivial bytecode; all four core contracts stay < EIP-170).
4. SDK build + full test suite; app typecheck.
5. Redeploy to Base Sepolia; live smoke: OPEN eth_call simulates with **no** `HealthFactorBoundFailure`,
   then (with approval) a real `OPEN_BROADCAST=1` establishes a position with HF ≥ 1.05, and EXIT unwinds it.
6. 3-lane `omc ask codex` audit of the open path + EIP-712 parity (capped per the circuit-breaker: 1 round,
   1 remediation, hand over residual).

## 7. Risks
- **Digest consistency:** the single biggest risk is one of the seven encode sites drifting. Mitigation: the
  wallet-parity oracle (step 2) fails loudly on any mismatch — do not merge until it's green.
- **Field-order bugs:** `abi.encode` order in `_hashOpenBounds`/`hashOpenBounds` must match the struct/type
  string order exactly. Covered by the oracle.
- **Approval UX:** production opens now require an ERC-20 approve of wstDIEM → executor. App must add/verify
  this step (out of scope for the contract fix, but a launch item).
- **No prod signers exist**, so invalidating the old `OPEN_TYPEHASH` is costless.

## 8. Phasing & effort
- **P1 Contract + hashing** (`LoopV1EIP712`, `LoopV1Hashing`, `LoopExecutorV2`, `LoopExecutorBase`,
  validation) + Foundry tests + contract-side parity — ~0.5–1 day.
- **P2 SDK + wallet-parity oracle** (types, eip712/*, sdk-impl, regenerate fixture, tests) — ~0.5 day.
- **P3 Redeploy (Phase B/C) + live smoke + audit** — ~0.5 day + the ~3-day Phase C timelock.

Gate each of P1/P2/P3 on review (core-contract + EIP-712 change).
