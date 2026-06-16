import { describe, it, expect } from "vitest";
import { IndexerClient, IndexerHttpError } from "../src/live/indexer-client.js";
import { fakeFetch } from "./live-helpers.js";

const BASE = "http://indexer.test";

describe("IndexerClient", () => {
  it("parses /health and converts bigints", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({
        get: {
          "/health": {
            status: "ok",
            chainId: 8453,
            head: { lastIndexedBlock: "12345", lastIndexedBlockHash: "0xaa".padEnd(66, "0") },
          },
        },
      }),
    });
    const h = await client.health();
    expect(h.status).toBe("ok");
    expect(h.chainId).toBe(8453);
    expect(h.head?.lastIndexedBlock).toBe(12345n);
  });

  it("parses /snapshots/latest with null body", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({ get: { "/snapshots/latest": { latest: null } } }),
    });
    expect(await client.snapshotsLatest()).toBeNull();
  });

  it("parses /snapshots/latest with body (real PR-10 shape)", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({
        get: {
          "/snapshots/latest": {
            latest: {
              anchorBlock: "1500",
              manifestHash: "0xab".padEnd(66, "0"),
              submitter: "0x0000000000000000000000000000000000000abc",
              blockNumber: "1510",
              blockHash: "0xaa".padEnd(66, "0"),
              transactionHash: "0xbb".padEnd(66, "0"),
              logIndex: 0,
            },
          },
        },
      }),
    });
    const snap = await client.snapshotsLatest();
    expect(snap?.anchorBlock).toBe(1500n);
    expect(snap?.blockNumber).toBe(1510n);
    expect(snap?.transactionHash).toBe("0xbb".padEnd(66, "0"));
  });

  it("parses /policies array (real PR-10 PolicyRecord shape)", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({
        get: {
          "/policies": {
            policies: [
              {
                owner: "0x0000000000000000000000000000000000000abc",
                policyId: "42",
                primaryType: 0,
                policyHash: "0xcd".padEnd(66, "0"),
                policyClass: 0,
                createdBlock: "1000",
                expiryBlock: "5000",
                state: "active",
              },
              {
                owner: "0x0000000000000000000000000000000000000def",
                policyId: "43",
                primaryType: 1,
                policyHash: "0xef".padEnd(66, "0"),
                policyClass: 3,
                createdBlock: "1010",
                expiryBlock: "6000",
                state: "revoking",
                revokeInitiatedBlock: "2000",
              },
            ],
          },
        },
      }),
    });
    const policies = await client.policies();
    expect(policies).toHaveLength(2);
    expect(policies[0]?.policyId).toBe(42n);
    expect(policies[0]?.expiryBlock).toBe(5000n);
    expect(policies[0]?.state).toBe("active");
    expect(policies[1]?.revokeInitiatedBlock).toBe(2000n);
    expect(policies[1]?.state).toBe("revoking");
  });

  it("throws when /policies returns a non-array (A2-6 fix)", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({ get: { "/policies": { policies: null } } }),
    });
    await expect(client.policies()).rejects.toBeInstanceOf(IndexerHttpError);
  });

  it("throws when /health returns status != ok (A14 fix)", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({ get: { "/health": { status: "error", chainId: 1, head: null } } }),
    });
    await expect(client.health()).rejects.toBeInstanceOf(IndexerHttpError);
  });

  it("rejects malformed bigint strings (A4-10 fix)", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({
        get: {
          "/health": {
            status: "ok",
            chainId: 1,
            head: { lastIndexedBlock: "abc", lastIndexedBlockHash: "0x" },
          },
        },
      }),
    });
    await expect(client.health()).rejects.toThrow(/non-numeric/);
  });

  it("throws IndexerHttpError on non-2xx response", async () => {
    const client = new IndexerClient({
      baseUrl: BASE,
      fetch: fakeFetch({
        errors: { "/health": { status: 503, body: "indexer down" } },
      }),
    });
    await expect(client.health()).rejects.toBeInstanceOf(IndexerHttpError);
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetcher = fakeFetch({
      get: { "/health": { status: "ok", chainId: 1, head: null } },
    });
    const client = new IndexerClient({ baseUrl: `${BASE}///`, fetch: fetcher });
    const h = await client.health();
    expect(h.chainId).toBe(1);
  });
});
