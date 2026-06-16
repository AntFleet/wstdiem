# Wallets

This guide covers which wallets work with wstDIEM Looping and how to set them up.

## Supported wallets

Three wallet types are supported:

1. **EOA wallets** (MetaMask, Coinbase Wallet, WalletConnect)
2. **Safe (smart contract wallet)**
3. **Coinbase Smart Wallet** (passkey-based)

## EOA wallets (MetaMask, Coinbase, etc.)

### MetaMask setup

1. Install MetaMask from metamask.io
2. Create or import your account
3. Add Base network if not already there:
   - Open MetaMask settings
   - Add Network
   - Chain ID: 8453
   - RPC: https://mainnet.base.org (or your preferred RPC)
4. Get wstDIEM on Base
5. Go to the app and click "Connect Wallet"
6. Choose "MetaMask"
7. Approve the connection

MetaMask uses ECDSA signing. Your signature is safe and only signs the action you approve.

### Coinbase Wallet setup

1. Install Coinbase Wallet from coinbase.com/wallet
2. Create or import your account
3. Make sure you are on Base network
4. Get wstDIEM
5. Go to the app and click "Connect Wallet"
6. Choose "Coinbase Wallet"
7. Approve the connection

Coinbase Wallet also uses ECDSA signing.

### WalletConnect (Other wallets)

If you use a different EOA wallet that supports WalletConnect (Ledger, Trezor, etc.):

1. Go to the app and click "Connect Wallet"
2. Choose "WalletConnect"
3. Scan the QR code with your wallet app
4. Approve the connection on your wallet

## Safe (smart contract wallet)

Safe is a smart contract wallet that requires multiple signatures to approve transactions. It is popular with teams and organizations.

### Safe setup

1. Create a Safe at safe.global
2. Deploy it on Base network
3. Get wstDIEM into your Safe
4. Go to the wstDIEM app and click "Connect Wallet"
5. Choose "Safe"
6. You will be prompted to sign in with one of the Safe owners
7. Approve the connection

### How Safe signing works

When you sign with a Safe:

1. The app generates an EIP-712 message (not a transaction)
2. The Safe app (at safe.global) displays the message for signing
3. You sign as one of the Safe owners
4. The app collects the signature(s) (depending on your Safe's threshold)
5. The app broadcasts the transaction with the collected signatures

**Important:** The EIP-1271 signature verification means the contract will check that the signature came from the Safe itself, not from a private key. This is more secure than an EOA, but it requires an extra signing step in the Safe app.

### Safe phishing defense

When you sign with Safe, you see the EIP-712 message content:

- `primaryType` — the action type (Open, Rebalance, Exit, etc.)
- `verifyingContract` — the address of LoopAuthorization or LoopForceExitAuthorizer

**Always check that the verifyingContract address matches what the UI displays.** If it doesn't, **DO NOT SIGN.**

## Coinbase Smart Wallet (Passkey-based)

Coinbase Smart Wallet is a smart contract wallet that uses passkeys (biometric or PIN) for signing instead of seed phrases.

### Coinbase Smart Wallet setup

1. Download the Coinbase Smart Wallet app or extension
2. Create an account using your passkey (Face ID, fingerprint, or PIN)
3. Fund it with wstDIEM
4. Go to the wstDIEM app
5. Click "Connect Wallet"
6. Choose "Coinbase Smart Wallet"
7. Approve the connection

### How Coinbase Smart Wallet signing works

1. The app generates an EIP-712 message
2. You approve in the Coinbase Smart Wallet app/extension using your passkey
3. The wallet submits the signature
4. The app broadcasts the transaction

Like Safe, Coinbase Smart Wallet uses EIP-1271 signature verification, so the contract will verify the signature came from the wallet contract.

### Coinbase Smart Wallet phishing defense

When you sign, you will see:

- The action type (Open, Rebalance, Exit, etc.)
- The contract address

**Always verify the contract address matches the UI display.** If something looks wrong, reject the signature.

## Comparing wallets

| Feature | MetaMask | Coinbase | Safe | CSW |
|---------|----------|----------|------|-----|
| Seed phrase | ✓ | ✓ | ✓ | ✗ |
| Passkey | ✗ | ✗ | ✗ | ✓ |
| Multi-sig | ✗ | ✗ | ✓ | ✗ |
| Hardware wallet | ✓ | ~ | ~ | ✗ |
| Mobile | ✓ | ✓ | ✓ | ✓ |
| Desktop | ✓ | ~ | ~ | ~ |

## Preimage attestation (High-risk actions)

**For Force Exit and other high-risk actions**, the protocol may require "preimage attestation" when using Smart Wallets (Safe or Coinbase Smart Wallet).

This means:

1. The app displays the full action details (amount, parameters, etc.)
2. You must confirm you have read and understood these details
3. Only then can you sign

This is an extra safety check to prevent wallet-level attacks that could hide action parameters.

If the app shows "Attestation required", read the displayed action details carefully and only proceed if everything looks correct.

## Troubleshooting

### My wallet won't connect

1. Check that you are on Base network
2. Check that your wallet supports Base
3. Try refreshing the page
4. Try disconnecting and reconnecting

### I see "EIP-1271 required" error

This means your wallet type (usually an older smart contract wallet) does not support EIP-1271 signing. Use a standard EOA wallet (MetaMask, Coinbase) or an EIP-1271-compatible smart wallet (Safe, Coinbase Smart Wallet).

### I see a "Preimage attestation" requirement

This is a safety feature for high-risk actions. Read the displayed action details carefully, confirm you understand them, and only proceed if everything looks correct.

### Transaction failed with "Invalid Signature"

1. Check that you signed the correct transaction in your wallet
2. Check that the contract address matches what the UI displayed
3. Try signing again
4. If it still fails, close the app and start over

## See also

- [Quickstart](./02-quickstart.md) — step-by-step through opening a position
- [Risk Disclosures](./03-risk-disclosures.md) — understand the risks before you sign
- [Glossary](./06-glossary.md) — definitions of technical terms
