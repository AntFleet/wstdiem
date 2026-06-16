// Test helpers for the live SDK: fake PublicClient + fake fetch.
//
// We avoid msw / Anvil to keep tests deterministic and dep-free; the SDK only
// touches viem's `readContract` and `getBlockNumber`, which we stub directly.

import type { PublicClient } from "viem";

type ReadContractArgs = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

export interface ContractCallRecord {
  address: string;
  functionName: string;
  args: readonly unknown[];
}

export class FakePublicClient {
  readonly calls: ContractCallRecord[] = [];
  private readonly handlers: Map<string, (args: readonly unknown[]) => unknown>;
  private currentBlock: bigint;

  constructor(opts: {
    handlers: Record<string, (args: readonly unknown[]) => unknown>;
    blockNumber?: bigint;
  }) {
    this.handlers = new Map(Object.entries(opts.handlers));
    this.currentBlock = opts.blockNumber ?? 1_000_000n;
  }

  /** Register an address-scoped handler (`<lowercased-address>#<functionName>`). */
  setHandler(address: string, functionName: string, handler: (args: readonly unknown[]) => unknown): this {
    this.handlers.set(`${address.toLowerCase()}#${functionName}`, handler);
    return this;
  }

  /** Test-only: bump the block returned by getBlockNumber. */
  setBlockNumber(n: bigint): void {
    this.currentBlock = n;
  }

  async getBlockNumber(): Promise<bigint> {
    return this.currentBlock;
  }

  async readContract(args: ReadContractArgs): Promise<unknown> {
    const key = `${args.address.toLowerCase()}#${args.functionName}`;
    // Audit A11-2: prefer address-scoped handler. Fall back to function-name-
    // only when address-scoped key is not registered AND when the caller has
    // opted-in by setting `allowFunctionNameFallback: true`. Default to
    // address-scoped so tests catch ForceExit-vs-LoopAuth routing bugs.
    const addressScoped = this.handlers.get(key);
    const fnOnly = this.allowFunctionNameFallback ? this.handlers.get(args.functionName) : undefined;
    const handler = addressScoped ?? fnOnly;
    this.calls.push({
      address: args.address,
      functionName: args.functionName,
      args: args.args ?? [],
    });
    if (!handler) {
      throw new Error(`FakePublicClient: no handler for ${key}`);
    }
    return handler(args.args ?? []);
  }

  async getBlock(_opts?: { blockTag?: string }): Promise<{ timestamp: bigint }> {
    return { timestamp: 1_700_000_000n };
  }

  /**
   * Minimal getLogs stub used by AnchorRegistryReader.fetchManifestForBlock.
   * Returns canned `args.manifestHash` / `args.submitter` from `setLogs`.
   * Tests that don't register logs get an empty array.
   */
  async getLogs(_opts: {
    address?: `0x${string}`;
    fromBlock?: bigint;
    toBlock?: bigint;
    args?: Record<string, unknown>;
  }): Promise<unknown[]> {
    return this._logs;
  }

  setLogs(logs: unknown[]): this {
    this._logs = logs;
    return this;
  }

  private _logs: unknown[] = [];

  /** Convenience: call simulateContract is used by UniswapV3Quoter. Tests can
   * register handlers via simulateContract similar to readContract. */
  async simulateContract(args: ReadContractArgs): Promise<{ result: unknown }> {
    const result = await this.readContract(args);
    return { result };
  }

  asPublicClient(): PublicClient {
    return this as unknown as PublicClient;
  }

  private get allowFunctionNameFallback(): boolean {
    return this._allowFnFallback;
  }

  private _allowFnFallback: boolean = true;

  /** Opt out of function-name fallback (per audit A11-2). When called, tests
   * MUST register address-scoped handlers via `addressScopedHandlers`. */
  requireAddressScopedHandlers(): this {
    this._allowFnFallback = false;
    return this;
  }
}

export interface FakeFetchSpec {
  get?: Record<string, unknown>;
  errors?: Record<string, { status: number; body: string }>;
}

export function fakeFetch(spec: FakeFetchSpec): typeof fetch {
  const fetcher: typeof fetch = async (
    input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^http:\/\/[^/]+/, "");
    if (spec.errors && path in spec.errors) {
      const err = spec.errors[path];
      if (!err) throw new Error("test bug");
      return new Response(err.body, { status: err.status });
    }
    if (spec.get && path in spec.get) {
      const value = spec.get[path];
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(`not mocked: ${path}`, { status: 404 });
  };
  return fetcher;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
