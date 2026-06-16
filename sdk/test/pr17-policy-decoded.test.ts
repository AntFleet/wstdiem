// PR-17 Gap 5 regression tests. Locks the decodeAcknowledgedRisks /
// decodeMevWaiverBits helpers (the bit-name maps that move from
// app/src/lib/risk-bits.ts to the SDK's source-of-truth) and the
// acknowledgedRisks field surface on Policy returned from
// getAutomationPolicies.

import { describe, expect, it } from "vitest";
import {
  decodeAcknowledgedRisks,
  decodeMevWaiverBits,
  ForceExitRiskBit,
  MevWaiverBit,
} from "../src/types/enums.js";
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

const MARKET = ("0x" + "ab".repeat(32)) as `0x${string}`;
const MORPHO = "0x0000000000000000000000000000000000000201" as const;
const VAULT = "0x0000000000000000000000000000000000000202" as const;
const FLASH_POOL = "0x0000000000000000000000000000000000000203" as const;
const SEQUENCER_FEED = "0x0000000000000000000000000000000000000204" as const;
const LOAN_TOKEN = "0x0000000000000000000000000000000000000301" as const;
const COLLATERAL_TOKEN = "0x0000000000000000000000000000000000000302" as const;
const OWNER = "0x0000000000000000000000000000000000000abc" as const;

const BUNDLE: MarketAddressBundle = {
  marketId: MARKET,
  morpho: MORPHO,
  vault: VAULT,
  loanToken: LOAN_TOKEN,
  collateralToken: COLLATERAL_TOKEN,
  uniswapV3FlashPool: FLASH_POOL,
  sequencerUptimeFeed: SEQUENCER_FEED,
};

describe("PR-17 Gap 5: decodeAcknowledgedRisks", () => {
  it("returns empty known list and zero unknownMask for the zero mask", () => {
    const out = decodeAcknowledgedRisks(0);
    expect(out.known).toEqual([]);
    expect(out.unknownMask).toBe(0);
  });

  it("decodes a single set bit to its named descriptor", () => {
    const out = decodeAcknowledgedRisks(ForceExitRiskBit.STALE_ORACLE_OVERRIDE);
    expect(out.known).toHaveLength(1);
    expect(out.known[0]?.name).toBe("STALE_ORACLE_OVERRIDE");
    expect(out.known[0]?.bit).toBe(ForceExitRiskBit.STALE_ORACLE_OVERRIDE);
    expect(out.known[0]?.plainLanguage.length).toBeGreaterThan(0);
    expect(out.unknownMask).toBe(0);
  });

  it("decodes every named ForceExitRiskBit individually", () => {
    const bits = [
      { bit: ForceExitRiskBit.LOOSE_SLIPPAGE, name: "LOOSE_SLIPPAGE" },
      {
        bit: ForceExitRiskBit.STALE_ORACLE_OVERRIDE,
        name: "STALE_ORACLE_OVERRIDE",
      },
      {
        bit: ForceExitRiskBit.INSUFFICIENT_CURVE_DEPTH,
        name: "INSUFFICIENT_CURVE_DEPTH",
      },
      {
        bit: ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE,
        name: "SEQUENCER_DOWN_OVERRIDE",
      },
      {
        bit: ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE,
        name: "VAULT_EVIDENCE_OVERRIDE",
      },
    ];
    for (const { bit, name } of bits) {
      const out = decodeAcknowledgedRisks(bit);
      expect(out.known).toHaveLength(1);
      expect(out.known[0]?.name).toBe(name);
      expect(out.unknownMask).toBe(0);
    }
  });

  it("decodes a combo mask into multiple ordered entries", () => {
    const mask =
      ForceExitRiskBit.LOOSE_SLIPPAGE |
      ForceExitRiskBit.SEQUENCER_DOWN_OVERRIDE |
      ForceExitRiskBit.VAULT_EVIDENCE_OVERRIDE;
    const out = decodeAcknowledgedRisks(mask);
    expect(out.known).toHaveLength(3);
    const names = out.known.map((d) => d.name);
    expect(names).toContain("LOOSE_SLIPPAGE");
    expect(names).toContain("SEQUENCER_DOWN_OVERRIDE");
    expect(names).toContain("VAULT_EVIDENCE_OVERRIDE");
    expect(names).not.toContain("STALE_ORACLE_OVERRIDE");
    expect(out.unknownMask).toBe(0);
  });

  it("surfaces bits outside the known ForceExitRiskBit set via unknownMask", () => {
    // Bit 5 (0x20), bit 6 (0x40), bit 7 (0x80) are not known ForceExitRiskBits.
    const out = decodeAcknowledgedRisks(0b1000_0000);
    expect(out.known).toEqual([]);
    expect(out.unknownMask).toBe(0b1000_0000);
  });

  it("decodes mixed mask: known LOOSE_SLIPPAGE + unknown bit 5 surfaces both", () => {
    // PR-17 audit m-do-1: poisoned action sets bit 5 alongside LOOSE_SLIPPAGE;
    // UI must see both signals so it can fail-closed rather than silently
    // dropping the surplus.
    const mask = ForceExitRiskBit.LOOSE_SLIPPAGE | 0b0010_0000; // bit 5
    const out = decodeAcknowledgedRisks(mask);
    expect(out.known).toHaveLength(1);
    expect(out.known[0]?.name).toBe("LOOSE_SLIPPAGE");
    expect(out.unknownMask).toBe(0b0010_0000);
  });
});

describe("PR-17 Gap 5: decodeMevWaiverBits", () => {
  it("returns empty known list and zero unknownMask for the zero mask", () => {
    const out = decodeMevWaiverBits(0);
    expect(out.known).toEqual([]);
    expect(out.unknownMask).toBe(0);
  });

  it("decodes every named MevWaiverBit individually", () => {
    const bits = [
      {
        bit: MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN,
        name: "PUBLIC_MEMPOOL_OPT_IN",
      },
      {
        bit: MevWaiverBit.SEQUENCER_DIRECT_FALLBACK_OPT_IN,
        name: "SEQUENCER_DIRECT_FALLBACK_OPT_IN",
      },
      {
        bit: MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN,
        name: "BUILDER_KEY_OUTAGE_OPT_IN",
      },
    ];
    for (const { bit, name } of bits) {
      const out = decodeMevWaiverBits(bit);
      expect(out.known).toHaveLength(1);
      expect(out.known[0]?.name).toBe(name);
      expect(out.known[0]?.plainLanguage.length).toBeGreaterThan(0);
      expect(out.unknownMask).toBe(0);
    }
  });

  it("decodes a combo mask into the expected ordered descriptors", () => {
    const mask =
      MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN |
      MevWaiverBit.BUILDER_KEY_OUTAGE_OPT_IN;
    const out = decodeMevWaiverBits(mask);
    expect(out.known).toHaveLength(2);
    const names = out.known.map((d) => d.name);
    expect(names).toContain("PUBLIC_MEMPOOL_OPT_IN");
    expect(names).toContain("BUILDER_KEY_OUTAGE_OPT_IN");
    expect(names).not.toContain("SEQUENCER_DIRECT_FALLBACK_OPT_IN");
    expect(out.unknownMask).toBe(0);
  });

  it("surfaces unknown MEV waiver bits via unknownMask", () => {
    // Bit 4 (0x10) is not a known MevWaiverBit.
    const mask = MevWaiverBit.PUBLIC_MEMPOOL_OPT_IN | 0b0001_0000;
    const out = decodeMevWaiverBits(mask);
    expect(out.known).toHaveLength(1);
    expect(out.known[0]?.name).toBe("PUBLIC_MEMPOOL_OPT_IN");
    expect(out.unknownMask).toBe(0b0001_0000);
  });
});

describe("PR-17 Gap 5: Policy.acknowledgedRisks surface", () => {
  it("populates acknowledgedRisks on FORCE_EXIT policies", async () => {
    const fake = new FakePublicClient({
      blockNumber: 1_500_000n,
      handlers: {},
    });
    const sdk = createSdk({
      chainId: asChainId(8453),
      publicClient: fake.asPublicClient(),
      indexerBaseUrl: "http://indexer.test",
      fetch: fakeFetch({
        get: {
          "/policies": {
            policies: [
              {
                owner: OWNER,
                policyId: "1",
                primaryType: 3, // ForceExit
                policyHash: "0x" + "aa".repeat(32),
                policyClass: 5, // FORCE_EXIT
                createdBlock: "100",
                expiryBlock: "1000",
                state: "active",
              },
            ],
          },
        },
      }),
      contracts: {
        loopRegistry: LOOP_REGISTRY,
        loopAuthorization: LOOP_AUTH,
        loopForceExitAuthorizer: LOOP_FORCE_EXIT_AUTH,
        loopExecutorV2: LOOP_EXEC_V2,
        loopForceExitExecutor: LOOP_FORCE_EXEC,
        loopAnchorRegistry: LOOP_ANCHOR_REGISTRY,
        loopRiskOracleAdapter: LOOP_RISK_ORACLE_ADAPTER,
        loopFeeRouter: LOOP_FEE_ROUTER,
        emergencyGuardian: EMERGENCY_GUARDIAN,
      },
      initialMarkets: [BUNDLE],
      strictAnchorCrossCheck: false,
      allowSingleClientReads: true,
    });
    const policies = await sdk.getAutomationPolicies(OWNER);
    expect(policies).toHaveLength(1);
    const force = policies[0];
    expect(force?.policyClass).toBe("FORCE_EXIT");
    // PR-17: acknowledgedRisks field is present on FORCE_EXIT policies. The
    // PR-10 indexer does not yet project the actual bits — default 0.
    expect(force?.acknowledgedRisks).toBe(0);
    // Decoding the zero mask yields an empty known list and zero unknownMask —
    // the app's PolicyRow dropper can rely on this without throwing.
    const decoded = decodeAcknowledgedRisks(force?.acknowledgedRisks ?? 0);
    expect(decoded.known).toEqual([]);
    expect(decoded.unknownMask).toBe(0);
  });

  it("does NOT populate acknowledgedRisks on non-force-exit policies", async () => {
    const fake = new FakePublicClient({
      blockNumber: 1_500_000n,
      handlers: {},
    });
    const sdk = createSdk({
      chainId: asChainId(8453),
      publicClient: fake.asPublicClient(),
      indexerBaseUrl: "http://indexer.test",
      fetch: fakeFetch({
        get: {
          "/policies": {
            policies: [
              {
                owner: OWNER,
                policyId: "2",
                primaryType: 0, // Open
                policyHash: "0x" + "bb".repeat(32),
                policyClass: 0, // OPEN
                createdBlock: "100",
                expiryBlock: "1000",
                state: "active",
              },
            ],
          },
        },
      }),
      contracts: {
        loopRegistry: LOOP_REGISTRY,
        loopAuthorization: LOOP_AUTH,
        loopForceExitAuthorizer: LOOP_FORCE_EXIT_AUTH,
        loopExecutorV2: LOOP_EXEC_V2,
        loopForceExitExecutor: LOOP_FORCE_EXEC,
        loopAnchorRegistry: LOOP_ANCHOR_REGISTRY,
        loopRiskOracleAdapter: LOOP_RISK_ORACLE_ADAPTER,
        loopFeeRouter: LOOP_FEE_ROUTER,
        emergencyGuardian: EMERGENCY_GUARDIAN,
      },
      initialMarkets: [BUNDLE],
      strictAnchorCrossCheck: false,
      allowSingleClientReads: true,
    });
    const policies = await sdk.getAutomationPolicies(OWNER);
    expect(policies).toHaveLength(1);
    const open = policies[0];
    expect(open?.policyClass).toBe("OPEN");
    expect(open?.acknowledgedRisks).toBeUndefined();
  });
});
