# External audit artifacts

**Status:** pre-audit process scaffolding. **No third-party firm report is published yet.**

This directory will hold formal external audit reports once a firm engagement completes. Until then, files here are **process artifacts only** — they do **not** constitute an audit or close the production audit gate (`LAUNCH_READINESS.md` T10 / `PROTOCOL.md` §5.4).

## Expected layout (after firm delivery)

```
audit/
  README.md                 # this file
  SCOPE.md                  # engagement scope pin
  CHECKLIST-GATE-OPEN.md    # steps to open the gate after sign-off
  templates/                # finding trackers, disclosure drafts
  YYYY-MM-DD-<firm>/        # one folder per engagement
    report.pdf              # firm deliverable
    findings.csv            # optional machine-readable
    commit-sha.txt          # git SHA in scope
    scope-notes.md
```

## In-scope surface (see also `SECURITY.md`)

- `contracts/v2/**`
- `script/v2/Deploy*.sol`, `DeploymentManifest.sol`, configs
- `indexer/`, `anchor/`, `sdk/`, `app/`

Out of scope: Morpho/Curve/Uniswap/Chainlink/Base sequencer as upstream dependencies; Phase G expansions.

## Gate policy

The on-chain / product **audit gate remains CLOSED** until:

1. Firm report is published under `audit/<date>-<firm>/`
2. All Critical/High findings are remediated or explicitly accepted with governance record
3. Governance completes the protocol re-open ceremony (timelock + gate bit clear)

Do **not** point production capital at deployments before that.
