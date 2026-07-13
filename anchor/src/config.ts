import { z } from "zod";

const hexAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected 0x-prefixed 20-byte address");

const hexPrivateKey = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Expected 0x-prefixed 32-byte private key");

export const AnchorConfigSchema = z.object({
  chainId: z.coerce.number().int().positive(),
  rpcUrl: z.string().url(),
  rpcFallbackUrls: z.array(z.string().url()).default([]),
  indexerApiUrl: z.string().url(),
  registryAddress: hexAddress,
  anchorRegistryAddress: hexAddress,
  submitterPrivateKey: hexPrivateKey,
  // Optional override; if absent we read LoopRegistry.anchorCadenceBlocks() on startup.
  cadenceBlocksOverride: z.coerce.bigint().optional(),
  // Minimum gap (in indexed blocks) below which we will not submit even if cadence allows.
  // Defaults to 1 -- effectively unconstrained beyond the on-chain cadence.
  minIndexerLagBlocks: z.coerce.bigint().default(1n),
  pollIntervalMs: z.coerce.number().int().positive().default(15_000),
  // Align with indexer floor: never accept 0/1 confirmations in production.
  txConfirmationBlocks: z.coerce.number().int().min(2).default(10),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type AnchorConfig = z.infer<typeof AnchorConfigSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AnchorConfig {
  const fallbacks = env.WSTDIEM_RPC_FALLBACK_URLS
    ? env.WSTDIEM_RPC_FALLBACK_URLS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return AnchorConfigSchema.parse({
    chainId: env.WSTDIEM_CHAIN_ID,
    rpcUrl: env.WSTDIEM_RPC_URL,
    rpcFallbackUrls: fallbacks,
    indexerApiUrl: env.WSTDIEM_INDEXER_API_URL,
    registryAddress: env.WSTDIEM_REGISTRY_ADDRESS,
    anchorRegistryAddress: env.WSTDIEM_ANCHOR_REGISTRY_ADDRESS,
    submitterPrivateKey: env.WSTDIEM_ANCHOR_SUBMITTER_PRIVATE_KEY,
    cadenceBlocksOverride: env.WSTDIEM_ANCHOR_CADENCE_OVERRIDE,
    minIndexerLagBlocks: env.WSTDIEM_MIN_INDEXER_LAG,
    pollIntervalMs: env.WSTDIEM_ANCHOR_POLL_INTERVAL_MS,
    txConfirmationBlocks: env.WSTDIEM_ANCHOR_TX_CONFIRMATIONS,
    logLevel: env.WSTDIEM_ANCHOR_LOG_LEVEL,
  });
}
