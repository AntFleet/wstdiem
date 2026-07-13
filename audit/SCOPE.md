# External audit scope pin

**Document type:** pre-engagement scope (not a firm SOW)  
**Protocol:** wstDIEM Protocol v6  
**Repository:** this monorepo (`@antfleet/wstdiem-protocol`)

## Objectives

Independent review of leveraged loop primitives on Base: open / rebalance / exit / force-exit, authorization digests, registry integrity, evidence model, indexer trust, SDK fail-closed posture.

## In scope

| Area | Paths |
|------|--------|
| Core contracts | `contracts/v2/*.sol`, `interfaces/`, `libraries/` |
| Deploy | `script/v2/Deploy.s.sol`, `DeploymentManifest.sol`, `MockDeploymentKit.sol` |
| Indexer | `indexer/src/**` |
| Anchor submitter | `anchor/**` |
| SDK | `sdk/src/**` |
| Web app | `app/src/**` (sign/preview/force-exit paths) |

## Threat themes (from internal audits)

1. Morpho debt denomination (shares vs assets) on exit
2. Registry admin blast radius / timelock completeness
3. Evidence set membership + freshness fail-closed
4. Anchor reorg / blockhash consistency
5. Force-exit waiver minimality (I-67)
6. Indexer ABI/topic0 parity and signed reads
7. Oracle scale normalization (Morpho 1e36 / Chainlink 1e8 / WAD HF)
8. RPC quorum independence (I-68)
9. Spender allowlist always-on after bootstrap

## Out of scope

- External venue code (Morpho Blue, Curve, Uniswap V3, Chainlink, Base sequencer)
- Compromised governance / guardian / indexer key assumptions
- Phase G multi-chain / emissions / gauges
- Loop-manager operator tool repo (`wstdiem` CLI) unless separately engaged

## Commit pin

Engagement must pin:

```
git rev-parse HEAD
forge --version
```

and list deployed addresses if any testnet is in scope.

## Deliverables expected from firm

1. Written report (PDF) with severity taxonomy Critical/High/Medium/Low/Info  
2. Finding IDs reproducible against the pinned SHA  
3. Explicit statement on residual risk if any Critical/High deferred  
