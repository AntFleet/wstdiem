# Glossary

Definitions of terms you will encounter in the UI and documentation.

## Core concepts

**wstDIEM** — A yield-bearing wrapper token. When you hold wstDIEM, your balance doesn't change, but the exchange rate with DIEM improves over time (you can redeem more DIEM per wstDIEM).

**Loop / Looping** — Opening a leveraged position by borrowing DIEM against wstDIEM collateral, depositing the borrowed DIEM back into the vault to earn more wstDIEM, and repeating.

**Leverage** — Your position size as a multiple of your input. 2x leverage means you own 2x the wstDIEM you supplied. 5x means 5x.

**Collateral** — The wstDIEM you supplied to the protocol. It is locked as security for your borrowed DIEM.

**Debt** — The DIEM you borrowed from Morpho. You must repay this when you exit.

**Spread / Loop Spread** — The annual difference between the wstDIEM vault yield and the DIEM borrowing rate. Your net profit (if positive) or loss (if negative).

## Position tracking

**Health Factor** — A number that measures how safe your position is. Calculated as (Collateral Value) / (Debt Value). Above 1.0 means you have more collateral than debt. Below the liquidation threshold means your position can be liquidated.

**Liquidation** — When your health factor drops below the threshold, anyone can liquidate your position. Your collateral is sold to repay your debt, and you lose the difference.

**Liquidation Distance** — How much the exchange rate can fall before you are liquidated, expressed as a percentage.

**Leverage Multiple** — Same as leverage (above).

## Markets and pricing

**Exchange Rate** — The ratio of DIEM to wstDIEM. Increases as the wstDIEM vault earns rewards.

**Morpho** — A lending protocol on Base that supplies the debt side of your position.

**Curve** — A liquidity pool on Base. The protocol uses Curve to sell wstDIEM when you exit.

**Curve Liquidity** — The amount of wstDIEM available to trade on Curve. Low liquidity means you get a worse price when you exit.

**Slippage** — The difference between the quoted price and the actual price you execute at. Higher slippage = worse price.

**Price Impact** — How much your trade moves the price on Curve. A large exit can cause high price impact.

## Risk and safety

**Oracle / Chainlink** — A price feed that tells the protocol what the DIEM/wstDIEM exchange rate is. Chainlink is a decentralized oracle service.

**Oracle Stale / Oracle Risk** — When the oracle's price is old or broken. The protocol may reject the transaction if it detects oracle staleness.

**MEV / Miner/Builder Extractable Value** — When searchers or block builders extract value from your transaction by front-running, back-running, or reordering it.

**Private Builder / bloXroute** — A service that hides your transaction from the public mempool until it lands in a block, protecting you from MEV.

**Public Mempool** — When your transaction is broadcast publicly. Anyone can see it and potentially front-run it.

**MEV Waiver** — A checkbox you must enable if you choose public-mempool mode instead of private builder. Enabling it means you accept the MEV risk.

**Audit Gate** — A switch that gates production use. Until external audit is complete, the audit gate is closed and the protocol is in early-release mode.

**Emergency Pause** — When the protocol pauses due to a vulnerability or emergency. You can exit but not open or increase leverage.

## Contract and protocol

**LoopAuthorization** — The smart contract that verifies your signature and manages your authorization to use Morpho.

**LoopForceExitAuthorizer** — A separate contract used for force-exit actions (high-risk exits).

**LoopExecutorV2** — The contract that executes open, rebalance, and exit actions.

**LoopRegistry** — The registry that stores configuration: supported markets, vaults, addresses, and oracle settings.

**EmergencyGuardian** — A contract that can pause the protocol in emergencies.

**Solidity / Smart Contract** — Programming language used to write Ethereum smart contracts.

**EIP-712** — The signing standard the protocol uses. When you sign, you are signing an EIP-712 message, not a raw transaction.

**EIP-1271** — A standard for smart-contract wallets (like Safe) to sign messages. Proves the wallet approved the action.

## Transaction flow

**Sign** — You approve an action in your wallet. The wallet signs an EIP-712 message proving you authorized it.

**Broadcast** — The app sends the signed action to the blockchain network.

**Execution** — The transaction lands in a block and executes on-chain.

**Confirmation** — The transaction is confirmed by the network (usually 1-10 blocks later).

**Finality** — The transaction is final and irreversible (typically 10+ blocks).

**Revert** — The transaction failed and was undone. You are not charged gas (or receive a refund).

## UI elements

**Markets** — The first screen showing available markets and their spreads.

**Open Loop** — Button to open a new leveraged position.

**Loop Builder** — The panel where you enter how much you want to open.

**Preview Drawer** — The bottom panel showing your exact transaction details before you sign.

**Positions** — Screen showing your active positions.

**Rebalance** — Button to adjust your existing position's leverage.

**Exit** — Button to close your position and get back DIEM.

**Automation** — Screen for setting up automated actions (if supported).

**Evidence** — Screen showing historical events and protocol state (advanced).

## Abbreviations

**HF** — Health Factor.

**LTV** — Loan-to-Value. The ratio of your loan to your collateral.

**LLTV** — Liquidation LTV. The threshold below which you can be liquidated.

**APY** — Annual Percentage Yield.

**BPS / Basis Points** — 1/100th of a percent. 100 BPS = 1%.

**DIEM** — The base asset. wstDIEM is a wrapper around it.

**ETH / wstETH** — Ethereum and staked ETH (from Lido). The underlying assets for wstDIEM.

**EIP** — Ethereum Improvement Proposal. A standard for Ethereum protocols.

**RPC** — Remote Procedure Call. An API endpoint that communicates with the blockchain.

## See also

- [What is wstDIEM Loop?](./01-what-is-wstdiem-loop.md) — conceptual introduction
- [Risk Disclosures](./03-risk-disclosures.md) — detailed explanation of each risk
- [FAQ](./05-faq.md) — common questions and answers
