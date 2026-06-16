import { Component, type ReactNode } from "react";
import { Router } from "./router.js";
import { IndexerKeyMissingError } from "./hooks/useSdk.js";

/** C-2 closure: catches the IndexerKeyMissingError thrown by useSdk in
 * production builds when VITE_INDEXER_PUBKEY is unset/zero. Renders a
 * blocking error screen rather than letting the app silently boot without
 * indexer signature verification. */
class BootBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override render(): ReactNode {
    const err = this.state.error;
    if (!err) return this.props.children;
    if (err instanceof IndexerKeyMissingError) {
      return (
        <div
          role="alert"
          data-testid="boot-indexer-key-missing"
          style={{
            padding: "32px",
            maxWidth: 720,
            margin: "64px auto",
            border: "2px solid rgb(232 92 92)",
            background: "rgb(38 14 14)",
            color: "rgb(252 198 198)",
            borderRadius: 12,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>
            App refused to start
          </h1>
          <p style={{ marginTop: 12 }}>
            <code>VITE_INDEXER_PUBKEY</code> is unset or zero. Production
            builds fail closed when the indexer manifest signing key is
            missing (PR-14 H-3 trust boundary). Set the registry-pinned
            key in your deployment env and reload.
          </p>
        </div>
      );
    }
    // Re-throw any other error so the surrounding test infrastructure /
    // dev-error overlay handles it.
    throw err;
  }
}

export function App() {
  return (
    <BootBoundary>
      <Router />
    </BootBoundary>
  );
}
