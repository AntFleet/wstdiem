// ReceiptTokenLegend — Instadapp / Fluid Lite pattern (synthesis B.3).
//
// "Users must never have to guess which token is which."

interface ReceiptTokenLegendProps {
  walletDiem?: string;
  walletWstDiem?: string;
  morphoCollateralWstDiem?: string;
  morphoDebtDiem?: string;
  postLoopDiem?: string;
}

function fallback(v: string | undefined): string {
  return v ?? "—";
}

export function ReceiptTokenLegend(
  props: ReceiptTokenLegendProps,
): JSX.Element {
  return (
    <table
      data-testid="receipt-token-legend"
      className="w-full text-left text-xs"
    >
      <thead className="text-text-muted">
        <tr>
          <th className="py-1 pr-3 font-medium">Where</th>
          <th className="py-1 pr-3 font-medium">Token</th>
          <th className="py-1 pr-3 font-medium">Balance</th>
        </tr>
      </thead>
      <tbody className="font-mono text-text">
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Wallet</td>
          <td className="py-1 pr-3">wstDIEM</td>
          <td className="py-1 pr-3">{fallback(props.walletWstDiem)}</td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Morpho (collateral)</td>
          <td className="py-1 pr-3">wstDIEM</td>
          <td className="py-1 pr-3">
            {fallback(props.morphoCollateralWstDiem)}
            <span className="ml-2 text-[10px] text-text-muted">
              (still accruing yield)
            </span>
          </td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Morpho (debt)</td>
          <td className="py-1 pr-3">DIEM</td>
          <td className="py-1 pr-3">{fallback(props.morphoDebtDiem)}</td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Wallet</td>
          <td className="py-1 pr-3">DIEM</td>
          <td className="py-1 pr-3">{fallback(props.walletDiem)}</td>
        </tr>
        <tr className="border-t border-border/60">
          <td className="py-1 pr-3 text-text-muted">Post-loop output</td>
          <td className="py-1 pr-3">DIEM</td>
          <td className="py-1 pr-3">{fallback(props.postLoopDiem)}</td>
        </tr>
      </tbody>
    </table>
  );
}
