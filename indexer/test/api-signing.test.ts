import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pino } from "pino";
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress, type Hex } from "viem";
import { closeDatabase, openDatabase, type DB } from "../src/db/client.js";
import { IndexerConfigSchema, type IndexerConfig } from "../src/config.js";
import { buildApi } from "../src/api/server.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const SIGNING_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;

function makeConfig(overrides: Partial<Record<string, unknown>> = {}): IndexerConfig {
  return IndexerConfigSchema.parse({
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    startBlock: 1n,
    contracts: {
      registry: ZERO,
      authorization: ZERO,
      forceExitAuthorizer: ZERO,
      executorV2: ZERO,
      forceExitExecutor: ZERO,
      anchorRegistry: ZERO,
      feeRouter: ZERO,
      emergencyGuardian: ZERO,
    },
    ...overrides,
  });
}

const silentLogger = pino({ level: "silent" });

describe("read API response signing", () => {
  let db: DB;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("signs GET responses over the canonical WSTDIEM_INDEXER_V1 envelope", async () => {
    const signer = privateKeyToAccount(SIGNING_KEY);
    const api = buildApi({ config: makeConfig({ signingKey: SIGNING_KEY }), db, logger: silentLogger });

    const res = await api.fastify.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);

    const sig = res.headers["x-indexer-signature"] as Hex | undefined;
    expect(sig).toBeTruthy();

    // Reconstruct the exact envelope the SDK verifies against.
    const message = `WSTDIEM_INDEXER_V1\n/health\n${res.body}`;
    const recovered = await recoverMessageAddress({ message, signature: sig! });
    expect(recovered.toLowerCase()).toBe(signer.address.toLowerCase());

    await api.stop();
  });

  it("binds the signature to the request URL (path + query)", async () => {
    const signer = privateKeyToAccount(SIGNING_KEY);
    const api = buildApi({ config: makeConfig({ signingKey: SIGNING_KEY }), db, logger: silentLogger });

    const url = "/actions?actionId=0xdeadbeef";
    const res = await api.fastify.inject({ method: "GET", url });
    const sig = res.headers["x-indexer-signature"] as Hex;

    // Correct URL recovers the signer.
    const good = await recoverMessageAddress({
      message: `WSTDIEM_INDEXER_V1\n${url}\n${res.body}`,
      signature: sig,
    });
    expect(good.toLowerCase()).toBe(signer.address.toLowerCase());

    // A different URL over the same body does NOT recover the signer — the
    // envelope prevents cross-endpoint body replay.
    const bad = await recoverMessageAddress({
      message: `WSTDIEM_INDEXER_V1\n/snapshots/latest\n${res.body}`,
      signature: sig,
    });
    expect(bad.toLowerCase()).not.toBe(signer.address.toLowerCase());

    await api.stop();
  });

  it("serves unsigned responses when no signing key is configured", async () => {
    const api = buildApi({ config: makeConfig(), db, logger: silentLogger });
    const res = await api.fastify.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-indexer-signature"]).toBeUndefined();
    await api.stop();
  });
});
