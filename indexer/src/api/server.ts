import Fastify, { type FastifyInstance, type FastifyBaseLogger } from "fastify";
import cors from "@fastify/cors";
import type { Logger } from "pino";
import { privateKeyToAccount } from "viem/accounts";
import type { DB } from "../db/client.js";
import type { IndexerConfig } from "../config.js";
import type { Hex } from "viem";
import {
  ActionStepRepository,
  AnchorSnapshotRepository,
  HeadRepository,
  PolicyRepository,
  RegistryCommitRepository,
  RoleRotationRepository,
} from "../state/repositories.js";

export interface ApiServer {
  fastify: FastifyInstance;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const bigintToString = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(bigintToString);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, bigintToString(v)]),
    );
  }
  return value;
};

export function buildApi(args: {
  config: IndexerConfig;
  db: DB;
  logger: Logger;
}): ApiServer {
  const { config, db, logger } = args;
  const fastify = Fastify({
    // Fastify 5 requires an existing logger to be passed via `loggerInstance`;
    // the `logger` option only accepts a boolean or a pino *config* object.
    loggerInstance: logger as FastifyBaseLogger,
    bodyLimit: 1024 * 1024,
  });

  void fastify.register(cors, {
    origin: true,
    methods: ["GET", "OPTIONS"],
    // Let SDK clients read the signature on cross-origin responses.
    exposedHeaders: ["X-Indexer-Signature"],
  });

  // Optional read-API response signing. When a signing key is configured we
  // sign the exact serialized payload we are about to send, over the canonical
  // envelope `WSTDIEM_INDEXER_V1\n${url}\n${payload}` (EIP-191). The URL is part
  // of the signed message so a valid `/snapshots/latest` body cannot be replayed
  // as the response to `/actions?actionId=...`. This is the producing side of the
  // verification the SDK performs in `IndexerClient.get` (X-Indexer-Signature).
  const signer = config.signingKey ? privateKeyToAccount(config.signingKey as Hex) : null;
  if (signer) {
    logger.info({ signer: signer.address }, "read API response signing enabled");
    fastify.addHook("onSend", async (request, reply, payload) => {
      // Only JSON GET bodies are signed; skip CORS preflight and non-string
      // (stream/buffer) payloads, which SDK read clients never consume.
      if (request.method !== "GET" || typeof payload !== "string") return payload;
      const message = `WSTDIEM_INDEXER_V1\n${request.url}\n${payload}`;
      const signature = await signer.signMessage({ message });
      void reply.header("X-Indexer-Signature", signature);
      return payload;
    });
  }

  const heads = new HeadRepository(db);
  const actionSteps = new ActionStepRepository(db);
  const policies = new PolicyRepository(db);
  const registryCommits = new RegistryCommitRepository(db);
  const anchorSnapshots = new AnchorSnapshotRepository(db);
  const roleRotations = new RoleRotationRepository(db);

  fastify.get("/health", async () => {
    const head = heads.get();
    return {
      status: "ok",
      chainId: config.chainId,
      head: head
        ? { lastIndexedBlock: head.lastIndexedBlock.toString(), lastIndexedBlockHash: head.lastIndexedBlockHash }
        : null,
    };
  });

  fastify.get<{ Querystring: { actionId?: string } }>("/actions", async (req) => {
    const actionId = (req.query.actionId ?? "") as string;
    if (!actionId.startsWith("0x")) {
      return { error: "actionId query parameter required (0x-prefixed)" };
    }
    const rows = actionSteps.byActionId(actionId as Hex);
    return bigintToString({ actionId, steps: rows }) as Record<string, unknown>;
  });

  fastify.get("/policies", async () => {
    return bigintToString({ policies: policies.list() });
  });

  fastify.get<{ Querystring: { limit?: string } }>("/registry/commits", async (req) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    return bigintToString({ commits: registryCommits.list(limit) });
  });

  fastify.get("/registry/latest", async () => {
    const latest = registryCommits.latest();
    return bigintToString({ latest });
  });

  fastify.get<{ Querystring: { limit?: string } }>("/snapshots", async (req) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    return bigintToString({ snapshots: anchorSnapshots.list(limit) });
  });

  fastify.get("/snapshots/latest", async () => {
    return bigintToString({ latest: anchorSnapshots.latest() });
  });

  fastify.get<{ Querystring: { kind?: string; limit?: string } }>(
    "/roles/rotations",
    async (req) => {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const kind = req.query.kind as
        | "indexerSigner"
        | "anchorSubmitter"
        | "governance"
        | "registryEmergencyGuardian"
        | "guardianRole"
        | undefined;
      return bigintToString({ rotations: roleRotations.list(kind, limit) });
    },
  );

  return {
    fastify,
    async start() {
      await fastify.listen({ host: config.apiHost, port: config.apiPort });
    },
    async stop() {
      await fastify.close();
    },
  };
}
