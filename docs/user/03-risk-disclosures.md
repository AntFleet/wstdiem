# Risk Disclosures

This document explains the risks you take on when you open a loop position. Read this carefully. **Do not open a position unless you understand these risks.**

## Liquidation risk

Your position can be liquidated if the wstDIEM/DIEM exchange rate falls too far.

### How liquidation works

The protocol tracks your "health factor" — a number that measures your buffer before liquidation. It is calculated as:

```
Health Factor = (Collateral Value) / (Debt Value)
```

- Your **collateral** is your wstDIEM
- Your **debt** is the DIEM you borrowed

When the exchange rate falls, your collateral becomes worth less. Your health factor drops.

### Liquidation threshold

When your health factor falls below a certain threshold (called the LLTV or "liquidation LTV"), anyone can liquidate your position. They receive a small reward and your collateral is sold to repay your debt.

The exact threshold is shown in the UI when you open a position. **Once you are liquidated, you cannot recover your position — the collateral is gone.**

### How to avoid liquidation

1. **Monitor your health factor regularly.** The Positions screen shows it in real time.
2. **Rebalance before your health factor gets too low.** If it drops below 1.5, seriously consider rebalancing or exiting.
3. **Understand the exchange rate.** Your risk is entirely driven by the DIEM/wstDIEM exchange rate. If you believe it might fall, do not open a large position.
4. **Start small.** Your first position should be small while you learn how the protocol works.

## Oracle risk

The protocol uses a Chainlink oracle to read the wstDIEM/DIEM exchange rate. **If the oracle is broken, stale, or manipulated, the protocol may execute at the wrong price.**

### How oracle risk manifests

- **Stale prices:** The oracle reports a price that is old. The protocol might think the exchange rate is better than it actually is.
- **Missing prices:** The oracle fails entirely and the protocol cannot price your position.
- **Extreme deviation:** The oracle's price diverges wildly from the real on-chain exchange rate. The protocol may reject the transaction.

### How the protocol defends itself

1. **Freshness checks:** The protocol reads both the Chainlink oracle AND the actual on-chain vault exchange rate.
2. **Deviation thresholds:** If the two prices disagree by more than a threshold, the protocol pauses or rejects the transaction.
3. **Automatic pause:** If the oracle is stale for too long, the protocol automatically pauses risk-increasing actions (open, increase leverage). You can still exit.

## Curve liquidity risk

When you exit your position, the protocol sells wstDIEM through Curve to repay the borrowed DIEM. **If Curve liquidity is low, you may get a worse price and lose money.**

### How Curve liquidity works

- **Deep liquidity:** You get a good price, little slippage
- **Shallow liquidity:** You get a bad price, more slippage, you lose money

Curve liquidity varies over time. It can dry up during market stress or MEV attacks.

### How to minimize Curve risk

1. **Exit slowly.** If you have a large position, consider exiting in smaller pieces over time to avoid draining Curve's liquidity all at once.
2. **Monitor spread.** If the loop spread is still positive, you can afford to wait for better liquidity.
3. **Check preview:** Before exiting, always check the preview to see what price you will get. If the slippage is huge, wait.

## Sequencer risk

Base uses a centralized sequencer operated by Coinbase. **If the sequencer goes down, you cannot execute transactions until it comes back.**

### What happens when the sequencer is down

- You cannot open new positions
- You cannot rebalance
- You cannot exit
- You can do nothing but wait

The Base sequencer has been reliable, but it is not impossible for it to fail. This is an infrastructure-level risk you must accept.

## MEV (Miner/Builder Extractable Value) risk

Your transaction can be front-run, back-run, or reordered by block builders. This is especially risky when you open a position (when you borrow) or when you exit (when you sell).

### Examples of MEV attacks

1. **Front-running:** A searcher sees your open tx in the mempool, opens a larger position ahead of you, drives the price up, and you pay more
2. **Back-running:** A searcher sees your exit tx, waits for it to land, then dumps wstDIEM to crash the price, and you got a bad price
3. **Sandwich:** A searcher opens → you execute → they close, and you pay for their profit

### How the protocol defends against MEV

The protocol has two modes:

1. **Private Builder:** Your tx is submitted to a private builder (bloXroute) and hidden from the mempool. It lands in a block without public visibility. **This is the safest mode.**
2. **Public Mempool:** Your tx is broadcast to the public mempool. Anyone can see it and front-run it. **Use this only if you understand MEV risk.**

The app defaults to Private Builder. You can change it in settings, but **do not disable private builder mode unless you know what you are doing.**

### What to do if MEV fails

If the private builder is down or you chose public mempool:

1. **The app may show a "MEV waiver" checkbox** before you sign
2. **Enabling the waiver means you accept the MEV risk**
3. Do NOT enable the waiver unless you understand the risk

## Audit gate

**The protocol has NOT passed external security audit.** Code can have bugs. Bugs can cause you to lose money.

### What the audit gate means

1. **The contracts have been reviewed internally** but not by independent external auditors
2. **There may be undiscovered vulnerabilities** in the code
3. **The protocol may pause** at any time for emergency mitigations
4. **You should NOT put in more money than you can afford to lose**

### What happens if a vulnerability is found

The protocol has an `EmergencyGuardian` contract that can pause actions:

- **Pause Open:** No one can open new positions
- **Pause Increase:** You cannot increase leverage
- **BUT you can always Exit:** Even if the protocol is paused, you can exit and get your money out

If a vulnerability is found, the protocol will pause, a fix will be deployed, and then re-opened.

## Forced exit risk

In extreme circumstances, the protocol may be forced to exit your position automatically. This can happen if:

1. **The audit gate closes permanently** — the protocol cannot open new positions and existing positions must unwind
2. **Morpho liquidity disappears** — you cannot repay your debt
3. **An emergency is declared** — the EmergencyGuardian activates an emergency
4. **A critical bug is found** — the protocol must wind down to prevent further losses

**If your position is force-exited, you get back whatever the protocol can recover. You may lose money.**

## Vault risk

wstDIEM is a rebase-free wrapper around the Lido wstETH vault. The vault itself carries risks:

1. **Lido validator risk:** If Lido validators fail or go offline, you may lose ETH
2. **Vault contract risk:** The vault contract could have a bug
3. **Lido governance risk:** Lido may change the vault in ways that affect your returns

These are risks you take on by holding wstDIEM at all. **Looping amplifies them.**

## Summary: Risk spectrum

From lowest to highest risk:

1. **Holding wstDIEM:** You earn yield, vault and Lido risk only
2. **Opening a small loop (2x leverage):** You amplify yield, but liquidation risk is real
3. **Opening a large loop (5x+ leverage):** Liquidation is likely if the rate falls even moderately
4. **Looping in a downtrend:** You are making a leveraged bet against an unfavorable trend — maximum risk

## See also

- [What is wstDIEM Loop?](./01-what-is-wstdiem-loop.md) — background concepts
- [Quickstart](./02-quickstart.md) — step-by-step through the UI
- [Glossary](./06-glossary.md) — definitions of terms
