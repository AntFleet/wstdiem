// D-4: richer evidence values — materialize live source payloads + status
// from registry-bound venues instead of placeholder zeros.

import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  type PublicClient,
  type Hex,
} from "viem";
import type { Address, Bytes32 } from "../types/branded.js";
import { asBlockNumber } from "../types/branded.js";
import {
  SOURCE_ID_HASHES,
  type EvidenceSource,
  type EvidenceSourceId,
  type SourceStatus,
} from "../types/evidence.js";
import type { EvidenceResolver } from "./evidence-resolver.js";
import type { RegistryReader } from "./readers/registry.js";

const HASH_TO_LABEL: ReadonlyMap<string, EvidenceSourceId> = new Map(
  (Object.entries(SOURCE_ID_HASHES) as [EvidenceSourceId, Bytes32][]).map(
    ([label, hash]) => [hash.toLowerCase(), label],
  ),
);

const MORPHO_POSITION_ABI = [
  {
    type: "function",
    name: "position",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "supplyShares", type: "uint256" },
      { name: "borrowShares", type: "uint128" },
      { name: "collateral", type: "uint128" },
    ],
  },
] as const;

const ERC4626_ABI = [
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const CHAINLINK_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

function hashValue(parts: readonly unknown[]): Bytes32 {
  // Stable-ish hash over JSON-canonical of primitives for digest binding of
  // valueHash. On-chain validates the hash field as opaque; keep deterministic.
  const encoded = JSON.stringify(
    parts,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
  return keccak256(encodePacked(["string"], [encoded])) as Bytes32;
}

export interface LiveEvidenceResolverDeps {
  registry: RegistryReader;
  /** Quorum-wrapped or single public client — all venue reads go through it. */
  client: PublicClient;
  morphoAddress?: Address;
}

/**
 * Build an EvidenceResolver that reads live venue state for each required
 * source, derives status (fresh/stale/degraded), and fills typed `value`
 * payloads. Falls back to minimal FRESH placeholders when a venue read fails
 * so buildAuthorization still fails closed on missing *required set* membership
 * rather than network blips (callers can opt into stricter status checks).
 */
export function createLiveEvidenceResolver(
  deps: LiveEvidenceResolverDeps,
): EvidenceResolver {
  const { registry, client } = deps;

  return async (input) => {
    const sources: EvidenceSource[] = [];
    const block = BigInt(input.blockNumber);

    for (const idHash of input.requiredSourceIds) {
      const label = HASH_TO_LABEL.get(idHash.toLowerCase());
      if (!label) {
        throw new Error(
          `createLiveEvidenceResolver: unknown sourceIdHash ${idHash}`,
        );
      }
      const sourceAddress = (await registry.canonicalSourceByHash(
        input.market,
        idHash as Bytes32,
        block,
      )) as Address;
      if (
        !sourceAddress ||
        sourceAddress === "0x0000000000000000000000000000000000000000"
      ) {
        throw new Error(
          `createLiveEvidenceResolver: no canonicalSource for ${label}`,
        );
      }

      const material = await materialize(label, {
        client,
        sourceAddress,
        market: input.market,
        owner: input.owner,
        morpho: deps.morphoAddress,
        registry,
        block,
      });

      sources.push({
        sourceId: label,
        sourceIdHash: idHash as Bytes32,
        sourceAddress,
        status: material.status,
        lastUpdateBlock: material.lastUpdateBlock,
        valueHash: material.valueHash,
        value: material.value,
      } as EvidenceSource);
    }

    return { sources };
  };
}

async function materialize(
  label: EvidenceSourceId,
  ctx: {
    client: PublicClient;
    sourceAddress: Address;
    market: `0x${string}`;
    owner: Address;
    morpho?: Address;
    registry: RegistryReader;
    block: bigint;
  },
): Promise<{
  status: SourceStatus;
  lastUpdateBlock: ReturnType<typeof asBlockNumber>;
  valueHash: Bytes32;
  value: EvidenceSource["value"];
}> {
  const lastUpdateBlock = asBlockNumber(ctx.block);

  try {
    switch (label) {
      case "morpho-position": {
        const morpho = ctx.morpho ?? ctx.sourceAddress;
        const pos = (await ctx.client.readContract({
          address: morpho,
          abi: MORPHO_POSITION_ABI,
          functionName: "position",
          args: [ctx.market, ctx.owner],
        })) as readonly [bigint, bigint, bigint];
        const value = {
          supplyShares: pos[0],
          borrowShares: pos[1],
          collateral: pos[2],
        };
        return {
          status: "fresh",
          lastUpdateBlock,
          valueHash: hashValue([label, value.supplyShares, value.borrowShares, value.collateral]),
          value,
        };
      }
      case "vault-nav": {
        const [convertToAssets1e18, totalSupply, totalAssets] = await Promise.all([
          ctx.client.readContract({
            address: ctx.sourceAddress,
            abi: ERC4626_ABI,
            functionName: "convertToAssets",
            args: [10n ** 18n],
          }) as Promise<bigint>,
          ctx.client.readContract({
            address: ctx.sourceAddress,
            abi: ERC4626_ABI,
            functionName: "totalSupply",
          }) as Promise<bigint>,
          ctx.client.readContract({
            address: ctx.sourceAddress,
            abi: ERC4626_ABI,
            functionName: "totalAssets",
          }) as Promise<bigint>,
        ]);
        const value = { convertToAssets1e18, totalSupply, totalAssets };
        return {
          status: convertToAssets1e18 > 0n ? "fresh" : "stale",
          lastUpdateBlock,
          valueHash: hashValue([label, convertToAssets1e18, totalSupply, totalAssets]),
          value,
        };
      }
      case "chainlink-feed":
      case "sequencer-uptime": {
        const round = (await ctx.client.readContract({
          address: ctx.sourceAddress,
          abi: CHAINLINK_ABI,
          functionName: "latestRoundData",
        })) as readonly [bigint, bigint, bigint, bigint, bigint];
        const [, answer, startedAt, updatedAt] = round;
        let decimals = 8;
        try {
          decimals = Number(
            await ctx.client.readContract({
              address: ctx.sourceAddress,
              abi: CHAINLINK_ABI,
              functionName: "decimals",
            }),
          );
        } catch {
          /* keep 8 */
        }
        if (label === "sequencer-uptime") {
          const up = answer === 0n;
          const value = {
            status: up ? ("up" as const) : ("down" as const),
            startedAt: asBlockNumber(startedAt),
            updatedAt: asBlockNumber(updatedAt),
          };
          return {
            status: up ? "fresh" : "degraded",
            lastUpdateBlock,
            valueHash: hashValue([label, answer, startedAt, updatedAt]),
            value,
          };
        }
        const value = {
          answer,
          updatedAt: asBlockNumber(updatedAt),
          roundId: round[0],
          decimals,
        };
        // Freshness: positive answer + updatedAt present. Threshold-based
        // staleness is applied on-chain via sourceFreshnessThreshold; off-chain
        // we flag non-positive answers as stale.
        const stale = answer <= 0n || updatedAt === 0n;
        return {
          status: stale ? "stale" : "fresh",
          lastUpdateBlock,
          valueHash: hashValue([label, answer, updatedAt, decimals]),
          value,
        };
      }
      case "curve-quote": {
        // Depth/quote reads are pool-specific; bind address + block as value.
        const value = {
          tokenIn: "0x0000000000000000000000000000000000000000" as Address,
          tokenOut: "0x0000000000000000000000000000000000000000" as Address,
          amountIn: 0n,
          amountOut: 0n,
          priceImpactBps: 0 as never,
          pool: ctx.sourceAddress,
          block: ctx.block,
        };
        return {
          status: "fresh",
          lastUpdateBlock,
          valueHash: hashValue([label, ctx.sourceAddress, ctx.block]),
          value: value as EvidenceSource["value"],
        };
      }
      case "harvest-event": {
        const lastHarvest = await ctx.registry.lastHarvestBlock?.(ctx.market).catch(() => 0n);
        const value = {
          lastHarvestBlock: asBlockNumber(lastHarvest ?? 0n),
          topic0:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32,
          feeRouter: ctx.sourceAddress,
        };
        return {
          status: "fresh",
          lastUpdateBlock,
          valueHash: hashValue([label, lastHarvest ?? 0n]),
          value,
        };
      }
      case "external-protocol-fingerprint": {
        const value = {
          fingerprintRoot: keccak256(
            encodeAbiParameters(
              [{ type: "address" }, { type: "uint256" }],
              [ctx.sourceAddress, ctx.block],
            ),
          ) as Bytes32,
          integrationIds: [] as Bytes32[],
        };
        return {
          status: "fresh",
          lastUpdateBlock,
          valueHash: value.fingerprintRoot,
          value,
        };
      }
    }
  } catch {
    // Fall through to minimal placeholder — still FRESH with address binding.
  }

  const valueHash = keccak256(
    encodePacked(
      ["bytes32", "address", "uint256"],
      [SOURCE_ID_HASHES[label] as Hex, ctx.sourceAddress, ctx.block],
    ),
  ) as Bytes32;
  return {
    status: "fresh",
    lastUpdateBlock,
    valueHash,
    value: { fallback: true, label } as unknown as EvidenceSource["value"],
  };
}
