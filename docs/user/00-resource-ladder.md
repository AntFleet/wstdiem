# Resource ladder

Canonical terms for DIEM, Venice credit, wstDIEM, loop economics, and bounded execution. Use these words as written.

None of this is a yield promise, investment advice, or permission to broadcast. Unused Venice credit is not token yield. Tier 2 settlement is not proof of external demand.

## The ladder

1. **DIEM**
   Raw Venice compute token on Base. When staked, it grants daily Venice API credit.

2. **Venice credit**
   Consumable API capacity from staked DIEM. It is not token yield unless the credit is actually consumed, sold, routed, or otherwise monetized. Unused credit remains `$0` token yield.

3. **wstDIEM**
   Rebase-free vault/share token over DIEM-backed assets. Your wallet balance does not automatically increase. Value changes through NAV / `convertToAssets` (the exchange rate), not through rebasing.

4. **`DIEMCredited`**
   Tier 1, chain-proven event showing DIEM actually credited/staked into the vault and raising holder NAV.

5. **`SettlementReceived` / `YieldRouted`**
   Tier 2 context. On-chain-real amounts, but not full proof that demand is external or organic.

6. **External demand vs protocol-seeded flow**
   Tier 3 limitation. The chain cannot prove whether settled USDC reflects external demand or protocol self-seeding. State this plainly.

7. **Loop spread**
   Realized or modeled vault/NAV yield minus Morpho borrow cost and execution costs. It is not guaranteed, not advice, and not a forward yield promise.

8. **Loop position**
   User-owned collateral/debt state with liquidation risk.

9. **Keeper**
   Operator that proposes or executes only within signed bounds. A keeper cannot change action type, widen bounds, bypass gates, or silently degrade MEV mode. Keepers turn the crank inside the signed envelope; they do not run buybacks, burns, arena mechanics, or reflexive tokenomics. If live state is outside the envelope, execution fails closed and the position remains unchanged.

10. **Sizing candidate / capacity candidate**
    Decision-support under model assumptions. Not permission to deploy, not automated protection, not investment advice.

## What this is not

- wstDIEM is not a rebasing Lido / wstETH wrapper. Value accrues as NAV / exchange rate, not as a growing wallet balance.
- Venice credit is not token yield while it sits unspent.
- A quiet `DIEMCredited` window is not “zero demand.” Routing and keeper cadence are lumpy.
- `SettlementReceived` / `YieldRouted` do not prove organic external demand.
- A keeper is not a demand engine and cannot execute outside the signed envelope.

## Known residuals (fail closed, not hidden)

- Phase 1 stored automation policies persist `policyHash` but numeric `minRepay` / `maxCollateralSold` / `maxDebtIncrease` are zero. Deleverage-class AutomationExec cannot sell collateral until a future policy-body ABI (audit-gate reclose).
- A `PRIVATE_BUILDER` digest must not silently degrade onto sequencer-direct. That is `MevModeMismatch` / `KeeperBuilderOutage`, not a waiver-bit shortcut.

## See also

- [What is wstDIEM Loop?](./01-what-is-wstdiem-loop.md)
- [Risk Disclosures](./03-risk-disclosures.md)
- [FAQ](./05-faq.md)
- [Glossary](./06-glossary.md)
- [Keeper role](../keeper/01-keeper-role.md) — bounded execution
- [PROTOCOL.md §6.4](../../PROTOCOL.md) — signed envelope / fail-closed invariant
