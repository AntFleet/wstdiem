import { z } from "zod";

const hexAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected 0x-prefixed 20-byte address");

const hexPrivateKey = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Expected 0x-prefixed 32-byte private key");

export const IndexerConfigSchema = z.object({
  chainId: z.coerce.number().int().positive(),
  rpcUrl: z.string().url(),
  rpcFallbackUrls: z.array(z.string().url()).default([]),
  startBlock: z.coerce.bigint(),
  confirmationBlocks: z.coerce.number().int().nonnegative().default(2),
  pollIntervalMs: z.coerce.number().int().positive().default(2000),
  reorgDepth: z.coerce.number().int().nonnegative().default(64),
  databasePath: z.string().default("./data/indexer.db"),
  apiPort: z.coerce.number().int().positive().default(8080),
  apiHost: z.string().default("127.0.0.1"),
  // Optional signing key for the read API. When set, every GET response is
  // signed (EIP-191) and served with an `X-Indexer-Signature` header; the
  // recovered signer must equal the registry-pinned `indexerSigner` role.
  // When unset the API serves unsigned responses (backwards compatible with
  // SDK clients that have no `signingKey` configured).
  signingKey: hexPrivateKey.optional(),
  contracts: z.object({
    registry: hexAddress,
    authorization: hexAddress,
    forceExitAuthorizer: hexAddress,
    executorV2: hexAddress,
    forceExitExecutor: hexAddress,
    anchorRegistry: hexAddress,
    feeRouter: hexAddress,
    emergencyGuardian: hexAddress,
  }),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type IndexerConfig = z.infer<typeof IndexerConfigSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  const fallbacks = env.WSTDIEM_RPC_FALLBACK_URLS
    ? env.WSTDIEM_RPC_FALLBACK_URLS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return IndexerConfigSchema.parse({
    chainId: env.WSTDIEM_CHAIN_ID,
    rpcUrl: env.WSTDIEM_RPC_URL,
    rpcFallbackUrls: fallbacks,
    startBlock: env.WSTDIEM_START_BLOCK,
    confirmationBlocks: env.WSTDIEM_CONFIRMATIONS,
    pollIntervalMs: env.WSTDIEM_POLL_INTERVAL_MS,
    reorgDepth: env.WSTDIEM_REORG_DEPTH,
    databasePath: env.WSTDIEM_DB_PATH,
    apiPort: env.WSTDIEM_API_PORT,
    apiHost: env.WSTDIEM_API_HOST,
    signingKey: env.WSTDIEM_INDEXER_SIGNING_KEY || undefined,
    logLevel: env.WSTDIEM_LOG_LEVEL,
    contracts: {
      registry: env.WSTDIEM_REGISTRY_ADDRESS,
      authorization: env.WSTDIEM_AUTHORIZATION_ADDRESS,
      forceExitAuthorizer: env.WSTDIEM_FORCE_EXIT_AUTHORIZER_ADDRESS,
      executorV2: env.WSTDIEM_EXECUTOR_V2_ADDRESS,
      forceExitExecutor: env.WSTDIEM_FORCE_EXIT_EXECUTOR_ADDRESS,
      anchorRegistry: env.WSTDIEM_ANCHOR_REGISTRY_ADDRESS,
      feeRouter: env.WSTDIEM_FEE_ROUTER_ADDRESS,
      emergencyGuardian: env.WSTDIEM_EMERGENCY_GUARDIAN_ADDRESS,
    },
  });
}
