# wstDIEM — post-launch handoff (2026-08-18)

**Status:** Base Sepolia testnet is **usable**. Issue #13 is shipped. A healthy
loop opened and its debt was repaid through the SDK.

## Live deploy

See `script/v2/configs/base-sepolia.json` `_deployment` (`status: live`).
Chain 84532. Owner/governance `0xb41891318Be43D2A966f574BaFC52D0a501Db96A`.

Launch txs:
- OPEN `0x536b042e2267ffa5a65de1f0fd88124ea883e2aa3190c47325d876d8704e60c3`
- EXIT `0x65db696d1e19b5cb11a7f724b7bc41d35a4627027c3c45aacb73eee98a5cb2b4`

## App

`app/.env.local` is pointed at this deploy (gitignored), including
`VITE_MARKET_*` venues so `createSdk({ initialMarkets })` can build Open/Exit.
Wallet config follows `VITE_CHAIN_ID` (84532 = Base Sepolia). Loop Builder
requires wstDIEM approve → executor before preview/sign.

Set a real `VITE_WALLETCONNECT_PROJECT_ID` for mobile WalletConnect pairing.

## Indexer

`indexer/.env` start block `45632710`. Restart with a fresh
`data/indexer-sepolia.db` after any address change.

## Not next

External audit (T10), real Morpho/wstDIEM, automation, fee routing.
