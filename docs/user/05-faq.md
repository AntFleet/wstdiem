# FAQ

Answers to the most common questions.

## Opening and closing positions

### What's the minimum amount I can open?

There is no hard minimum, but the transaction fee (gas + protocol fee) makes very small positions uneconomical. Start with at least a few hundred DIEM worth of wstDIEM.

### Can I change my position after I open it?

Yes. You can rebalance (adjust your leverage), or exit whenever you want. Just click the Rebalance or Exit button on the Positions screen.

### What if my wallet disconnects mid-sign?

If you disconnect before signing, the transaction is cancelled and nothing happens. Reconnect and try again.

If you disconnect after signing but before broadcast, the signature is wasted. You can try broadcasting again, but you will need to sign a new transaction.

### How long does it take to open a position?

Usually 5-60 seconds. It depends on network congestion and how long it takes for your transaction to be included in a block.

### Can I open multiple positions?

Yes, you can open positions in different markets. You can also open multiple positions in the same market (though the UI might not show them separately).

## Rebalancing

### Why would I rebalance?

Two reasons:

1. **Improve health:** If your health factor is dropping, you can rebalance to lower your leverage (repay debt, withdraw collateral).
2. **Increase leverage:** If the spread is good and you want more exposure, you can rebalance to increase your leverage (borrow more, supply more collateral).

### Is rebalancing safe?

It is as safe as opening. You sign a message, and the protocol executes the rebalance in one atomic transaction. If something goes wrong, it reverts and you keep your original position.

## Risk and monitoring

### What health factor should I target?

A health factor above 2.0 is comfortable. Between 1.5 and 2.0 is okay if you are actively monitoring. Below 1.5, you should seriously consider reducing your leverage.

### How often should I check my position?

At least daily, especially if your health factor is low. The exchange rate can move fast, and you want to see it coming.

### What does "Indexer signature verification disabled (dev only)" mean?

This is a development-mode warning. In production, the SDK verifies that the indexer's response is correctly signed. In dev, this check is disabled for testing. **Do not use this warning to justify trusting dev-mode data in production.**

### Why is my Exit button red?

The red color just indicates it is a risky action (you are closing a leveraged position). Click it to exit when you are ready.

### What happens if the protocol pauses?

When the protocol pauses (due to a vulnerability or emergency):

1. You **cannot open** new positions
2. You **cannot increase** leverage
3. You **can exit** and get your money out
4. You **can rebalance to reduce leverage** (health-recovery mode only)

The paused state is shown as a red banner on the app. Pauses are temporary while a fix is deployed and audited.

## Fees and yield

### What fees do I pay?

Two fees:

1. **Protocol fee** — a small percentage of your position, per §9. Shown in the preview before you sign.
2. **Gas fee** — the network fee for your transaction. Varies with Base network congestion.

There is no exit fee or rebalance fee.

### How is my yield calculated?

Your yield comes from the difference between:

- **What you earn:** The wstDIEM vault's annual yield (from Lido staking rewards)
- **What you pay:** The annual borrowing rate on Morpho

The app shows the estimated spread in the Markets screen.

### Can the spread turn negative?

Yes. If borrowing rates rise higher than the vault yield, the spread becomes negative and you lose money every day. **Monitor the spread and exit if it turns negative.**

## Signing and security

### Why does the app ask me to sign?

Signing proves you authorized the action. The signature is cryptographic proof that:

1. You own the wallet
2. You approve the specific action (open, rebalance, exit)
3. You accept the terms of the action

Without your signature, no one can execute transactions on your behalf.

### What if I see a different contract address in the signing dialog?

**DO NOT SIGN.** This indicates a phishing attack or misconfiguration. Close the dialog immediately and report it to the team. The UI should always display the contract name (e.g., "LoopAuthorization") and it should match the address in the signing dialog.

### Is my seed phrase ever exposed?

No. The signing happens inside your wallet. The wstDIEM app never sees your seed phrase or private keys.

### Can I revoke access later?

Yes. You can revoke your authorization in the Automation screen (if you created an automation policy). If you just signed one-time transactions, nothing to revoke — the signatures are one-time only.

## Audit and safety

### Has the protocol been audited?

Not yet by external auditors. The code has been internally reviewed and tested. External audit is planned before production launch. **Do not assume the protocol is bug-free.**

### What happens if a bug is found?

1. The protocol pauses to prevent further losses
2. The team deploys a fix
3. External auditors review the fix
4. The protocol re-opens

If your position is active when a pause happens, you can still exit and recover your funds (though they may be worth less if a bug caused losses).

### What is the audit gate?

The audit gate is a contract switch that must be unlocked by the team before production use. Until external audit is complete, the gate remains closed and the protocol cannot be fully opened.

## Troubleshooting

### My preview times out

The exchange rate moved while you were looking at the preview. Click Refresh and try again.

### I got an error "QuoteStale"

The quote is too old. This can happen if:

1. The network is very congested
2. The exchange rate moved too much
3. There is low Morpho or Curve liquidity

Refresh and try again.

### I got an error "HealthFactorBoundFailure"

Your position would be unhealthy after the transaction. This can happen if you are trying to borrow too much or increase leverage too aggressively. Try a smaller increase.

### My transaction reverted

The transaction failed for some reason. The most common reasons:

1. **Insufficient collateral** — you don't have enough wstDIEM
2. **Quote drift** — the exchange rate moved too much between preview and execution
3. **Morpho liquidity** — Morpho doesn't have enough DIEM to lend
4. **Audit gate closed** — the protocol paused

Check the error message in the app. If it says "AuditGateClosed", the protocol is paused and you can only exit.

## See also

- [Quickstart](./02-quickstart.md) — step-by-step through the UI
- [Risk Disclosures](./03-risk-disclosures.md) — detailed risk explanations
- [Wallets](./04-wallets.md) — wallet setup and troubleshooting
- [Glossary](./06-glossary.md) — definitions of terms
