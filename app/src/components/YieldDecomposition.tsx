// YieldDecomposition — 5-row table per synthesis B.3.
//
// The Pendle-inspired intent tabs route discovery; this table answers
// "where is the spread coming from and where is it going?"

interface YieldRowProps {
  walletWstDiemApr?: number; // BPS or undefined for sentinel
  morphoBorrowApr?: number;
  curveRouteFeeApr?: number;
  flashFeeApr?: number;
  feeRouterCutApr?: number;
}

function fmtApr(value: number | undefined): string {
  if (value === undefined) return "—";
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value / 100).toFixed(2)}%`;
}

export function YieldDecomposition(
  props: YieldRowProps,
): JSX.Element {
  const net =
    props.walletWstDiemApr === undefined ||
    props.morphoBorrowApr === undefined ||
    props.curveRouteFeeApr === undefined ||
    props.flashFeeApr === undefined ||
    props.feeRouterCutApr === undefined
      ? undefined
      : props.walletWstDiemApr -
        props.morphoBorrowApr -
        props.curveRouteFeeApr -
        props.flashFeeApr -
        props.feeRouterCutApr;
  return (
    <table data-testid="yield-decomposition" className="w-full text-left text-xs">
      <tbody className="font-mono text-text">
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">
            wstDIEM yield (accrues even while pledged)
          </td>
          <td className="py-1 pr-3 text-right text-risk-green">
            {fmtApr(props.walletWstDiemApr)}
          </td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Morpho borrow</td>
          <td className="py-1 pr-3 text-right text-risk-red">
            −{fmtApr(props.morphoBorrowApr).replace(/^[−+]/, "")}
          </td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Curve route fee</td>
          <td className="py-1 pr-3 text-right text-risk-red">
            −{fmtApr(props.curveRouteFeeApr).replace(/^[−+]/, "")}
          </td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Flash fee</td>
          <td className="py-1 pr-3 text-right text-risk-red">
            −{fmtApr(props.flashFeeApr).replace(/^[−+]/, "")}
          </td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Fee router cut</td>
          <td className="py-1 pr-3 text-right text-risk-red">
            −{fmtApr(props.feeRouterCutApr).replace(/^[−+]/, "")}
          </td>
        </tr>
        <tr className="border-t-2 border-border">
          <td className="py-2 pr-3 font-semibold text-text">Net loop spread</td>
          <td
            className={`py-2 pr-3 text-right font-semibold ${
              net === undefined
                ? "text-text-muted"
                : net >= 0
                ? "text-risk-green"
                : "text-risk-red"
            }`}
            data-testid="yield-net-spread"
          >
            {fmtApr(net)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
