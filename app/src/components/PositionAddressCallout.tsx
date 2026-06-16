// PositionAddressCallout — Gearbox-adjacent framing per synthesis B.3.
//
// One-line callout reminding the user the loop is bound to their EOA, with
// no intermediating sub-account or credit-account.

import { truncate } from "./PreviewDrawer.js";

interface PositionAddressCalloutProps {
  owner: string | undefined;
}

export function PositionAddressCallout(
  props: PositionAddressCalloutProps,
): JSX.Element {
  return (
    <div
      data-testid="position-address-callout"
      className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-text-muted"
    >
      <p>
        This loop is bound to your EOA{" "}
        <code className="font-mono text-text" title={props.owner}>
          {truncate(props.owner)}
        </code>
        . There is no sub-account or credit-account intermediating it.
      </p>
    </div>
  );
}
