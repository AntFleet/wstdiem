import { defineConfig, devices } from "@playwright/test";

// Two webServers: the default (5173) runs with the matched
// VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER env so authorizerNameFor()
// resolves to "LoopForceExitAuthorizer". The phishing-mismatch server
// (5174) runs with the env flipped to the LoopAuthorization address so
// authorizerNameFor() returns "LoopAuthorization" while expectedAuthorizerFor
// ("ForceExit") returns "LoopForceExitAuthorizer" → C-1 banner fires.
//
// Vite dev injects `import.meta.env.VITE_*` at request time, so flipping
// the value in the webServer.env (rather than via .env.local) is enough.
// We use `vite dev` rather than `vite preview` because preview serves a
// statically built `dist/` whose env was baked in at `vite build` time;
// the test harness needs env to be controllable per project.

const SHARED_ENV = {
  VITE_BASE_RPC_URL_1: "https://mainnet.base.org",
  VITE_BASE_RPC_URL_2: "https://base-rpc.publicnode.com",
  VITE_BASE_RPC_FAMILY_1: "publicrpc",
  VITE_BASE_RPC_FAMILY_2: "selfHostedBaseNode",
  VITE_RPC_QUORUM_THRESHOLD: "2",
  VITE_RPC_QUORUM_SIZE: "2",
  VITE_INDEXER_URL: "http://localhost:9000",
  // Non-zero pubkey so the C-2 boot check passes in dev. Tests can still
  // assert the indexer-key-warning chip is absent when this is non-zero.
  VITE_INDEXER_PUBKEY: "0x" + "11".repeat(32),
  VITE_WALLETCONNECT_PROJECT_ID: "test-placeholder",
  VITE_CHAIN_ID: "8453",
  VITE_ALLOW_SINGLE_CLIENT_READS: "true",
  VITE_PHASE_1_MARKET_IDS:
    "0xabcdef0000000000000000000000000000000000000000000000000000000001",
  VITE_CONTRACT_LOOP_REGISTRY: "0x1111111111111111111111111111111111111111",
  VITE_CONTRACT_LOOP_AUTHORIZATION:
    "0x2222222222222222222222222222222222222222",
  VITE_CONTRACT_LOOP_EXECUTOR_V2:
    "0x4444444444444444444444444444444444444444",
  VITE_CONTRACT_LOOP_FORCE_EXIT_EXECUTOR:
    "0x5555555555555555555555555555555555555555",
  VITE_CONTRACT_LOOP_ANCHOR_REGISTRY:
    "0x6666666666666666666666666666666666666666",
  VITE_CONTRACT_LOOP_RISK_ORACLE_ADAPTER:
    "0x7777777777777777777777777777777777777777",
  VITE_CONTRACT_LOOP_FEE_ROUTER:
    "0x8888888888888888888888888888888888888888",
  VITE_CONTRACT_EMERGENCY_GUARDIAN:
    "0x9999999999999999999999999999999999999999",
} as const;

export default defineConfig({
  testDir: "./tests-e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Projects:
  //   - desktop-chromium: matched env, used by every spec except phishing-mismatch
  //   - mobile-chromium: matched env, runs the screenshot suite only
  //   - phishing-mismatch-chromium: env-flipped, runs force-exit.phishing.spec.ts only
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testIgnore: ["**/force-exit.phishing.spec.ts"],
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      // Only run the screenshot suite on mobile project; full functional
      // coverage runs on desktop.
      testMatch: ["**/screenshots.spec.ts"],
    },
    {
      name: "phishing-mismatch-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://127.0.0.1:5174",
      },
      testMatch: ["**/force-exit.phishing.spec.ts"],
    },
  ],
  webServer: [
    {
      command: "npx vite dev --port 5173 --strictPort",
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...SHARED_ENV,
        // Matched authorizer — resolves to "LoopForceExitAuthorizer".
        VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER:
          "0x3333333333333333333333333333333333333333",
      },
    },
    {
      command: "npx vite dev --port 5174 --strictPort",
      port: 5174,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...SHARED_ENV,
        // Flipped: same address as LoopAuthorization, so authorizerNameFor
        // resolves to "LoopAuthorization" while expectedAuthorizerFor
        // ("ForceExit") returns "LoopForceExitAuthorizer" → banner + block.
        VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER:
          "0x2222222222222222222222222222222222222222",
      },
    },
  ],
});
