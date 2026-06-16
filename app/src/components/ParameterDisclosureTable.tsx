// ParameterDisclosureTable — Lybra pattern (synthesis B.5).
// Mutable risk parameters shown with owner / bound / current / last-changed.
//
// Phase 1 ships the table shape with a hardcoded fallback set of parameters
// from PROTOCOL.md + a "pending SDK exposure" note for params the SDK doesn't yet
// expose. PR-16 follow-up: hoist the param list into LoopRegistry and read
// via a new SDK method.

export interface DisclosedParameter {
  name: string;
  owner: string;
  bound: string;
  current: string;
  /** Last-changed block. undefined means "not yet observed in current epoch." */
  lastChangedBlock: bigint | undefined;
  /** Optional tx hash for the change. */
  lastChangedTxHash?: `0x${string}` | undefined;
}

interface ParameterDisclosureTableProps {
  parameters: readonly DisclosedParameter[];
}

/** Phase 1 fallback set — these are the parameters PROTOCOL.md names as mutable
 * risk dials. The SDK does not expose them yet (PR-16 follow-up). */
export const PHASE_1_DISCLOSED_PARAMETERS: readonly DisclosedParameter[] = [
  {
    name: "forceExitBufferBps",
    owner: "Guardian",
    bound: "[100, 1000] bps",
    current: "250 bps",
    lastChangedBlock: undefined,
  },
  {
    name: "anchorMaxStaleBlocks",
    owner: "Owner",
    bound: "[50, 500] blocks",
    current: "100 blocks",
    lastChangedBlock: undefined,
  },
  {
    name: "harvestCoolingBlocks",
    owner: "Owner",
    bound: "[10, 1000] blocks",
    current: "—",
    lastChangedBlock: undefined,
  },
  {
    name: "maxLeverageBps",
    owner: "Owner",
    bound: "[10000, 60000] bps",
    current: "—",
    lastChangedBlock: undefined,
  },
  {
    name: "permissionlessCallerAllowList",
    owner: "Owner",
    bound: "size ≤ 16",
    current: "—",
    lastChangedBlock: undefined,
  },
];

export function ParameterDisclosureTable(
  props: ParameterDisclosureTableProps,
): JSX.Element {
  return (
    <table
      data-testid="parameter-disclosure-table"
      className="w-full text-left text-xs"
    >
      <thead className="text-text-muted">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Parameter</th>
          <th className="py-1.5 pr-3 font-medium">Owner</th>
          <th className="py-1.5 pr-3 font-medium">Bound</th>
          <th className="py-1.5 pr-3 font-medium">Current</th>
          <th className="py-1.5 pr-3 font-medium">Last changed</th>
        </tr>
      </thead>
      <tbody className="font-mono text-text">
        {props.parameters.map((p) => (
          <tr
            key={p.name}
            className="border-t border-border/60"
            data-testid={`parameter-row-${p.name}`}
          >
            <td className="py-1.5 pr-3">{p.name}</td>
            <td className="py-1.5 pr-3">{p.owner}</td>
            <td className="py-1.5 pr-3">{p.bound}</td>
            <td className="py-1.5 pr-3">{p.current}</td>
            <td className="py-1.5 pr-3">
              {p.lastChangedBlock !== undefined
                ? `block ${p.lastChangedBlock.toString()}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
