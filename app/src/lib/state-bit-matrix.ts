// PROTOCOL.md §7.1 Degraded-Mode Matrix lookup.
//
// M-5 closure: synthesis §C.3 requires "which actions blocked / conditionally
// allowed by which P-predicate" in visible banner text on the
// StateBitmapBanner for `named` + `incident` severities. Tooltips do not
// satisfy the §13.4 screenshot acceptance.
//
// This module encodes the §7.1 matrix rows (lines 729-741 of PROTOCOL.md)
// per bit. The encoding maps each (StateBit, ActionClass) pair to either
// blocked / allowed / conditional-on-predicate. `describeBitForBanner`
// formats a per-bit row into visible copy.

import { StateBit } from "@wstdiem/sdk";

export type ActionClass =
  | "Open"
  | "RebalanceDown"
  | "RepayOnly"
  | "PartialDeleverage"
  | "FullExit"
  | "ForceExit"
  | "Revoke";

export type CellResult =
  | { kind: "blocked" }
  | { kind: "allowed" }
  | { kind: "conditional"; predicate: string };

const BLOCKED: CellResult = { kind: "blocked" };
const ALLOWED: CellResult = { kind: "allowed" };
function CONDITIONAL(p: string): CellResult {
  return { kind: "conditional", predicate: p };
}

type Row = Record<ActionClass, CellResult>;

/** Matrix per PROTOCOL.md §7.1 lines 729-741. Each row is one named StateBit;
 * each cell is the §7.1 column entry for that (bit, action) pair.
 *
 * Rows are keyed by the raw bit mask value (e.g. StateBit.AUDIT_GATE_CLOSED
 * is `1 << 0 == 1`). This keeps the lookup direct from
 * `bitmap & someBit === someBit`. */
export const STATE_BIT_MATRIX: Record<number, Row> = {
  // AUDIT_GATE_CLOSED: every action blocked except Revoke (direct on-chain).
  [StateBit.AUDIT_GATE_CLOSED]: {
    Open: BLOCKED,
    RebalanceDown: BLOCKED,
    RepayOnly: BLOCKED,
    PartialDeleverage: BLOCKED,
    FullExit: BLOCKED,
    ForceExit: BLOCKED,
    Revoke: ALLOWED,
  },
  // CONFIG_INTEGRITY_FAILURE: every action blocked except Revoke.
  [StateBit.CONFIG_INTEGRITY_FAILURE]: {
    Open: BLOCKED,
    RebalanceDown: BLOCKED,
    RepayOnly: BLOCKED,
    PartialDeleverage: BLOCKED,
    FullExit: BLOCKED,
    ForceExit: BLOCKED,
    Revoke: ALLOWED,
  },
  // PAUSE_OPEN_INCREASE: Open blocked; everything else allowed.
  [StateBit.PAUSE_OPEN_INCREASE]: {
    Open: BLOCKED,
    RebalanceDown: ALLOWED,
    RepayOnly: ALLOWED,
    PartialDeleverage: ALLOWED,
    FullExit: ALLOWED,
    ForceExit: ALLOWED,
    Revoke: ALLOWED,
  },
  // ORACLE_DEGRADED: rebalance-down conditional on P1; repay on P2;
  // force-exit on P6; partial-deleverage + full-exit blocked.
  [StateBit.ORACLE_DEGRADED]: {
    Open: BLOCKED,
    RebalanceDown: CONDITIONAL("P1"),
    RepayOnly: CONDITIONAL("P2"),
    PartialDeleverage: BLOCKED,
    FullExit: BLOCKED,
    ForceExit: CONDITIONAL("P6"),
    Revoke: ALLOWED,
  },
  // CURVE_LIQUIDITY_INSUFFICIENT: Open allowed (Phase 1 Open does not use
  // Curve); RebalanceDown / RepayOnly / PartialDeleverage / FullExit cond
  // on P4; ForceExit on P7.
  [StateBit.CURVE_LIQUIDITY_INSUFFICIENT]: {
    Open: ALLOWED,
    RebalanceDown: CONDITIONAL("P4"),
    RepayOnly: CONDITIONAL("P4"),
    PartialDeleverage: CONDITIONAL("P4"),
    FullExit: CONDITIONAL("P4"),
    ForceExit: CONDITIONAL("P7"),
    Revoke: ALLOWED,
  },
  // FLASH_LIQUIDITY_UNAVAILABLE: Open blocked; RebalanceDown blocked when
  // flash-using; RepayOnly / PartialDeleverage / FullExit cond on P5;
  // ForceExit cond on P5 ∨ P8.
  [StateBit.FLASH_LIQUIDITY_UNAVAILABLE]: {
    Open: BLOCKED,
    RebalanceDown: BLOCKED,
    RepayOnly: CONDITIONAL("P5"),
    PartialDeleverage: CONDITIONAL("P5"),
    FullExit: CONDITIONAL("P5"),
    ForceExit: CONDITIONAL("P5 ∨ P8"),
    Revoke: ALLOWED,
  },
  // MORPHO_OWNER_EVIDENCE_MISSING: Open / RebalanceDown / PartialDeleverage
  // / FullExit / ForceExit blocked; RepayOnly cond on P3.
  [StateBit.MORPHO_OWNER_EVIDENCE_MISSING]: {
    Open: BLOCKED,
    RebalanceDown: BLOCKED,
    RepayOnly: CONDITIONAL("P3"),
    PartialDeleverage: BLOCKED,
    FullExit: BLOCKED,
    ForceExit: BLOCKED,
    Revoke: ALLOWED,
  },
  // SEQUENCER_DOWN_OR_GRACE: Open / RebalanceDown / PartialDeleverage /
  // FullExit blocked; RepayOnly cond on P11; ForceExit cond on P9.
  [StateBit.SEQUENCER_DOWN_OR_GRACE]: {
    Open: BLOCKED,
    RebalanceDown: BLOCKED,
    RepayOnly: CONDITIONAL("P11"),
    PartialDeleverage: BLOCKED,
    FullExit: BLOCKED,
    ForceExit: CONDITIONAL("P9"),
    Revoke: ALLOWED,
  },
  // INCIDENT_INVESTIGATING: Open blocked; everything else allowed.
  [StateBit.INCIDENT_INVESTIGATING]: {
    Open: BLOCKED,
    RebalanceDown: ALLOWED,
    RepayOnly: ALLOWED,
    PartialDeleverage: ALLOWED,
    FullExit: ALLOWED,
    ForceExit: ALLOWED,
    Revoke: ALLOWED,
  },
  // INCIDENT_MITIGATING: Open / RebalanceDown / PartialDeleverage blocked;
  // RepayOnly / FullExit / ForceExit allowed.
  [StateBit.INCIDENT_MITIGATING]: {
    Open: BLOCKED,
    RebalanceDown: BLOCKED,
    RepayOnly: ALLOWED,
    PartialDeleverage: BLOCKED,
    FullExit: ALLOWED,
    ForceExit: ALLOWED,
    Revoke: ALLOWED,
  },
  // VAULT_EVIDENCE_MISSING: Open / RebalanceDown / PartialDeleverage /
  // FullExit blocked; RepayOnly allowed; ForceExit cond on P10.
  [StateBit.VAULT_EVIDENCE_MISSING]: {
    Open: BLOCKED,
    RebalanceDown: BLOCKED,
    RepayOnly: ALLOWED,
    PartialDeleverage: BLOCKED,
    FullExit: BLOCKED,
    ForceExit: CONDITIONAL("P10"),
    Revoke: ALLOWED,
  },
};

/** Format a single set bit's row as visible banner copy.
 *
 *   "OracleDegraded: Open, PartialDeleverage, FullExit blocked;
 *    RebalanceDown if P1, RepayOnly if P2, ForceExit if P6;
 *    Revoke remains available."
 *
 * The returned string is plain text suitable for `.textContent` and
 * §13.4 screenshot acceptance. */
export function describeBitForBanner(bit: number, bitName: string): string {
  const row = STATE_BIT_MATRIX[bit];
  if (!row) return `${bitName}: matrix unavailable.`;
  const blocked: ActionClass[] = [];
  const conditional: Array<{ action: ActionClass; predicate: string }> = [];
  // Iterate in column order so the banner copy matches §7.1's column order.
  const order: ActionClass[] = [
    "Open",
    "RebalanceDown",
    "RepayOnly",
    "PartialDeleverage",
    "FullExit",
    "ForceExit",
    "Revoke",
  ];
  for (const action of order) {
    const cell = row[action];
    if (cell.kind === "blocked") blocked.push(action);
    else if (cell.kind === "conditional") {
      conditional.push({ action, predicate: cell.predicate });
    }
  }
  const parts: string[] = [];
  if (blocked.length) parts.push(`${blocked.join(", ")} blocked`);
  if (conditional.length) {
    parts.push(
      conditional
        .map((c) => `${c.action} if ${c.predicate}`)
        .join(", "),
    );
  }
  // Revoke is always available per §7.1's last column.
  parts.push("Revoke remains available");
  return `${bitName}: ${parts.join("; ")}.`;
}
