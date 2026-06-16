// Branded ID types per the SDK type definitions.
// Phantom-tagging an unrelated primitive (number/bigint/Hex) prevents accidentally
// passing a wrong-kind value to a parameter that expects a specific branded type.

export type Hex = `0x${string}`;
export type Address = Hex;
export type Bytes32 = Hex;
export type UIntString = `${bigint}`;

declare const brand: unique symbol;
export type Branded<T, Name extends string> = T & { readonly [brand]: Name };

export type ChainId = Branded<number, "ChainId">;
export type MarketId = Branded<Bytes32, "MarketId">;
export type ActionDigest = Branded<Bytes32, "ActionDigest">;
export type PolicyId = Branded<bigint, "PolicyId">;
export type RouteId = Branded<Bytes32, "RouteId">;
export type QuoteId = Branded<Bytes32, "QuoteId">;
export type RegistryVersion = Branded<bigint, "RegistryVersion">;
export type BasisPoints = Branded<number, "BasisPoints">;
export type BlockNumber = Branded<bigint, "BlockNumber">;
export type UnixSeconds = Branded<bigint, "UnixSeconds">;
export type ProposalId = Branded<Bytes32, "ProposalId">;
export type StateBitmap = Branded<number, "StateBitmap">;

// Brand constructors with runtime range validation for numeric types whose
// on-chain ABI width is bounded (uint16 for BasisPoints / StateBitmap, uint63
// for ChainId since EIP-155 limits to chainId < 2^63). String/bytes32 brands
// are unchecked — callers should validate hex shape via viem isHex / isAddress
// before calling. They erase brand safety.

function assertUintRange(v: number, name: string, maxExclusive: number): void {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= maxExclusive) {
    throw new RangeError(`${name} out of range: ${v} (expected uint in [0, ${maxExclusive}))`);
  }
}

export const asChainId = (v: number): ChainId => {
  assertUintRange(v, "ChainId", 2 ** 31);
  return v as ChainId;
};
export const asMarketId = (v: Bytes32): MarketId => v as MarketId;
export const asActionDigest = (v: Bytes32): ActionDigest => v as ActionDigest;
export const asPolicyId = (v: bigint): PolicyId => {
  if (typeof v !== "bigint" || v < 0n || v >= 1n << 64n) {
    throw new RangeError(`PolicyId out of range: ${v} (expected uint64)`);
  }
  return v as PolicyId;
};
export const asRouteId = (v: Bytes32): RouteId => v as RouteId;
export const asQuoteId = (v: Bytes32): QuoteId => v as QuoteId;
export const asRegistryVersion = (v: bigint): RegistryVersion => {
  if (typeof v !== "bigint" || v < 0n) {
    throw new RangeError(`RegistryVersion out of range: ${v} (expected non-negative bigint)`);
  }
  return v as RegistryVersion;
};
export const asBasisPoints = (v: number): BasisPoints => {
  assertUintRange(v, "BasisPoints", 1 << 16);
  return v as BasisPoints;
};
export const asBlockNumber = (v: bigint): BlockNumber => {
  if (typeof v !== "bigint" || v < 0n) {
    throw new RangeError(`BlockNumber out of range: ${v} (expected non-negative bigint)`);
  }
  return v as BlockNumber;
};
export const asUnixSeconds = (v: bigint): UnixSeconds => {
  if (typeof v !== "bigint" || v < 0n) {
    throw new RangeError(`UnixSeconds out of range: ${v} (expected non-negative bigint)`);
  }
  return v as UnixSeconds;
};
export const asProposalId = (v: Bytes32): ProposalId => v as ProposalId;
export const asStateBitmap = (v: number): StateBitmap => {
  assertUintRange(v, "StateBitmap", 1 << 16);
  return v as StateBitmap;
};
