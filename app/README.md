# @wstdiem/app

wstDIEM v0.1.0-rc1 public web app — the evidence-backed loop cockpit implementing the public app surface.

This workspace is **scaffolded but not yet built**. The build is driven by [`docs/design/pr-16-build-prompt.md`](../docs/design/pr-16-build-prompt.md). The design source-of-truth is [`docs/design/design-sprint-synthesis.md`](../docs/design/design-sprint-synthesis.md).

## Status

Scaffold-only at v0.1.0-rc1 worktree creation. Includes:
- Vite + React 18 + TypeScript (strict).
- Tailwind v3 with dark default + light toggle (synthesis G.2).
- React Router v6 with 5 routes (Markets / Loop / Positions / Automation / Evidence).
- TanStack Query v5 with fail-closed defaults (no silent retry on RPC-quorum-degraded reads).
- Playwright 1.49 config with desktop + mobile (Pixel 7) projects.
- `.env.example` with the dual-RPC + indexer + wallet config the SDK requires.

The executor pass populates `src/chrome/`, `src/screens/`, `src/components/`, `src/hooks/`, and `tests-e2e/` per the build prompt.

## Run

```bash
cp .env.example .env.local        # fill in RPCs, indexer URL, wallet project id
npm install                       # from worktree root, npm workspaces resolves @wstdiem/sdk -> ../sdk
npm run dev                       # http://localhost:5173
npm run typecheck                 # tsc --noEmit, exit 0 required
npm run test                      # vitest unit + component tests
npm run playwright:install        # one-time chromium install
npm run playwright                # full §13.4 acceptance run
npm run screenshots               # §13.4 desktop+mobile screenshot evidence
```

## Architecture notes for the executor

- **No SSR.** Static export only (synthesis G.9). The signing surface lives entirely client-side; no server middleware to compromise.
- **SDK is the data boundary.** All reads, all builds, all signing, all gate evaluation goes through `@wstdiem/sdk`. The app does not call viem directly except inside the wallet-connect plumbing.
- **Wallet integrator: ConnectKit** (G.5 closed 2026-06-14 via research-based bake-off — see [`spike/WALLET-INTEGRATOR-DECISION.md`](spike/WALLET-INTEGRATOR-DECISION.md)). Picked over RainbowKit (close second) and Reown AppKit (instability flags) on the I-66 EIP-1271 preimage-attestation surface. Live Base Sepolia validation against real Safe + Coinbase Smart Wallet is deferred — see the decision doc for the validation backlog.
- **Fail-closed posture.** `VITE_ALLOW_SINGLE_CLIENT_READS=false` in production; `true` is dev-only.
- **No emojis in production copy.** Decorative state-pill icons (✓ ✗ ⚠ 🟢 🟡 🔴) only.

## Cross-references

- Build prompt: [`../docs/design/pr-16-build-prompt.md`](../docs/design/pr-16-build-prompt.md)
- Design synthesis: [`../docs/design/design-sprint-synthesis.md`](../docs/design/design-sprint-synthesis.md)
- Spec: [`../the protocol spec.md`](../the protocol spec.md) §6.3, §6.4, §6.5, §7.1, §10, §13.4, §13.5
- SDK: [`../sdk/src/sdk.ts`](../sdk/src/sdk.ts)
- Adjacent research: [`../docs/research/adjacent-defi-ui-ux.md`](../docs/research/adjacent-defi-ui-ux.md)
