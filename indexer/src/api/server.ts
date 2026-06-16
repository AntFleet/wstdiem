import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Logger } from "pino";
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
    logger: logger as never,
    bodyLimit: 1024 * 1024,
  });

  void fastify.register(cors, {
    origin: true,
    methods: ["GET", "OPTIONS"],
  });

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
