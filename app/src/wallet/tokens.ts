// ERC-20 reads/writes used by the Loop Builder approve gate.
// Kept inside wallet/ so wagmi/viem stay off the rest of the app.

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { erc20Abi, maxUint256, type Address } from "viem";

export function useErc20Balance(token: Address | undefined, owner: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(token && owner), refetchInterval: 12_000 },
  });
}

export function useErc20Allowance(
  token: Address | undefined,
  owner: Address | undefined,
  spender: Address | undefined,
) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: Boolean(token && owner && spender), refetchInterval: 12_000 },
  });
}

export function useApproveErc20() {
  const write = useWriteContract();
  const wait = useWaitForTransactionReceipt({ hash: write.data });
  return {
    approve: (token: Address, spender: Address) =>
      write.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      }),
    isPending: write.isPending || wait.isLoading,
    isSuccess: wait.isSuccess,
    error: write.error ?? wait.error,
    reset: write.reset,
  };
}

export function formatTokenAmount(value: bigint | undefined, decimals = 18, digits = 4): string {
  if (value === undefined) return "—";
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${fracStr ? `.${fracStr}` : ""}`;
}
