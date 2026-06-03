import type { ExitFlashFeeProof, LoopAction, LoopExecutorParams, LoopExitParams } from "./types.js";

const unresolvedReason =
  "fee-inclusive proof is blocked until a flash-loan provider, fee model, and executor callback behavior are specified";

export function buildExitFlashFeeProof(
  action: LoopAction,
  params: LoopExecutorParams | null,
): ExitFlashFeeProof | undefined {
  if (action !== "exit") {
    return undefined;
  }
  if (params === null) {
    return {
      flashFee: "unresolved",
      flashFeeSource: "unresolved",
      flashLoanProvider: "unconfigured",
      totalFlashRepaymentDiem: "unresolved",
      feeInclusiveRepayCovered: "blocked",
      reason: unresolvedReason,
    };
  }

  const exitParams = params as LoopExitParams;
  return {
    repayAmountDiem: exitParams.repayAmountDiem.toString(),
    flashFee: "unresolved",
    flashFeeSource: "unresolved",
    flashLoanProvider: "unconfigured",
    totalFlashRepaymentDiem: "unresolved",
    minDiemOut: exitParams.minDiemOut.toString(),
    morphoRepayCovered: exitParams.minDiemOut >= exitParams.repayAmountDiem,
    feeInclusiveRepayCovered: "blocked",
    reason: unresolvedReason,
  };
}
