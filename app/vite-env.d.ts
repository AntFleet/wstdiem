/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_RPC_URL_1?: string;
  readonly VITE_BASE_RPC_URL_2?: string;
  readonly VITE_BASE_RPC_URL_3?: string;
  readonly VITE_BASE_RPC_FAMILY_1?: string;
  readonly VITE_BASE_RPC_FAMILY_2?: string;
  readonly VITE_BASE_RPC_FAMILY_3?: string;
  readonly VITE_RPC_QUORUM_THRESHOLD?: string;
  readonly VITE_RPC_QUORUM_SIZE?: string;
  readonly VITE_INDEXER_URL?: string;
  readonly VITE_INDEXER_PUBKEY?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_ALLOW_SINGLE_CLIENT_READS?: string;
  readonly VITE_PHASE_1_MARKET_IDS?: string;
  readonly VITE_BUILD_HASH?: string;
  readonly VITE_CONTRACT_LOOP_REGISTRY?: string;
  readonly VITE_CONTRACT_LOOP_AUTHORIZATION?: string;
  readonly VITE_CONTRACT_LOOP_FORCE_EXIT_AUTHORIZER?: string;
  readonly VITE_CONTRACT_LOOP_EXECUTOR_V2?: string;
  readonly VITE_CONTRACT_LOOP_FORCE_EXIT_EXECUTOR?: string;
  readonly VITE_CONTRACT_LOOP_ANCHOR_REGISTRY?: string;
  readonly VITE_CONTRACT_LOOP_RISK_ORACLE_ADAPTER?: string;
  readonly VITE_CONTRACT_LOOP_FEE_ROUTER?: string;
  readonly VITE_CONTRACT_EMERGENCY_GUARDIAN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
