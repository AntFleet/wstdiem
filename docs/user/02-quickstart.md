# Quickstart

This is a step-by-step walkthrough of opening, monitoring, and exiting a wstDIEM loop position via the web app.

## Before you start

- Have wstDIEM in your wallet (MetaMask, Safe, or Coinbase Smart Wallet)
- Have Base network added to your wallet
- Connect to https://app.wstdiem.example (deployed URL varies by testnet/mainnet)

## Step 1: Connect your wallet

1. Click **Connect Wallet** in the top right
2. Choose your wallet (MetaMask, Safe, or Coinbase Smart Wallet)
3. Approve the connection in your wallet
4. You should see your address in the top right

Stuck? Read [Wallets](./04-wallets.md) for wallet-specific instructions.

## Step 2: Browse markets

1. You should land on **Markets**
2. You will see one or more market cards (e.g., "DIEM/wstDIEM")
3. Each card shows:
   - Current wstDIEM/DIEM exchange rate
   - Estimated annual yield spread
   - Whether the protocol is paused or open
   - A blue **Open Loop** button

## Step 3: Click Open Loop

1. Click the **Open Loop** button on the market card
2. A panel slides in on the right side showing:
   - The amount of wstDIEM you own
   - A slider or input box to choose how much to open
   - A "leverage" display showing your multiple
   - A "preview" button

## Step 4: Read the risk disclosure

A mandatory disclosure appears. It covers:
- Liquidation risk
- Oracle risk
- The audit gate
- MEV risk

**You must read this and confirm you understand it.** Click **I Understand** to continue.

## Step 5: Preview the transaction

1. Click **Preview** (or **Next**)
2. The app fetches live quotes from Morpho and the vault
3. A drawer slides in from the bottom showing:
   - Amount of wstDIEM you are supplying
   - Amount of DIEM the protocol will borrow
   - Your new health factor
   - Your new leverage multiple
   - Estimated yield spread (annual)
   - Fee (protocol fee per §9)
   - A **Sign** button

Read these numbers carefully. **They change if the exchange rate moves while the drawer is open.** If they drift too far, the preview will time out and you will need to click **Refresh** and start over.

## Step 6: Sign the transaction

1. Click **Sign**
2. Your wallet opens a signing dialog
3. You will see the action type (`Open`) and the contract address (`LoopAuthorization`)
4. **Check the address matches the displayed name in the UI** (the UI shows "LoopAuthorization" or "LoopForceExitAuthorizer")
5. If the address or name look wrong, **DO NOT SIGN.** Close the dialog and report it
6. Sign the message in your wallet

Phishing defense: If you see an address in the signing dialog that doesn't match the contract name in the UI, stop immediately and report it to the team.

## Step 7: Broadcast the transaction

1. After signing, the app automatically broadcasts the transaction to the network
2. A spinner or progress bar appears
3. The app waits for the tx to land and confirm

This can take 5-60 seconds depending on network congestion.

## Step 8: Confirm your position opened

1. The app navigates to **Positions**
2. You should see your new position with:
   - Amount of wstDIEM collateral
   - Amount of DIEM borrowed
   - Current health factor
   - Current leverage multiple
   - A blue **Rebalance** button
   - A red **Exit** button

Congratulations! You have opened a loop position.

## Step 9: Monitor your position

1. Check **Positions** regularly
2. Watch your health factor. When it gets low (below 1.5), consider rebalancing or exiting
3. Watch the market yield spread. If it turns negative, you are losing money
4. If the protocol pauses (the app will show a banner), you can only exit, not open or increase

## Step 10: Rebalance (optional)

To improve your health factor or increase your leverage:

1. Click **Rebalance** on your position
2. Choose whether to:
   - **Increase leverage** — borrow more, supply more collateral (riskier)
   - **Improve health** — repay some debt, withdraw some collateral (safer)
3. Preview the new numbers
4. Sign and broadcast

## Step 11: Exit your position

When you want out:

1. Click **Exit** on your position
2. Choose your exit route (Curve is recommended for the best price)
3. Preview the transaction
4. You will see:
   - How much DIEM you get back
   - Your profit/loss
5. Sign and broadcast

You are now out of the loop. Any profit is sent back to your wallet. Any loss is deducted from your balance.

## Troubleshooting

### I don't see any markets

- Check that you have connected the right wallet address
- Check that you are on the Base network
- Refresh the page

### Preview times out

- The exchange rate moved while you were looking at the preview
- Click **Refresh** in the preview drawer
- Try again

### Sign dialog shows a different contract address

- **DO NOT SIGN**
- Close the dialog
- Check that you are on the official wstDIEM domain
- Report the issue to the team

### Transaction is stuck or pending

- This is usually network congestion
- Wait a few minutes and refresh
- Do not try to sign again

### My position was liquidated

- You did not rebalance in time
- The health factor dropped below the threshold
- You lost some or all of your collateral
- Read [Risk Disclosures](./03-risk-disclosures.md) for how to avoid this

## See also

- [What is wstDIEM Loop?](./01-what-is-wstdiem-loop.md) — background and concepts
- [Risk Disclosures](./03-risk-disclosures.md) — detailed explanation of each risk
- [Wallets](./04-wallets.md) — wallet-specific setup and troubleshooting
- [FAQ](./05-faq.md) — more common questions
- [Glossary](./06-glossary.md) — definitions of terms
