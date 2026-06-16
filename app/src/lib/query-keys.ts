// React Query queryKey helpers.
//
// m-do-1 closure: `queryKey: ["preview", args.action ?? "no-action"]` in
// usePreview.ts collapses every Action to `[object Object]` because React
// Query's default serializer JSON.stringifies the key — and our Action
// objects contain bigints (which JSON.stringify throws on, and which the
// fallback toString does NOT do a stable round-trip on). Different actions
// share the same cache key.
//
// `actionToKey` produces a stable string for cache-key purposes only. It is
// NOT a canonical EIP-712 serialization — for that, use the SDK's
// buildAuthorization → digest path.

import type { Action } from "@wstdiem/sdk";

/** Stable JSON-with-bigints serializer. Sorts keys recursively so two
 * structurally-equal objects with different property order share a key. */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value === "bigint") return `"${value.toString()}n"`;
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    );
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Reduce an Action to a stable string suitable for use inside a
 * queryKey tuple. */
export function actionToKey(action: Action): string {
  return stableStringify(action);
}
