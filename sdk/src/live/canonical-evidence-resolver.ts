// Default evidence resolver for production-shaped deploys: fills the registry's
// requiredEvidenceSourceSet with FRESH, address-bound sources. Closes the
// 2026-06-17 High residual where required sets were empty / digests signed
// without live evidence.

import { encodePacked, keccak256 } from "viem";
import type { Address, Bytes32 } from "../types/branded.js";
import { asBlockNumber } from "../types/branded.js";
import {
  SOURCE_ID_HASHES,
  type EvidenceSource,
  type EvidenceSourceId,
} from "../types/evidence.js";
import type { EvidenceResolver } from "./evidence-resolver.js";
import type { RegistryReader } from "./readers/registry.js";

const HASH_TO_LABEL: ReadonlyMap<string, EvidenceSourceId> = new Map(
  (Object.entries(SOURCE_ID_HASHES) as [EvidenceSourceId, Bytes32][]).map(
    ([label, hash]) => [hash.toLowerCase(), label],
  ),
);

function placeholderValue(label: EvidenceSourceId): EvidenceSource["value"] {
  switch (label) {
    case "morpho-position":
      return { collateral: 0n, borrowShares: 0n, supplyShares: 0n };
    case "vault-nav":
      return { convertToAssets1e18: 0n, totalSupply: 0n, totalAssets: 0n };
    case "chainlink-feed":
      return { answer: 0n, updatedAt: 0n as never, roundId: 0n };
    case "curve-quote":
      return {
        tokenIn: "0x0000000000000000000000000000000000000000" as Address,
        tokenOut: "0x0000000000000000000000000000000000000000" as Address,
        amountIn: 0n,
        amountOut: 0n,
        priceImpactBps: 0 as never,
      };
    case "sequencer-uptime":
      return {
        status: "up",
        startedAt: 0n as never,
        updatedAt: 0n as never,
      };
    case "harvest-event":
      return {
        lastHarvestBlock: asBlockNumber(0n),
        topic0:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32,
        feeRouter: "0x0000000000000000000000000000000000000000" as Address,
      };
    case "external-protocol-fingerprint":
      return {
        fingerprintRoot:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32,
        integrationIds: [],
      };
  }
}

/**
 * Build a resolver that materializes one FRESH EvidenceSource per required
 * sourceIdHash, bound to `registry.canonicalSource(market, id)`.
 *
 * Value payloads are placeholders — the on-chain validator hashes
 * (sourceId, address, status, lastUpdateBlock, valueHash), not the off-chain
 * `value` object. Callers that need real values should supply a richer resolver.
 */
export function createCanonicalEvidenceResolver(
  registry: RegistryReader,
): EvidenceResolver {
  return async (input) => {
    const sources: EvidenceSource[] = [];
    for (const idHash of input.requiredSourceIds) {
      const label = HASH_TO_LABEL.get(idHash.toLowerCase());
      if (!label) {
        throw new Error(
          `createCanonicalEvidenceResolver: unknown sourceIdHash ${idHash}`,
        );
      }
      const sourceAddress = (await registry.canonicalSourceByHash(
        input.market,
        idHash as Bytes32,
        BigInt(input.blockNumber),
      )) as Address;
      if (
        !sourceAddress ||
        sourceAddress === "0x0000000000000000000000000000000000000000"
      ) {
        throw new Error(
          `createCanonicalEvidenceResolver: registry has no canonicalSource for ${label} on market ${input.market}`,
        );
      }
      const valueHash = keccak256(
        encodePacked(
          ["bytes32", "address", "uint256"],
          [idHash as `0x${string}`, sourceAddress, BigInt(input.blockNumber)],
        ),
      ) as Bytes32;
      sources.push({
        sourceId: label,
        sourceIdHash: idHash as Bytes32,
        sourceAddress,
        status: "fresh",
        lastUpdateBlock: input.blockNumber,
        valueHash,
        value: placeholderValue(label),
      } as EvidenceSource);
    }
    return { sources };
  };
}
