// useForceExitFlow — gates the force-exit confirmation panel.
//
// The flow is:
//   1. User types the literal token "FORCE-EXIT" → typedConfirmed = true.
//   2. User checks every set bit in acknowledgedRisks → allBitsChecked = true.
//   3. The dwell countdown arms when (1) && (2) and runs ≥ 3 seconds →
//      dwellElapsed = true.
//   4. Sign button enables only when typedConfirmed && allBitsChecked &&
//      dwellElapsed && !signing.
//
// Disarming (any of typedConfirmed / allBitsChecked flipping to false)
// resets the dwell timer.

import { useCallback, useMemo, useState } from "react";
import {
  evaluateChecklist,
  type BitDescriptor,
} from "../components/PerBitChecklist.js";

export const FORCE_EXIT_TYPED_TOKEN = "FORCE-EXIT";

interface UseForceExitFlowArgs {
  /** acknowledgedRisks bitmap from the ForceExit action being signed. */
  acknowledgedRisks: number;
  /** Bit descriptor registry — typically FORCE_EXIT_RISK_BITS. */
  bitRegistry: readonly BitDescriptor[];
}

export interface ForceExitFlowState {
  typedConfirm: string;
  setTypedConfirm: (next: string) => void;
  checkedBits: number;
  setCheckedBits: (next: number) => void;

  typedConfirmed: boolean;
  allBitsChecked: boolean;
  /** True when typed-confirm passes AND every set bit is checked — the
   * dwell countdown should arm on this transition. */
  armed: boolean;
  dwellElapsed: boolean;
  markDwellElapsed: () => void;

  signing: boolean;
  setSigning: (next: boolean) => void;

  signEnabled: boolean;
  reset: () => void;
}

export function useForceExitFlow(
  args: UseForceExitFlowArgs,
): ForceExitFlowState {
  const [typedConfirm, setTypedConfirm] = useState("");
  const [checkedBits, setCheckedBits] = useState(0);
  const [dwellElapsed, setDwellElapsed] = useState(false);
  const [signing, setSigning] = useState(false);

  const { allChecked } = useMemo(
    () =>
      evaluateChecklist(
        args.bitRegistry,
        args.acknowledgedRisks,
        checkedBits,
      ),
    [args.bitRegistry, args.acknowledgedRisks, checkedBits],
  );

  const typedConfirmed = typedConfirm === FORCE_EXIT_TYPED_TOKEN;
  const armed = typedConfirmed && allChecked;

  // Disarm + reset dwell when any gate flips back to false. Use a derived
  // armed value to drive the DwellCountdown component; the elapsed-marker
  // here only flips forward when the countdown actually completes.
  const setCheckedBitsWrapper = useCallback((next: number) => {
    setCheckedBits(next);
    // If unchecking reduces below required, drop the elapsed flag.
    setDwellElapsed(false);
  }, []);

  const setTypedConfirmWrapper = useCallback((next: string) => {
    setTypedConfirm(next);
    if (next !== FORCE_EXIT_TYPED_TOKEN) {
      setDwellElapsed(false);
    }
  }, []);

  const markDwellElapsed = useCallback(() => {
    setDwellElapsed(true);
  }, []);

  const reset = useCallback(() => {
    setTypedConfirm("");
    setCheckedBits(0);
    setDwellElapsed(false);
    setSigning(false);
  }, []);

  const signEnabled = armed && dwellElapsed && !signing;

  return {
    typedConfirm,
    setTypedConfirm: setTypedConfirmWrapper,
    checkedBits,
    setCheckedBits: setCheckedBitsWrapper,
    typedConfirmed,
    allBitsChecked: allChecked,
    armed,
    dwellElapsed,
    markDwellElapsed,
    signing,
    setSigning,
    signEnabled,
    reset,
  };
}
