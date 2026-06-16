import { createWalletClient, http, fallback, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AnchorConfig } from "../config.js";

const SUBMIT_STATE_SNAPSHOT_ABI = [
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "submitStateSnapshot",
    inputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "manifestHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export interface SubmitResult {
  txHash: Hex;
  status: "success" | "reverted";
}

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

  // viem will populate chain on send via simulateContract -> writeContract.
  const { request } = await args.publicClient.simulateContract({
    address: args.config.anchorRegistryAddress as Hex,
    abi: SUBMIT_STATE_SNAPSHOT_ABI,
    functionName: "submitStateSnapshot",
    args: [args.blockNumber, args.manifestHash],
    account,
  });

  const txHash = await walletClient.writeContract(request);
  const receipt = await args.publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: args.config.txConfirmationBlocks,
  });
  return { txHash, status: receipt.status === "success" ? "success" : "reverted" };
}
