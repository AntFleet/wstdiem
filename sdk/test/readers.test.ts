import { describe, it, expect } from "vitest";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
} from "viem";
import { RegistryReader, AuthorizationReader, MorphoReader, ChainlinkReader, SequencerFeedReader, VaultReader } from "../src/live/readers/index.js";
import { FakePublicClient } from "./live-helpers.js";

/** A viem ContractFunctionExecutionError WRAPPING A GENUINE REVERT — the shape
 * viem produces when a vault reverts or the function is absent (the true cause
 * lives in `.cause`). This is the only error the VaultReader fallback is allowed
 * to swallow. Built via prototypes to skip viem's heavy constructor formatting. */
function contractRevert(): ContractFunctionExecutionError {
  const cause = Object.create(
    ContractFunctionRevertedError.prototype,
  ) as ContractFunctionRevertedError;
  (cause as { message: string }).message = "execution reverted";
  (cause as { name: string }).name = "ContractFunctionRevertedError";
  const err = Object.create(
    ContractFunctionExecutionError.prototype,
  ) as ContractFunctionExecutionError;
  (err as { message: string }).message = "execution reverted: function absent";
  (err as { name: string }).name = "ContractFunctionExecutionError";
  (err as { cause: unknown }).cause = cause;
  return err;
}

/** A viem ContractFunctionExecutionError WRAPPING A TRANSPORT failure (e.g. an
 * RPC timeout / 503). viem wraps these in the SAME outer class as reverts, with
 * the transport error as `.cause` — so the outer type alone can't distinguish
 * them. The fallback MUST rethrow this rather than derive a floor from a bad
 * read. This is exactly the round-2 fail-open the cause-inspection fix closes. */
function wrappedTransportError(): ContractFunctionExecutionError {
  const err = Object.create(
    ContractFunctionExecutionError.prototype,
  ) as ContractFunctionExecutionError;
  (err as { message: string }).message = "HTTP request failed: 503";
  (err as { name: string }).name = "ContractFunctionExecutionError";
  (err as { cause: unknown }).cause = new Error(
    "HTTP request failed: 503 Service Unavailable",
  );
  return err;
}

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

  it("convertToShares uses the on-chain primary path when the vault implements it", async () => {
    const fake = new FakePublicClient({
      handlers: {
        // Compliant vault: convertToShares answers directly.
        convertToShares: () => 777n,
        // Would derive a different value if the fallback were (wrongly) used.
        convertToAssets: (args) => (BigInt(args[0] as bigint) * 105n) / 100n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    expect(await vault.convertToShares(1_000n)).toBe(777n);
    // Primary path only — no NAV inversion read.
    expect(fake.calls.some((c) => c.functionName === "convertToAssets")).toBe(false);
  });

  it("convertToShares falls back to the canonical ERC-4626 floor when convertToShares reverts", async () => {
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => {
          throw contractRevert();
        },
        // price-per-share = 1.05 → totalSupply/totalAssets = 1/1.05.
        totalSupply: () => 1_000_000n,
        totalAssets: () => 1_050_000n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    // shares = assets * totalSupply / totalAssets = 1_050_000 * 1e6 / 1.05e6 = 1_000_000.
    expect(await vault.convertToShares(1_050_000n)).toBe(1_000_000n);
  });

  it("canonical fallback floors a non-exact ratio and never overestimates", async () => {
    // totalSupply=3, totalAssets=4, assets=100 → 100*3/4 = 75 exactly floored.
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => {
          throw contractRevert();
        },
        totalSupply: () => 3n,
        totalAssets: () => 4n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    const shares = await vault.convertToShares(100n);
    expect(shares).toBe(75n);
    // Must NOT overestimate: floor(assets*ts/ta) <= assets*ts/ta.
    expect(shares * 4n).toBeLessThanOrEqual(100n * 3n);
    // Non-exactly-representable check: a value that rounds up would be 76.
    expect(shares).not.toBe(76n);
  });

  it("canonical fallback mints 1:1 for an empty vault (totalSupply == 0)", async () => {
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => {
          throw contractRevert();
        },
        totalSupply: () => 0n,
        totalAssets: () => 0n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    expect(await vault.convertToShares(1_234n)).toBe(1_234n);
  });

  it("canonical fallback throws a clear error when totalSupply != 0 and totalAssets == 0", async () => {
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => {
          throw contractRevert();
        },
        totalSupply: () => 1_000n,
        totalAssets: () => 0n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    await expect(vault.convertToShares(1_000n)).rejects.toThrow(/cannot price/);
  });

  it("convertToShares rethrows a transport/unexpected error instead of falling back", async () => {
    // A non-revert error (e.g. RPC timeout / network) must NOT be masked as a
    // vault lacking convertToShares — it must propagate so a degraded RPC never
    // produces a share floor from a bad read.
    const transportErr = new Error("HTTP request failed: 503 Service Unavailable");
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => {
          throw transportErr;
        },
        // If the fallback were (wrongly) taken these would be read.
        totalSupply: () => 1_000n,
        totalAssets: () => 1_000n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    await expect(vault.convertToShares(1_000n)).rejects.toThrow(/HTTP request failed/);
    // Prove the fallback was never entered: no raw NAV reads happened.
    expect(fake.calls.some((c) => c.functionName === "totalSupply")).toBe(false);
    expect(fake.calls.some((c) => c.functionName === "totalAssets")).toBe(false);
  });

  it("convertToShares rethrows a viem-WRAPPED transport error (CFEE whose cause is not a revert)", async () => {
    // The real viem hazard: readContract wraps EVERY failure — including
    // transport/timeout — in a ContractFunctionExecutionError, with the true
    // cause in `.cause`. The outer instanceof check is therefore insufficient;
    // only a revert/zero-data cause may trigger the fallback.
    const fake = new FakePublicClient({
      handlers: {
        convertToShares: () => {
          throw wrappedTransportError();
        },
        totalSupply: () => 1_000n,
        totalAssets: () => 1_000n,
      },
    });
    const vault = new VaultReader(fake.asPublicClient(), VAULT);
    await expect(vault.convertToShares(1_000n)).rejects.toThrow(/HTTP request failed/);
    expect(fake.calls.some((c) => c.functionName === "totalSupply")).toBe(false);
    expect(fake.calls.some((c) => c.functionName === "totalAssets")).toBe(false);
  });
});
