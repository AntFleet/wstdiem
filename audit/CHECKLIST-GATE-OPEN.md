# Checklist: open production audit gate (T10)

**Prerequisite:** firm report published under `audit/<date>-<firm>/` for a pinned commit SHA.

- [ ] Report PDF committed (or linked with hash) under `audit/`
- [ ] Scope matches `audit/SCOPE.md` / `SECURITY.md`
- [ ] All **Critical** findings closed in code + retested
- [ ] All **High** findings closed or written governance acceptance with residual risk
- [ ] Medium findings triaged; open Mediums listed in `docs/SECURITY-OPEN-ITEMS.md`
- [ ] Deployment manifest + addresses reviewed against audited bytecode
- [ ] `assertProductionReadiness(market)` green on target chain
- [ ] `bootstrapClosed == true`, spend allowlist enforced, fingerprints applied
- [ ] Registry owner is governance Safe (see `docs/governance/SAFE-TIMELOCK.md`)
- [ ] Governance timelock elapsed for any post-audit config batches
- [ ] On-chain / product `AUDIT_GATE_CLOSED` bit cleared via protocol ceremony
- [ ] `LAUNCH_READINESS.md` T10 marked complete with link to report path
- [ ] Keepers and public docs updated: gate open, residual risks disclosed

Until every box is checked, **do not** open leverage for real capital.
