// D.4 Automation — synthesis §H Week 4.
//
// Two-pane policy editor + live policy list. Policy creation goes through
// sdk.buildAuthorization with primaryType = "AutomationExec" per B.4
// SDK note. There is NO createPolicy method.

import { useConnectedAccount as useAccount } from "../wallet/index.js";
import { PolicyEditor, type PolicyDraft } from "../components/PolicyEditor.js";
import { LivePolicies } from "../components/LivePolicies.js";
import { useMarketContext } from "../hooks/useMarketContext.js";
import { useAutomationPolicies } from "../hooks/useAutomationPolicies.js";
import { useRevoke } from "../hooks/useRevoke.js";
import type { Policy } from "@wstdiem/sdk";

export function Automation(): JSX.Element {
  const account = useAccount();
  const { activeMarket } = useMarketContext();
  const policiesQuery = useAutomationPolicies({
    owner: account.address,
    ...(activeMarket ? { market: activeMarket } : {}),
  });
  const revoke = useRevoke();

  if (!account.isConnected) {
    return (
      <div
        className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-muted"
        data-testid="automation-disconnected"
      >
        <h2 className="text-base font-semibold text-text">
          No wallet connected
        </h2>
        <p className="mt-1">
          Connect a wallet to create or revoke automation policies.
        </p>
      </div>
    );
  }

  const onSignPolicy = async (draft: PolicyDraft): Promise<void> => {
    // Phase 5 wires:
    //   const action = buildAutomationExecAction(draft, market, owner);
    //   const { typedData, digest } = await build.buildAuthorization.mutateAsync(action);
    //   const sig = await signTypedData(typedData);
    //   await build.attachSignature.mutateAsync({ action, signature: sig, expectedDigest: digest });
    // eslint-disable-next-line no-console
    console.warn("Automation.onSignPolicy: live flow lands in Phase 5", draft);
  };

  const onRevoke = async (policy: Policy): Promise<void> => {
    try {
      await revoke.mutateAsync({ target: policy.policyId });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Automation revoke failed:", err);
    }
  };

  return (
    <div
      className="grid gap-4 lg:grid-cols-2"
      data-testid="automation-screen"
    >
      <PolicyEditor
        onSignPolicy={(draft) => {
          void onSignPolicy(draft);
        }}
      />
      <LivePolicies
        policies={policiesQuery.data}
        isLoading={policiesQuery.isLoading}
        onRevoke={(p) => {
          void onRevoke(p);
        }}
      />
    </div>
  );
}
