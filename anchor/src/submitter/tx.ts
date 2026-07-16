import { createWalletClient, http, fallback, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AnchorConfig } from "../config.js";

/**
 * Production path: always submit with the candidate block's hash so the
 * LoopAnchorRegistry can fail-closed on reorged/stale heads (audit B).
 * The legacy `submitStateSnapshot` (no hash) remains on-chain for tests only.
 */
const SUBMIT_STATE_SNAPSHOT_WITH_BLOCK_HASH_ABI = [
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "submitStateSnapshotWithBlockHash",
    inputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "blockHash", type: "bytes32" },
      { name: "manifestHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export interface SubmitResult {
  txHash: Hex;
  status: "success" | "reverted";
  blockHash: Hex;
}

/**
 * Submit a state snapshot with the RPC-observed block hash of `blockNumber`.
 * Fails closed if the block cannot be resolved or has a zero hash.
 */
export async function submitStateSnapshot(args: {
  config: AnchorConfig;
  publicClient: PublicClient;
  blockNumber: bigint;
  manifestHash: Hex;
}): Promise<SubmitResult> {
  const transports = [http(args.config.rpcUrl), ...args.config.rpcFallbackUrls.map((url) => http(url))];
  const account = privateKeyToAccount(args.config.submitterPrivateKey as Hex);
  const walletClient = createWalletClient({
    account,
    transport: transports.length > 1 ? fallback(transports) : transports[0]!,
  });

  const block = await args.publicClient.getBlock({ blockNumber: args.blockNumber });
  if (!block.hash || block.hash === ("0x" + "0".repeat(64))) {
    throw new Error(
      `submitStateSnapshot: RPC returned no hash for block ${args.blockNumber}; refusing blind notarization`,
    );
  }
  const blockHash = block.hash as Hex;

  const { request } = await args.publicClient.simulateContract({
    address: args.config.anchorRegistryAddress as Hex,
    abi: SUBMIT_STATE_SNAPSHOT_WITH_BLOCK_HASH_ABI,
    functionName: "submitStateSnapshotWithBlockHash",
    args: [args.blockNumber, blockHash, args.manifestHash],
    account,
  });

  const txHash = await walletClient.writeContract(request);
  const receipt = await args.publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: args.config.txConfirmationBlocks,
  });
  return {
    txHash,
    status: receipt.status === "success" ? "success" : "reverted",
    blockHash,
  };
}
