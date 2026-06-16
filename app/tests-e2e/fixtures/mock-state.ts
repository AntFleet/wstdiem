// State-bit constants mirrored locally so specs can build readiness
// payloads without importing the SDK at test-time.
//
// The on-the-wire values match PROTOCOL.md §7.1 and `@wstdiem/sdk`'s StateBit
// enum. This file is hand-maintained — when the SDK adds a named bit,
// append it here. The state-bit-banner spec asserts every named bit
// surfaces with a per-row matrix description, so a missed entry there
// produces a test failure that nudges the maintainer back to this file.

export const STATE_BITS = {
  AUDIT_GATE_CLOSED: 1 << 0,
  CONFIG_INTEGRITY_FAILURE: 1 << 1,
  PAUSE_OPEN_INCREASE: 1 << 2,
  ORACLE_DEGRADED: 1 << 3,
  CURVE_LIQUIDITY_INSUFFICIENT: 1 << 4,
  FLASH_LIQUIDITY_UNAVAILABLE: 1 << 5,
  MORPHO_OWNER_EVIDENCE_MISSING: 1 << 6,
  SEQUENCER_DOWN_OR_GRACE: 1 << 7,
  INCIDENT_INVESTIGATING: 1 << 8,
  INCIDENT_MITIGATING: 1 << 9,
  VAULT_EVIDENCE_MISSING: 1 << 10,
} as const;

export const STATE_BIT_NAMES = Object.keys(STATE_BITS) as Array<
  keyof typeof STATE_BITS
>;

/** Bit value -> PROTOCOL.md row name used in StateBitmapBanner data-testid. */
export function bitName(value: number): string | undefined {
  for (const [name, v] of Object.entries(STATE_BITS)) {
    if (v === value) return name;
  }
  return undefined;
}
