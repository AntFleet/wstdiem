// PR-17 Gap 3 regression tests. Locks the canonical address surface +
// authorizerNameFor helper. Covers:
//   - SDK construction with non-zero contracts populates `sdk.contracts`
//     verbatim and freezes the object so post-construction mutation throws.
//   - Any zero address in any required field throws
//     ContractsConfigInvalid at construction time.
//   - authorizerNameFor returns "LoopAuthorization" / "LoopForceExitAuthorizer"
//     / "UNRECOGNIZED" per the resolved verifyingContract.
//   - The follow-up commit on phase-d/pr-16-app removes
//     app/src/lib/contracts.ts in favor of routing through this surface.

import { describe, expect, it } from "vitest";
import { createSdk } from "../src/live/sdk-impl.js";
import { asChainId } from "../src/types/branded.js";
import { FakePublicClient, fakeFetch } from "./live-helpers.js";
import type { MarketAddressBundle } from "../src/live/config.js";

const LOOP_REGISTRY = "0x0000000000000000000000000000000000000101" as const;
const LOOP_AUTH = "0x0000000000000000000000000000000000000102" as const;
const LOOP_FORCE_EXIT_AUTH = "0x0000000000000000000000000000000000000103" as const;
const LOOP_EXEC_V2 = "0x0000000000000000000000000000000000000104" as const;
const LOOP_FORCE_EXEC = "0x0000000000000000000000000000000000000105" as const;
const LOOP_ANCHOR_REGISTRY = "0x0000000000000000000000000000000000000106" as const;
const LOOP_RISK_ORACLE_ADAPTER = "0x0000000000000000000000000000000000000107" as const;
const LOOP_FEE_ROUTER = "0x0000000000000000000000000000000000000108" as const;
const EMERGENCY_GUARDIAN = "0x0000000000000000000000000000000000000109" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const MARKET = ("0x" + "ab".repeat(32)) as `0x${string}`;
const MORPHO = "0x0000000000000000000000000000000000000201" as const;
const VAULT = "0x0000000000000000000000000000000000000202" as const;
const FLASH_POOL = "0x0000000000000000000000000000000000000203" as const;
const SEQUENCER_FEED = "0x0000000000000000000000000000000000000204" as const;
const LOAN_TOKEN = "0x0000000000000000000000000000000000000301" as const;
const COLLATERAL_TOKEN = "0x0000000000000000000000000000000000000302" as const;

const BUNDLE: MarketAddressBundle = {
  marketId: MARKET,
  morpho: MORPHO,
  vault: VAULT,
  loanToken: LOAN_TOKEN,
  collateralToken: COLLATERAL_TOKEN,
  uniswapV3FlashPool: FLASH_POOL,
  sequencerUptimeFeed: SEQUENCER_FEED,
};

const VALID_CONTRACTS = {
  loopRegistry: LOOP_REGISTRY,
  loopAuthorization: LOOP_AUTH,
  loopForceExitAuthorizer: LOOP_FORCE_EXIT_AUTH,
  loopExecutorV2: LOOP_EXEC_V2,
  loopForceExitExecutor: LOOP_FORCE_EXEC,
  loopAnchorRegistry: LOOP_ANCHOR_REGISTRY,
  loopRiskOracleAdapter: LOOP_RISK_ORACLE_ADAPTER,
  loopFeeRouter: LOOP_FEE_ROUTER,
  emergencyGuardian: EMERGENCY_GUARDIAN,
};

function buildSdk(extra?: Partial<Parameters<typeof createSdk>[0]>) {
  const fake = new FakePublicClient({
    blockNumber: 1_500_000n,
    handlers: {},
  });
  return createSdk({
    chainId: asChainId(8453),
    publicClient: fake.asPublicClient(),
    indexerBaseUrl: "http://indexer.test",
    fetch: fakeFetch({ get: {} }),
    contracts: VALID_CONTRACTS,
    initialMarkets: [BUNDLE],
    strictAnchorCrossCheck: false,
    allowSingleClientReads: true,
    ...extra,
  });
}

describe("PR-17 Gap 3: sdk.contracts surface", () => {
  it("exposes every configured address verbatim via sdk.contracts", () => {
    const sdk = buildSdk();
    expect(sdk.contracts.loopRegistry).toBe(LOOP_REGISTRY);
    expect(sdk.contracts.loopAuthorization).toBe(LOOP_AUTH);
    expect(sdk.contracts.loopForceExitAuthorizer).toBe(LOOP_FORCE_EXIT_AUTH);
    expect(sdk.contracts.loopExecutorV2).toBe(LOOP_EXEC_V2);
    expect(sdk.contracts.loopForceExitExecutor).toBe(LOOP_FORCE_EXEC);
    expect(sdk.contracts.loopAnchorRegistry).toBe(LOOP_ANCHOR_REGISTRY);
    expect(sdk.contracts.loopRiskOracleAdapter).toBe(LOOP_RISK_ORACLE_ADAPTER);
    expect(sdk.contracts.loopFeeRouter).toBe(LOOP_FEE_ROUTER);
    expect(sdk.contracts.emergencyGuardian).toBe(EMERGENCY_GUARDIAN);
  });

  it("freezes the contracts surface so post-construction mutation does not change SDK state", () => {
    const sdk = buildSdk();
    const target = sdk.contracts as unknown as Record<string, string>;
    expect(() => {
      target.loopAuthorization = ZERO;
    }).toThrow();
    expect(sdk.contracts.loopAuthorization).toBe(LOOP_AUTH);
  });
});

describe("PR-17 Gap 3: ContractsConfigInvalid fail-closed", () => {
  for (const field of Object.keys(VALID_CONTRACTS) as Array<keyof typeof VALID_CONTRACTS>) {
    it(`throws ContractsConfigInvalid when ${field} is the zero address`, () => {
      const broken = { ...VALID_CONTRACTS, [field]: ZERO };
      expect(() =>
        buildSdk({ contracts: broken } as Partial<Parameters<typeof createSdk>[0]>),
      ).toThrow(/ContractsConfigInvalid/);
    });
  }

  it("throws when contracts is undefined", () => {
    expect(() =>
      buildSdk({ contracts: undefined as unknown as typeof VALID_CONTRACTS }),
    ).toThrow(/ContractsConfigInvalid/);
  });

  it("lists every missing field in the error message", () => {
    const broken = {
      ...VALID_CONTRACTS,
      loopRegistry: ZERO,
      loopAuthorization: ZERO,
    };
    expect(() =>
      buildSdk({ contracts: broken } as Partial<Parameters<typeof createSdk>[0]>),
    ).toThrow(/loopRegistry.*loopAuthorization/);
  });
});

describe("PR-17 Gap 3: authorizerNameFor", () => {
  it("returns LoopAuthorization for the registered loopAuthorization address", () => {
    const sdk = buildSdk();
    expect(sdk.authorizerNameFor(LOOP_AUTH)).toBe("LoopAuthorization");
  });

  it("returns LoopForceExitAuthorizer for the registered loopForceExitAuthorizer address", () => {
    const sdk = buildSdk();
    expect(sdk.authorizerNameFor(LOOP_FORCE_EXIT_AUTH)).toBe(
      "LoopForceExitAuthorizer",
    );
  });

  it("returns UNRECOGNIZED for an attacker-substituted address that matches neither", () => {
    const sdk = buildSdk();
    const HOSTILE = "0x000000000000000000000000000000000000dead" as const;
    expect(sdk.authorizerNameFor(HOSTILE)).toBe("UNRECOGNIZED");
  });

  it("returns UNRECOGNIZED for the zero address", () => {
    const sdk = buildSdk();
    expect(sdk.authorizerNameFor(ZERO)).toBe("UNRECOGNIZED");
  });

  it("is case-insensitive on the supplied verifyingContract", () => {
    const sdk = buildSdk();
    const upper = LOOP_AUTH.toUpperCase().replace("0X", "0x");
    expect(sdk.authorizerNameFor(upper as `0x${string}`)).toBe(
      "LoopAuthorization",
    );
  });
});
