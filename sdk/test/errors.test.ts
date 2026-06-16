import { describe, it, expect } from "vitest";
import {
  CANONICAL_ERRORS,
  getErrorByName,
  getErrorBySelector,
  decodeRevertSelector,
  type FailClosedErrorName,
} from "../src/errors/registry.js";
import { PINNED_ERROR_SELECTORS } from "./fixtures.js";

describe("FailClosedErrorName registry", () => {
  it("computes the contract-pinned bytes4 selector for every zero-arg error", () => {
    for (const [name, pinned] of Object.entries(PINNED_ERROR_SELECTORS)) {
      const entry = getErrorByName(name as FailClosedErrorName);
      expect(entry, `missing entry for ${name}`).toBeDefined();
      expect(entry!.selector.toLowerCase()).toBe(pinned.toLowerCase());
    }
  });

  it("decodes a revert by 4-byte selector", () => {
    const wrongChainData = `${PINNED_ERROR_SELECTORS.WrongChain}` as `0x${string}`;
    const decoded = decodeRevertSelector(wrongChainData);
    expect(decoded?.name).toBe("WrongChain");
    expect(decoded?.contractEmitted).toBe(true);
  });

  it("returns undefined for an unknown selector", () => {
    expect(getErrorBySelector("0xdeadbeef")).toBeUndefined();
    expect(decodeRevertSelector("0xdeadbeef")).toBeUndefined();
    expect(decodeRevertSelector("0x" as `0x${string}`)).toBeUndefined();
  });

  it("registry includes the §A5 SDK-only gates with contractEmitted=false", () => {
    const indexer = getErrorByName("IndexerAnchorStale");
    expect(indexer?.contractEmitted).toBe(false);
    const quorum = getErrorByName("RpcQuorumNotIndependent");
    expect(quorum?.contractEmitted).toBe(false);
  });

  it("every registered error has a unique selector", () => {
    const seen = new Map<string, FailClosedErrorName>();
    for (const e of CANONICAL_ERRORS) {
      const prev = seen.get(e.selector);
      expect(
        prev,
        `duplicate selector ${e.selector} between ${e.name} and ${prev}`,
      ).toBeUndefined();
      seen.set(e.selector, e.name);
    }
  });
});
