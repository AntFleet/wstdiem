// Singleton SDK initialization.
//
// SDK boundary discipline: every read / build / signing flow in the app routes
// through this hook. No component imports from `@wstdiem/sdk` directly — they
// go through `useSdk()` so the audit reviewer can trace every SDK construction
// to this file.

import { useMemo } from "react";
import {
  createPublicClient,
  http,
  recoverMessageAddress,
  type Address as ViemAddress,
  type PublicClient,
} from "viem";
import { base } from "viem/chains";
import {
  asChainId,
  createSdk,
  type WstdiemSdk,
  type WstdiemSdkConfig,
} from "@wstdiem/sdk";

/** Thrown when the production boot check finds the indexer signing key
 * missing. The app root catches this and renders a blocking error screen. */
export class IndexerKeyMissingError extends Error {
  constructor() {
    super(
      "VITE_INDEXER_PUBKEY required in production builds " +
        "(PR-14 H-3 trust boundary).",
    );
    this.name = "IndexerKeyMissingError";
  }
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_PUBKEY_FULL = "0x" + "00".repeat(20);
const ZERO_PUBKEY_32 = "0x" + "00".repeat(32);

export interface SdkRuntimeContext {
  sdk: WstdiemSdk;
  chainId: number;
  indexerBaseUrl: string;
  /** True when the SDK is running in the dev-only single-client posture
   * (VITE_ALLOW_SINGLE_CLIENT_READS=true). UI surfaces a warning chip when set. */
  singleClientMode: boolean;
  /** When true, the configured RPCs do not span 2+ provider families — G-PM-3
   * will report `RpcQuorumNotIndependent`. UI blocks signing in this state. */
  rpcQuorumDegradedAtInit: boolean;
  /** When true, VITE_INDEXER_PUBKEY is unset/zero so the SDK is NOT verifying
   * indexer signatures (PR-14 H-3). Dev only — production boot fails closed
   * with IndexerKeyMissingError. UI surfaces a warning chip in dev mode. */
  indexerSignatureVerificationDisabled: boolean;
}

interface RpcConfigEntry {
  url: string;
  family: string;
}

function readRpcConfig(): RpcConfigEntry[] {
  const entries: RpcConfigEntry[] = [];
  const rpc1 = import.meta.env.VITE_BASE_RPC_URL_1;
  const fam1 = import.meta.env.VITE_BASE_RPC_FAMILY_1;
  const rpc2 = import.meta.env.VITE_BASE_RPC_URL_2;
  const fam2 = import.meta.env.VITE_BASE_RPC_FAMILY_2;
  const rpc3 = import.meta.env.VITE_BASE_RPC_URL_3;
  const fam3 = import.meta.env.VITE_BASE_RPC_FAMILY_3;
  if (rpc1 && fam1) entries.push({ url: rpc1, family: fam1 });
  if (rpc2 && fam2) entries.push({ url: rpc2, family: fam2 });
  if (rpc3 && fam3) entries.push({ url: rpc3, family: fam3 });
  return entries;
}

function readIndexerSigningKey(): ViemAddress | undefined {
  const raw = (import.meta.env.VITE_INDEXER_PUBKEY ?? "").toLowerCase();
  if (raw === "" || raw === ZERO_PUBKEY_FULL || raw === ZERO_PUBKEY_32) {
    return undefined;
  }
  return raw as ViemAddress;
}

function buildSdkConfig(): {
  config: WstdiemSdkConfig;
  singleClientMode: boolean;
  rpcQuorumDegradedAtInit: boolean;
  indexerSignatureVerificationDisabled: boolean;
} {
  const rpcs = readRpcConfig();
  const indexerBaseUrl =
    import.meta.env.VITE_INDEXER_URL ?? "https://indexer.wstdiem.xyz";
  const allowSingleClient =
    import.meta.env.VITE_ALLOW_SINGLE_CLIENT_READS === "true";
  const chainId = asChainId(
    Number(import.meta.env.VITE_CHAIN_ID ?? base.id),
  );

  if (rpcs.length === 0) {
    throw new Error(
      "useSdk: no RPC URLs configured. Set VITE_BASE_RPC_URL_1..3 + " +
        "VITE_BASE_RPC_FAMILY_1..3 in .env.local. See app/.env.example.",
    );
  }

  // Primary public client — used as the wagmi-side fallback and as the
  // single-client when allowSingleClientReads=true.
  const primary = rpcs[0];
  if (!primary) {
    // satisfies the noUncheckedIndexedAccess strict check
    throw new Error("useSdk: primary RPC missing");
  }
  const primaryClient = createPublicClient({
    chain: base,
    transport: http(primary.url),
  }) as PublicClient;

  // PR-15 audit closure: when 2+ RPCs are configured, plumb them through the
  // SDK's RpcQuorum so every readContract / getBlock fans out and requires
  // matching values from `threshold` distinct provider families.
  const publicClients =
    rpcs.length >= 2
      ? rpcs.map((r) => ({
          client: createPublicClient({
            chain: base,
            transport: http(r.url),
          }) as PublicClient,
          providerFamily: r.family,
        }))
      : undefined;

  // Track init-time quorum independence so the UI can warn before the first
  // getReadiness() round-trip.
  const distinctFamilies = new Set(rpcs.map((r) => r.family));
  const rpcQuorumDegradedAtInit =
    rpcs.length < 2 || distinctFamilies.size < 2;

  // Phase 1 ships the registry / executor address layout with placeholder
  // addresses. Production env supplies real addresses via VITE_CONTRACT_*
  // env vars in a follow-up commit; Phase 1 reads default to the registry
  // pin pattern. The SDK fails closed if any address is the zero address
  // and a contract read is attempted, so this remains safe.
  const zero = ZERO_ADDRESS as ViemAddress;
  const contracts = {
    loopRegistry:
      (import.meta.env.VITE_CONTRACT_LOOP_REGISTRY as ViemAddress) ?? zero,
    loopAuthorization:
      (import.meta.env.VITE_CONTRACT_LOOP_AUTHORIZATION as ViemAddress) ?? zero,
    loopForceExitAuthorizer:
      (import.meta.env.VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER as ViemAddress) ??
      zero,
    loopExecutorV2:
      (import.meta.env.VITE_CONTRACT_LOOP_EXECUTOR_V2 as ViemAddress) ?? zero,
    loopForceExitExecutor:
      (import.meta.env.VITE_CONTRACT_LOOP_FORCE_EXIT_EXECUTOR as ViemAddress) ??
      zero,
    loopAnchorRegistry:
      (import.meta.env.VITE_CONTRACT_LOOP_ANCHOR_REGISTRY as ViemAddress) ??
      zero,
    loopRiskOracleAdapter:
      (import.meta.env.VITE_CONTRACT_LOOP_RISK_ORACLE_ADAPTER as ViemAddress) ??
      zero,
    loopFeeRouter:
      (import.meta.env.VITE_CONTRACT_LOOP_FEE_ROUTER as ViemAddress) ?? zero,
    emergencyGuardian:
      (import.meta.env.VITE_CONTRACT_EMERGENCY_GUARDIAN as ViemAddress) ?? zero,
  };

  // C-2 closure: indexer signature verification + production boot check.
  //
  // A compromised indexer host (PR-10 Fastify), DNS hijack, or TLS-MITM
  // serves forged /snapshots/latest, /actions, /events, /evidence-bundle
  // responses. Without `indexerSigningKey` + `indexerVerifier` the SDK
  // trusts everything (PR-14 H-3). Production refuses to start when the
  // env is missing — dev surfaces a warning chip in the header.
  const indexerSigningKey = readIndexerSigningKey();
  const indexerSignatureVerificationDisabled = indexerSigningKey === undefined;
  if (
    indexerSignatureVerificationDisabled &&
    import.meta.env.MODE === "production"
  ) {
    throw new IndexerKeyMissingError();
  }
  // The SDK's WstdiemSdkConfig may or may not declare these fields directly
  // (they live on the LiveWstdiemSdk extension). Cast through `unknown` so
  // we can pass them through without forcing an SDK-type widening here.
  const extraIndexerConfig: Record<string, unknown> = indexerSigningKey
    ? {
        indexerSigningKey,
        indexerVerifier: async (args: {
          message: string;
          signature: `0x${string}`;
        }): Promise<ViemAddress> => {
          return recoverMessageAddress({
            message: args.message,
            signature: args.signature,
          });
        },
      }
    : {};

  const config: WstdiemSdkConfig = {
    chainId,
    publicClient: primaryClient,
    indexerBaseUrl,
    contracts,
    strictAnchorCrossCheck: !allowSingleClient,
    allowSingleClientReads: allowSingleClient,
    ...(publicClients ? { publicClients } : {}),
    quorum: {
      threshold: Number(import.meta.env.VITE_RPC_QUORUM_THRESHOLD ?? 2),
      maxBlockLagBlocks: 5,
      timeoutMs: 5000,
    },
    ...(extraIndexerConfig as Partial<WstdiemSdkConfig>),
  };

  return {
    config,
    singleClientMode: allowSingleClient,
    rpcQuorumDegradedAtInit,
    indexerSignatureVerificationDisabled,
  };
}

// Module-level singleton so the SDK isn't reconstructed across hook calls.
// Strict-mode double-render is safe — `createSdk` is pure.
let cached: SdkRuntimeContext | null = null;

export function useSdk(): SdkRuntimeContext {
  return useMemo(() => {
    if (cached) return cached;
    const {
      config,
      singleClientMode,
      rpcQuorumDegradedAtInit,
      indexerSignatureVerificationDisabled,
    } = buildSdkConfig();
    const sdk = createSdk(config);
    cached = {
      sdk,
      chainId: config.chainId as number,
      indexerBaseUrl: config.indexerBaseUrl,
      singleClientMode,
      rpcQuorumDegradedAtInit,
      indexerSignatureVerificationDisabled,
    };
    return cached;
  }, []);
}

/** Test-only: reset the singleton between vitest runs. Not exported from the
 * hooks barrel. */
export function __resetSdkSingletonForTests(): void {
  cached = null;
}
