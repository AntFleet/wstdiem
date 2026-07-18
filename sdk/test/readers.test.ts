import { describe, it, expect } from "vitest";
import { RegistryReader, AuthorizationReader, MorphoReader, ChainlinkReader, SequencerFeedReader, VaultReader } from "../src/live/readers/index.js";
import { FakePublicClient } from "./live-helpers.js";

const LOOP_REGISTRY = "0x0000000000000000000000000000000000000101" as const;
const LOOP_AUTH = "0x0000000000000000000000000000000000000102" as const;
const MORPHO = "0x0000000000000000000000000000000000000103" as const;
const CHAINLINK = "0x0000000000000000000000000000000000000104" as const;
const SEQUENCER = "0x0000000000000000000000000000000000000105" as const;
const VAULT = "0x0000000000000000000000000000000000000106" as const;
const MARKET = ("0x" + "11".repeat(32)) as `0x${string}`;
const OWNER = "0x0000000000000000000000000000000000000abc" as const;

describe("RegistryReader", () => {
  it("reads registryVersion + registryMerkleRoot + supportedMarket", async () => {
    const fake = new FakePublicClient({
      handlers: {
        registryVersion: () => 42n,
        registryMerkleRoot: () => "0xdead".padEnd(66, "0"),
        supportedMarket: (args) => args[0] === MARKET,
      },
    });
    const reader = new RegistryReader(fake.asPublicClient(), LOOP_REGISTRY);
    expect(await reader.registryVersion()).toBe(42n);
    expect(await reader.registryMerkleRoot()).toBe("0xdead".padEnd(66, "0"));
    expect(await reader.supportedMarket(MARKET as never)).toBe(true);
  });

  it("reads marketParams tuple", async () => {
    const fake = new FakePublicClient({
      handlers: {
        marketParams: () => ({
          loanToken: "0x0000000000000000000000000000000000000a01",
          collateralToken: "0x0000000000000000000000000000000000000a02",
          oracle: "0x0000000000000000000000000000000000000a03",
          irm: "0x0000000000000000000000000000000000000a04",
          lltv: 800000000000000000n,
        }),
      },
    });
    const reader = new RegistryReader(fake.asPublicClient(), LOOP_REGISTRY);
    const p = await reader.marketParams(MARKET as never);
    expect(p.lltv).toBe(800000000000000000n);
  });

  it("reads canonicalSource by sourceId label", async () => {
    const fake = new FakePublicClient({
      handlers: {
        canonicalSource: (args) => {
          expect(typeof args[0]).toBe("string");
          expect(typeof args[1]).toBe("string");
          return "0x0000000000000000000000000000000000000a10";
        },
      },
    });
    const reader = new RegistryReader(fake.asPublicClient(), LOOP_REGISTRY);
    const addr = await reader.canonicalSource(MARKET as never, "morpho-position");
    expect(addr).toBe("0x0000000000000000000000000000000000000a10");
  });

  it("reads validateExternalConfig per primaryType", async () => {
    const fake = new FakePublicClient({
      handlers: {
        validateExternalConfig: (args) => Number(args[1]) === 0, // only Open=0 is valid
      },
    });
    const reader = new RegistryReader(fake.asPublicClient(), LOOP_REGISTRY);
    expect(await reader.validateExternalConfig(MARKET as never, "Open")).toBe(true);
    expect(await reader.validateExternalConfig(MARKET as never, "Rebalance")).toBe(false);
  });
});

describe("AuthorizationReader", () => {
  it("reads domainSeparator", async () => {
    const fake = new FakePublicClient({
      handlers: { domainSeparator: () => "0xabba".padEnd(66, "0") },
    });
    const reader = new AuthorizationReader(fake.asPublicClient(), LOOP_AUTH);
    expect(await reader.domainSeparator()).toBe("0xabba".padEnd(66, "0"));
  });

  it("isNonceUsed extracts the right bit from the bitmap", async () => {
    const fake = new FakePublicClient({
      handlers: {
        nonceBitmap: () => 0b1011n,
      },
    });
    const reader = new AuthorizationReader(fake.asPublicClient(), LOOP_AUTH);
    expect(await reader.isNonceUsed(OWNER, 1n, "Open", 0n, 0)).toBe(true);
    expect(await reader.isNonceUsed(OWNER, 1n, "Open", 0n, 1)).toBe(true);
    expect(await reader.isNonceUsed(OWNER, 1n, "Open", 0n, 2)).toBe(false);
    expect(await reader.isNonceUsed(OWNER, 1n, "Open", 0n, 3)).toBe(true);
  });

  it("reads policyHash + policyRevocationBlock + acceptsThirdPartyRepay", async () => {
    const fake = new FakePublicClient({
      handlers: {
        policyHash: () => "0xbeef".padEnd(66, "0"),
        policyRevocationBlock: () => 0n,
        acceptsThirdPartyRepay: () => true,
      },
    });
    const reader = new AuthorizationReader(fake.asPublicClient(), LOOP_AUTH);
    expect(await reader.policyHash(OWNER, 1n)).toBe("0xbeef".padEnd(66, "0"));
    expect(await reader.policyRevocationBlock(OWNER, 1n)).toBe(0n);
    expect(await reader.acceptsThirdPartyRepay(OWNER, 1n)).toBe(true);
  });
});

describe("MorphoReader", () => {
  it("reads position tuple", async () => {
    const fake = new FakePublicClient({
      handlers: {
        position: () => [10n, 5n, 100n] as readonly [bigint, bigint, bigint],
      },
    });
    const reader = new MorphoReader(fake.asPublicClient(), MORPHO);
    const p = await reader.position(MARKET as never, OWNER);
    expect(p.supplyShares).toBe(10n);
    expect(p.borrowShares).toBe(5n);
    expect(p.collateral).toBe(100n);
  });

  it("reads market tuple", async () => {
    const fake = new FakePublicClient({
      handlers: {
        market: () => [1000n, 100n, 800n, 80n, 1234n, 1000n] as readonly [bigint, bigint, bigint, bigint, bigint, bigint],
      },
    });
    const reader = new MorphoReader(fake.asPublicClient(), MORPHO);
    const m = await reader.market(MARKET as never);
    expect(m.totalSupplyAssets).toBe(1000n);
    expect(m.totalBorrowShares).toBe(80n);
  });
});

describe("ChainlinkReader + SequencerFeedReader", () => {
  it("reads latestRoundData + decimals", async () => {
    const fake = new FakePublicClient({
      handlers: {
        latestRoundData: () => [1n, 200_000_000_000n, 1000n, 1100n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
        decimals: () => 8,
      },
    });
    const reader = new ChainlinkReader(fake.asPublicClient(), CHAINLINK);
    const reading = await reader.read();
    expect(reading.answer).toBe(200_000_000_000n);
    expect(reading.decimals).toBe(8);
  });

  it("classifies sequencer status: up", async () => {
    const fake = new FakePublicClient({
      handlers: {
        latestRoundData: () => [1n, 0n, 1000n, 2000n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
      },
    });
    const seq = new SequencerFeedReader(fake.asPublicClient(), SEQUENCER);
    const result = await seq.status({ gracePeriodSeconds: 3600, nowSeconds: 10_000 });
    expect(result.status).toBe("up");
  });

  it("classifies sequencer status: down", async () => {
    const fake = new FakePublicClient({
      handlers: {
        latestRoundData: () => [1n, 1n, 1000n, 2000n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
      },
    });
    const seq = new SequencerFeedReader(fake.asPublicClient(), SEQUENCER);
    const result = await seq.status({ gracePeriodSeconds: 3600, nowSeconds: 10_000 });
    expect(result.status).toBe("down");
  });

  it("classifies sequencer status: gracePeriod", async () => {
    const fake = new FakePublicClient({
      handlers: {
        latestRoundData: () => [1n, 0n, 1000n, 9_500n, 1n] as readonly [bigint, bigint, bigint, bigint, bigint],
      },
    });
    const seq = new SequencerFeedReader(fake.asPublicClient(), SEQUENCER);
    const result = await seq.status({ gracePeriodSeconds: 3600, nowSeconds: 10_000 });
    expect(result.status).toBe("gracePeriod");
  });
});

describe("VaultReader", () => {
  it("reads asset/totalSupply/totalAssets/convertToAssets", async () => {
    const fake = new FakePublicClient({
      handlers: {
        asset: () => "0x0000000000000000000000000000000000000a99",
        totalSupply: () => 1_000_000n,
        totalAssets: () => 1_050_000n,
        convertToAssets: (args) => (BigInt(args[0] as bigint) * 1_050_000n) / 1_000_000n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    expect(await vault.asset()).toBe("0x0000000000000000000000000000000000000a99");
    expect(await vault.totalSupply()).toBe(1_000_000n);
    expect(await vault.totalAssets()).toBe(1_050_000n);
    expect(await vault.convertToAssets(1_000n)).toBe(1_050n);
  });

  // Default (flag off): convertToShares is called on-chain and its result is
  // returned verbatim — a compliant ERC-4626 vault.
  it("convertToShares uses the on-chain method when the vault supports it (flag off)", async () => {
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => 777n,
        // Would be read only if the NAV path were (wrongly) taken.
        totalSupply: () => 1_000_000n,
        totalAssets: () => 1_050_000n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    expect(await vault.convertToShares(1_000n)).toBe(777n);
    expect(fake.calls.some((c) => c.functionName === "totalSupply")).toBe(false);
    expect(fake.calls.some((c) => c.functionName === "totalAssets")).toBe(false);
  });

  // Default (flag off): ANY error from the on-chain convertToShares PROPAGATES.
  // The SDK never infers "vault lacks convertToShares" from an error class, so a
  // degraded/`-32603` RPC can never be misread into a NAV floor from a bad read.
  it("convertToShares rethrows on ANY on-chain error when flag off (no silent NAV fallback)", async () => {
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => {
          throw new Error("HTTP request failed: 503 Service Unavailable");
        },
        totalSupply: () => 1_000n,
        totalAssets: () => 1_000n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    await expect(vault.convertToShares(1_000n)).rejects.toThrow(/HTTP request failed/);
    // Prove no NAV read happened — no silent fallback.
    expect(fake.calls.some((c) => c.functionName === "totalSupply")).toBe(false);
    expect(fake.calls.some((c) => c.functionName === "totalAssets")).toBe(false);
  });

  // Flag ON (deploy declares the vault lacks convertToShares, e.g. the mock):
  // compute the canonical ERC-4626 floor from totalSupply/totalAssets and NEVER
  // call the on-chain convertToShares.
  it("computes the canonical ERC-4626 floor from NAV when flag on (never calls convertToShares)", async () => {
    const fake = new FakePublicClient({
      handlers: {
        // If this were called the test client would record it; assert it is not.
        convertToShares: () => 999n,
        totalSupply: () => 1_000_000n,
        totalAssets: () => 1_050_000n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT, true);
    // shares = assets * totalSupply / totalAssets = 1_050_000 * 1e6 / 1.05e6 = 1_000_000.
    expect(await vault.convertToShares(1_050_000n)).toBe(1_000_000n);
    expect(fake.calls.some((c) => c.functionName === "convertToShares")).toBe(false);
  });

  it("NAV floor floors a non-exact ratio and never overestimates (flag on)", async () => {
    // totalSupply=3, totalAssets=4, assets=100 → 100*3/4 = 75 exactly floored.
    const fake = new FakePublicClient({
      handlers: { totalSupply: () => 3n, totalAssets: () => 4n },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT, true);
    const shares = await vault.convertToShares(100n);
    expect(shares).toBe(75n);
    // Must NOT overestimate: floor(assets*ts/ta) <= assets*ts/ta.
    expect(shares * 4n).toBeLessThanOrEqual(100n * 3n);
    expect(shares).not.toBe(76n);
  });

  it("NAV floor mints 1:1 for an empty vault, totalSupply == 0 (flag on)", async () => {
    const fake = new FakePublicClient({
      handlers: { totalSupply: () => 0n, totalAssets: () => 0n },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT, true);
    expect(await vault.convertToShares(1_234n)).toBe(1_234n);
  });

  it("NAV floor throws a clear error when totalSupply != 0 and totalAssets == 0 (flag on)", async () => {
    const fake = new FakePublicClient({
      handlers: { totalSupply: () => 1_000n, totalAssets: () => 0n },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT, true);
    await expect(vault.convertToShares(1_000n)).rejects.toThrow(/cannot price/);
  });
});
