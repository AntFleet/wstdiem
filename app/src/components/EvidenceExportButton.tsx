// EvidenceExportButton — file download + clipboard copy. Synthesis G.12.
//
// Exports the canonical ActionEvidence (sorted sources[] + stateBitmap +
// blockNumber) the executor hashes — auditors and integrators consume both
// shapes.

import { useState } from "react";
import type { ActionEvidence } from "@wstdiem/sdk";

interface EvidenceExportButtonProps {
  /** When undefined, the buttons render disabled (no bundle to export). */
  bundle: ActionEvidence | undefined;
  /** Filename without extension. Default "wstdiem-evidence". */
  filename?: string;
}

function bigintSafeReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function EvidenceExportButton(
  props: EvidenceExportButtonProps,
): JSX.Element {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const filename = props.filename ?? "wstdiem-evidence";
  const disabled = props.bundle === undefined;

  const serialized = props.bundle
    ? JSON.stringify(props.bundle, bigintSafeReplacer, 2)
    : "";

  const onDownload = (): void => {
    if (!props.bundle) return;
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onCopy = async (): Promise<void> => {
    if (!props.bundle) return;
    try {
      await navigator.clipboard.writeText(serialized);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("failed");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onDownload}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-text hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        data-testid="evidence-download"
      >
        Download JSON
      </button>
      <button
        type="button"
        onClick={onCopy}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-text hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        data-testid="evidence-copy"
        aria-live="polite"
      >
        {copyState === "copied"
          ? "Copied ✓"
          : copyState === "failed"
          ? "Copy failed"
          : "Copy to clipboard"}
      </button>
    </div>
  );
}
