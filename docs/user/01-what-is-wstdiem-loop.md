# What is wstDIEM Loop?

This explains what wstDIEM Looping is, what you earn, and what risks you take on.

## The basic idea

wstDIEM is a yield-bearing token. When you hold wstDIEM, your balance automatically increases as the Lido wstETH vault earns staking rewards. **Looping lets you amplify this yield.**

Here's how it works:

1. **You transfer wstDIEM to the protocol.** Let's say you send 100 wstDIEM.
2. **The protocol borrows DIEM on your behalf.** Using your 100 wstDIEM as collateral, it borrows DIEM from Morpho.
3. **The protocol deposits the borrowed DIEM back into the vault.** The vault turns it into more wstDIEM.
4. **You now hold more wstDIEM and owe more DIEM.** Your position is "leveraged" — you have bigger exposure to wstDIEM yield, but you also have debt.

The difference between the yield your wstDIEM earns and the interest you pay on the borrowed DIEM is your net profit. **This is your loop spread.**

## What you earn

Loop spreads come from a simple arbitrage:

- **You earn:** The wstDIEM vault's staking yield (from Lido)
- **You pay:** The borrowing cost on Morpho
- **Your spread = earning − borrowing cost**

When the spread is positive, every day your position sits, you earn. When the spread turns negative, every day costs you money.

## What can go wrong

Three main risks:

### 1. Liquidation

If the DIEM/wstDIEM exchange rate falls too far, your position becomes "unhealthy" and anyone can liquidate you. You lose part or all of your collateral.

**How it happens:** The protocol tracks your "health factor" — a number that measures how much buffer you have before liquidation. If your health factor drops below the liquidation threshold, you are at risk.

**The warning signs:**
- The app shows your health factor in the Positions screen
- The Quickstart guide explains how to read it
- If the exchange rate moves against you significantly, your health factor drops

### 2. Oracle risk

The protocol trusts an oracle (Chainlink) to tell it what the DIEM/wstDIEM exchange rate is. If the oracle is broken, stale, or manipulated, the protocol may execute at the wrong price.

**What the protocol does:**
- It reads the Chainlink price feed
- It reads the actual vault exchange rate on-chain
- If the two disagree too much, the protocol pauses

**See also:** Risk Disclosures, Oracle section.

### 3. MEV (Miner/Builder Extractable Value)

Your transaction can be front-run or reordered by block builders. This is especially risky when you are borrowing or opening a position, because the price between when you sign and when your tx lands can move against you.

**What the protocol does:**
- It can submit your tx to a "private builder" so it is hidden until after it lands
- It can expose your tx to the public mempool
- You choose which mode you want

**See also:** Risk Disclosures, MEV section.

### 4. Audit gate

The protocol will remain paused until it passes external security audit. Do not assume the contracts are risk-free.

**See also:** Risk Disclosures, Audit gate section.

## The exchange rate matters

wstDIEM is rebase-free, so your balance in the vault doesn't automatically tick up. Instead, the exchange rate between DIEM and wstDIEM increases. 1 DIEM buys less wstDIEM over time because the vault earns rewards.

This means:

- When the exchange rate goes **up**, your position is healthy and profitable
- When the exchange rate goes **down**, your position is at risk of liquidation
- When you **exit**, you get back DIEM plus your profit (or minus your loss)

## How to get started

Read the [Quickstart](./02-quickstart.md) for a step-by-step walkthrough.

Before opening, read [Risk Disclosures](./03-risk-disclosures.md) to understand all the ways your position can be hurt.

## See also

- [Quickstart](./02-quickstart.md) — step-by-step through the UI
- [Risk Disclosures](./03-risk-disclosures.md) — detailed explanations of each risk
- [Glossary](./06-glossary.md) — definitions of terms used throughout
