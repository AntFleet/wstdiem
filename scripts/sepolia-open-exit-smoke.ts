/**
 * LIVE_E2E harness — first end-to-end leveraged-loop smoke of the wstDIEM
 * protocol on Base Sepolia (chainId 84532), driven through the real SDK
 * build -> sign -> attach -> broadcast path (sdk/dist).
 *
 * OPERATIONAL SCRIPT — NOT part of `tsc`. It imports the prebuilt SDK dist
 * (../sdk/dist/index.js) at runtime via tsx and is intentionally excluded from
 * the SDK/app tsconfig. Run it with tsx, not the type-checker.
 *
 * Usage:
 *   npm run e2e:sepolia
 *   # or directly:
 *   node_modules/.bin/tsx scripts/sepolia-open-exit-smoke.ts
 *
 * Env flags:
 *   OPEN_BROADCAST=1   broadcast the OPEN tx (else simulate only)
 *   EXIT_BROADCAST=1   broadcast the EXIT tx (else simulate only)
 *   EQUITY_WEI=...     wstDIEM equity used for open bounds sizing (default 1e18)
 *
 * Env overrides (all fall back to the documented Base Sepolia defaults below):
 *   SEPOLIA_RPC_URL          JSON-RPC endpoint
 *   OWNER_ADDRESS            action owner (must match the deployer key)
 *   MARKET_ID                bytes32 market id
 *   LOOP_AUTHORIZATION, LOOP_EXECUTOR_V2, LOOP_REGISTRY, ...  core contract addrs
 *
 * Key handling: never printed. Loaded from ~/.wstdiem-sepolia-deployer.json.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  decodeErrorResult,
  parseAbi,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
// @ts-ignore - use the prebuilt SDK dist (source tree currently has unrelated TS errors)
import { createSdk, CANONICAL_ERRORS } from "../sdk/dist/index.js";

// All operational parameters are env-overridable; the defaults are the
// documented Base Sepolia deployment so the script runs with no env set.
const env = (key: string, fallback: string): string => process.env[key] ?? fallback;
const envBig = (key: string, fallback: bigint): bigint => {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : BigInt(v);
};

const RPC = env("SEPOLIA_RPC_URL", "https://base-sepolia.drpc.org");
const OWNER = env(
  "OWNER_ADDRESS",
  "0xb41891318Be43D2A966f574BaFC52D0a501Db96A",
) as Address;

// Base Sepolia REDEPLOY 2026-07-20 (post-EIP-170-refactor, PRs #9/#10/#11).
// Supersedes the 2026-07-12 addresses. Canonical source: script/v2/configs/base-sepolia.json.
const CONTRACTS = {
  loopRegistry: env("LOOP_REGISTRY", "0xB8FD5714364Ee179b71495A3F484f9A720d34E22"),
  loopFingerprintRegistry: env("LOOP_FINGERPRINT_REGISTRY", "0x747F481c2AC4c6e7f080DcbDc549e8FA29E24C70"),
  loopAuthorization: env("LOOP_AUTHORIZATION", "0xA001863898Eb6B2F8fa4cc28aB934762426ceAa8"),
  loopForceExitAuthorizer: env("LOOP_FORCE_EXIT_AUTHORIZER", "0x14776F4e0edF5965Bf2675F557b833A49a623bF8"),
  loopExecutorV2: env("LOOP_EXECUTOR_V2", "0xFAcecd40649F4cdDE70410DFFd5AdCAcE50E3c4B"),
  loopForceExitExecutor: env("LOOP_FORCE_EXIT_EXECUTOR", "0x6D651b6689C37d4E88A2710Dd6E22a017C489620"),
  loopAnchorRegistry: env("LOOP_ANCHOR_REGISTRY", "0xDC0ec9885c06a8F78085472Dc1f8Fe7FFbD0d53F"),
  loopRiskOracleAdapter: env("LOOP_RISK_ORACLE_ADAPTER", "0x7CDa31cbd921F18FAaE9d747F53c10d58FBa1013"),
  loopFeeRouter: env("LOOP_FEE_ROUTER", "0x9c5eF7981F583eeb2b161FCC90b3B13969E76779"),
  emergencyGuardian: env("EMERGENCY_GUARDIAN", "0x5A487F12F0225533Ad841FEc299F9426D4964fC2"),
} as Record<string, Address>;

const MARKET_ID = env(
  "MARKET_ID",
  "0xa4739a27c01f9ec2f88846ae1d0c59636a0a409a50080fef4548d41245b8cdda",
) as Hex;
const DIEM = env("DIEM", "0xe4938C8514eA2825Aab6B95bDC4f82b664ADE523") as Address;
const WST = env("WST", "0xe7088BAd6CDD0355f30CC20c4962918E63B289B6") as Address;
const MORPHO = env("MORPHO", "0x6cD9F25E78341F175d67599f02e556829DA16f7B") as Address;

const BUNDLE = {
  marketId: MARKET_ID,
  morpho: MORPHO,
  vault: env("WST_DIEM_VAULT", "0x57e24553391517057aC8fFbc539f50137654276F") as Address,
  loanToken: DIEM,
  collateralToken: WST,
  uniswapV3FlashPool: env("UNIV3_FLASH_POOL", "0xCFb87BEDE5A17a3D9b16601723D3a2070AF8Ea31") as Address,
  sequencerUptimeFeed: env("SEQUENCER_FEED", "0x696B4c107D4f2F1902Cc13F370FeFB33248bE5C6") as Address,
  chainlinkFeed: env("CHAINLINK_FEED", "0xe2e76617020aEd41D2234b2F345B9AA4dba2756F") as Address,
  curvePool: env("CURVE_POOL", "0xc2D13DCce20dCDeB5305aE2AC421B4e6271D56E3") as Address,
};

// registryVersion + registryMerkleRoot are deployment-specific and the Phase C
// apply bumps them; read both from the chain at runtime (below) rather than
// pinning stale literals. Env overrides remain available for offline runs.
const REGISTRY_VERSION_OVERRIDE = process.env.REGISTRY_VERSION;
const REGISTRY_MERKLE_ROOT_OVERRIDE = process.env.REGISTRY_MERKLE_ROOT as Hex | undefined;
const ZERO32 = ("0x" + "00".repeat(32)) as Hex;
const BPS = 10_000n;

// ── Build error-selector -> name registry (SDK canonical + LoopV1Errors) ──
const LOOP_ERROR_NAMES = [
  "SpenderNotRegistered","BytecodeMismatch","Erc20ApproveFailed","Erc20TransferFailed",
  "Erc20TransferFromFailed","DustBoundExceeded","FlashLiquidityUnavailable","InvalidCallbackSender",
  "ReentrantCallback","InvalidCallbackContext","ActionContextAlreadyArmed","ConfigIntegrityFailure",
  "MorphoEvidenceMissing","HealthIndeterminate","DebtNotReduced","HealthFactorBoundFailure",
  "LiquidationDistanceBoundFailure","UtilizationImpactExceeded","LeverageBoundFailure",
  "VaultDepositShortfall","BorrowedDiemOutOfBand","CurveSlippageExceeded","CurveLiquidityInsufficient",
  "CurveShareExceeded","InvalidSignature","MevWaiverMissing","DeadlineExceeded","DeadlineExceedsBound",
  "QuoteStale","ExecutionKindMismatch","CallerNotAllowed","ExecutorMismatch","Eip1271PreimageNotAttested",
  "NonceAlreadyUsed","DigestTypeMismatch","RebalanceModeAmbiguous","ConfigMutationOutsideAtomicGate",
  "ProductionReadinessFailed","BootstrapStillOpen","BootstrapAlreadyClosed","HarvestConvergencePending",
] as const;
import { keccak256, toHex, stringToBytes } from "viem";
const SELECTORS = new Map<string, string>();
for (const n of LOOP_ERROR_NAMES) {
  const sel = keccak256(stringToBytes(`${n}()`)).slice(0, 10);
  SELECTORS.set(sel, n);
}
try {
  for (const e of CANONICAL_ERRORS ?? []) {
    if (e?.selector && e?.name) SELECTORS.set(String(e.selector).slice(0, 10), e.name);
  }
} catch {}

function decodeRevert(err: any): string {
  // Walk viem error to find raw revert data.
  let data: string | undefined;
  const seen = new Set();
  const walk = (o: any) => {
    if (!o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    if (typeof o.data === "string" && o.data.startsWith("0x") && o.data.length >= 10) data = o.data;
    if (typeof o.raw === "string" && o.raw.startsWith("0x")) data = o.raw;
    for (const k of Object.keys(o)) walk((o as any)[k]);
    if (o.cause) walk(o.cause);
  };
  walk(err);
  if (!data) {
    const m = String(err?.message ?? err);
    const mm = m.match(/0x[0-9a-fA-F]{8,}/);
    if (mm) data = mm[0];
  }
  if (!data) return `NO_REVERT_DATA: ${String(err?.shortMessage ?? err?.message ?? err).slice(0, 300)}`;
  const sel = data.slice(0, 10);
  const name = SELECTORS.get(sel);
  return `revert data=${data.slice(0, 74)} selector=${sel} => ${name ?? "UNKNOWN(run: cast 4byte " + sel + ")"}`;
}

const AUTH_ABI = parseAbi([
  "function nonceBitmap(address owner, uint64 policyId, uint8 primaryType, uint248 nonceSlot) view returns (uint256)",
]);
const REGISTRY_ABI = parseAbi([
  "function registryVersion() view returns (uint256)",
  "function registryMerkleRoot() view returns (bytes32)",
]);
const MORPHO_ABI = parseAbi([
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
]);

async function main() {
  // ── key ──
  const raw = JSON.parse(readFileSync(homedir() + "/.wstdiem-sepolia-deployer.json", "utf8"));
  const w = Array.isArray(raw) ? raw[0] : raw;
  const pk = (w.privateKey || w.private_key) as Hex;
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : (("0x" + pk) as Hex));
  if (account.address.toLowerCase() !== OWNER.toLowerCase()) {
    throw new Error(`KEY MISMATCH: derived ${account.address} != ${OWNER}`);
  }

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  const sdk = createSdk({
    chainId: 84532,
    publicClient,
    indexerBaseUrl: "http://localhost:8791",
    contracts: CONTRACTS,
    initialMarkets: [BUNDLE],
    allowSingleClientReads: true,
    strictAnchorCrossCheck: false,
    // The Base Sepolia MOCK vault implements only convertToAssets; declare it
    // so buildOpenParams computes the share floor from NAV (no error-inference).
    vaultConvertToSharesUnsupported: true,
    uniswapV3Quoter: undefined,
  } as any);

  const block = await publicClient.getBlockNumber();
  const now = Math.floor(Date.now() / 1000);

  // Read the live registry config epoch + merkle root (deployment-specific; the
  // Phase C fingerprint apply bumps registryVersion). Env overrides win for
  // offline/simulation runs.
  const REGISTRY_VERSION = REGISTRY_VERSION_OVERRIDE !== undefined
    ? BigInt(REGISTRY_VERSION_OVERRIDE)
    : ((await publicClient.readContract({
        address: CONTRACTS.loopRegistry, abi: REGISTRY_ABI, functionName: "registryVersion",
      })) as bigint);
  const REGISTRY_MERKLE_ROOT = (REGISTRY_MERKLE_ROOT_OVERRIDE
    ?? (await publicClient.readContract({
        address: CONTRACTS.loopRegistry, abi: REGISTRY_ABI, functionName: "registryMerkleRoot",
      }))) as Hex;
  console.log(
    `block=${block} owner=${account.address} registryVersion=${REGISTRY_VERSION} merkleRoot=${REGISTRY_MERKLE_ROOT}`,
  );
  if (REGISTRY_VERSION < 2n) {
    console.warn(
      `WARNING: registryVersion=${REGISTRY_VERSION} (< 2) — Phase C fingerprint apply has not landed yet; OPEN/EXIT gates will reject. Run this after the apply.`,
    );
  }

  // ── free OPEN nonce (primaryType Open = 0) ──
  async function freeNonceBit(primaryTypeU8: number): Promise<{ slot: bigint; bit: number }> {
    for (let slot = 0n; slot < 4n; slot++) {
      const word = (await publicClient.readContract({
        address: CONTRACTS.loopAuthorization, abi: AUTH_ABI, functionName: "nonceBitmap",
        args: [OWNER, 0n, primaryTypeU8, slot],
      })) as bigint;
      for (let bit = 0; bit < 256; bit++) if ((word & (1n << BigInt(bit))) === 0n) return { slot, bit };
    }
    throw new Error("no free nonce bit");
  }

  const commonEnvelope = (nonce: { slot: bigint; bit: number }, verifyingContract: Address, executor: Address) => ({
    owner: OWNER,
    chainId: 84532,
    verifyingContract,
    executor,
    market: MARKET_ID,
    registryVersion: REGISTRY_VERSION,
    registryMerkleRoot: REGISTRY_MERKLE_ROOT,
    policyId: 0n,
    nonceSlot: nonce.slot,
    nonceBit: nonce.bit,
    // NOTE (integration finding): SDK default is OWNER_DIRECT, but on-chain
    // validateOpen passes the executor as executionCaller and OWNER_DIRECT
    // requires executionCaller==owner -> impossible via the executor. The
    // working executor-mediated path is KEEPER_PERMISSIONLESS (executor is a
    // registered permissionless caller on-chain).
    executionKind: "KEEPER_PERMISSIONLESS",
    deadline: BigInt(now + 3600),
    quoteBlockNumber: block,
    maxQuoteAgeBlocks: 300,
    maxQuoteDeviationBps: 100,
    mevProtectionMode: "PRIVATE_BUILDER", // requires no waiver bits
    mevWaiverBits: 0,
    evidenceBundleHash: ZERO32,
  });

  // ════════════════ OPEN ════════════════
  const collateralAmount = envBig("EQUITY_WEI", 1_000_000_000_000_000_000n); // default 1e18 (bounds sizing)
  const lev = 20_000n; // 2.0x
  const slip = 50n;
  const notionalBorrow = (collateralAmount * (lev - BPS)) / BPS; // 1e18
  const maxBorrowedDiem = (notionalBorrow * (BPS + slip)) / BPS;  // 1.005e18
  const minBorrowedDiem = (notionalBorrow * (BPS - slip)) / BPS;  // 0.995e18

  const openNonce = await freeNonceBit(0);
  const openAction = {
    ...commonEnvelope(openNonce, CONTRACTS.loopAuthorization, CONTRACTS.loopExecutorV2),
    primaryType: "Open",
    bounds: {
      minWstDiemReceived: 500_000_000_000_000_000n, // 0.5e18 conservative floor (actual ~1.004e18)
      minBorrowedDiem,
      maxBorrowedDiem,
      maxSlippageBps: 50,
      maxPriceImpactBps: 50,
      maxLeverageBps: 20_000,
      minHealthFactor: 1_050_000_000_000_000_000n, // 1.05 WAD
      minLiquidationDistanceBps: 500,
      maxMorphoUtilizationImpactBps: 500,
      flashFeeCap: (maxBorrowedDiem * 30n) / BPS,
      protocolFeeCap: (collateralAmount * 100n) / BPS,
      automationFeeCap: 0n,
    },
  };

  console.log("\n=== OPEN: buildAuthorization ===");
  const openAuth = await sdk.buildAuthorization(openAction as any);
  console.log(`digest=${openAuth.digest}`);
  console.log(`typedData.types present? ${(openAuth.typedData as any)?.types !== undefined}`);

  const openSig = await account.sign({ hash: openAuth.digest as Hex });
  const openTx = await sdk.attachSignature(openAction as any, openSig, openAuth.digest);
  console.log(`executeOpen -> to=${openTx.to} dataLen=${(openTx.data as string).length}`);

  console.log("\n=== OPEN: simulate (eth_call from owner) ===");
  try {
    await publicClient.call({ account, to: openTx.to as Address, data: openTx.data as Hex });
    console.log("OPEN SIMULATION: SUCCESS (no revert)");
  } catch (e) {
    console.log("OPEN SIMULATION REVERT: " + decodeRevert(e));
  }

  if (process.env.OPEN_BROADCAST === "1") {
    console.log("\n=== OPEN: broadcast ===");
    const hash = await walletClient.sendTransaction({ to: openTx.to as Address, data: openTx.data as Hex });
    console.log(`open tx=${hash}`);
    const rcpt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`open status=${rcpt.status} gasUsed=${rcpt.gasUsed} block=${rcpt.blockNumber}`);
    const pos = (await publicClient.readContract({
      address: MORPHO, abi: MORPHO_ABI, functionName: "position", args: [MARKET_ID, OWNER],
    })) as [bigint, bigint, bigint];
    console.log(`position: borrowShares=${pos[1]} collateral=${pos[2]}`);
  }

  // ════════════════ EXIT ════════════════
  if (process.env.EXIT !== "1" && process.env.EXIT_BROADCAST !== "1") return;

  // Fresh position -> debt/collateral.
  const posNow = (await publicClient.readContract({
    address: MORPHO, abi: MORPHO_ABI, functionName: "position", args: [MARKET_ID, OWNER],
  })) as [bigint, bigint, bigint];
  const mkt = (await publicClient.readContract({
    address: MORPHO, abi: MORPHO_ABI, functionName: "market", args: [MARKET_ID],
  })) as [bigint, bigint, bigint, bigint, bigint, bigint];
  const borrowShares = posNow[1];
  const collateralNow = posNow[2];
  // debt assets = ceilDiv(borrowShares * totalBorrowAssets, totalBorrowShares)
  const debt = mkt[3] === 0n ? borrowShares : (borrowShares * mkt[2] + mkt[3] - 1n) / mkt[3];
  const flashAmount = debt;
  const flashFee = (flashAmount * 500n - 1n) / 1_000_000n + 1n;
  const protocolFeeCap = 1_000_000_000_000n; // 1e12, under dust bound
  // sell exactly enough collateral so curve fill (=min_dy) == withdrawn -> zero slippage
  const maxCollateralSold = flashAmount + flashFee + protocolFeeCap;
  if (maxCollateralSold > collateralNow) throw new Error("maxCollateralSold > collateral");
  console.log(`\n=== EXIT setup: debt=${debt} collateral=${collateralNow} sellColl=${maxCollateralSold} ===`);

  const exitNonce = await freeNonceBit(2); // Exit primaryType u8 = 2
  const exitBlock = await publicClient.getBlockNumber();
  const exitNow = Math.floor(Date.now() / 1000);
  const exitAction = {
    ...commonEnvelope(exitNonce, CONTRACTS.loopAuthorization, CONTRACTS.loopExecutorV2),
    quoteBlockNumber: exitBlock,
    deadline: BigInt(exitNow + 3600),
    primaryType: "Exit",
    routeKind: "CURVE",
    bounds: {
      minRepayment: 1n,
      maxCollateralSold,
      maxSlippageBps: 100,
      maxCurvePositionShareBps: 2000,
      maxMorphoUtilizationImpactBps: 0,
      flashFeeCap: 10_000_000_000_000_000n, // 1e16 >> fee
      protocolFeeCap,
      automationFeeCap: 0n,
      repayOnly: false,
      acceptsThirdPartyRepay: false,
    },
  };

  console.log("=== EXIT: buildAuthorization ===");
  const exitAuth = await sdk.buildAuthorization(exitAction as any);
  console.log(`digest=${exitAuth.digest}`);
  const exitSig = await account.sign({ hash: exitAuth.digest as Hex });
  const exitTx = await sdk.attachSignature(exitAction as any, exitSig, exitAuth.digest);
  console.log(`executeExit -> to=${exitTx.to}`);

  console.log("=== EXIT: simulate ===");
  try {
    await publicClient.call({ account, to: exitTx.to as Address, data: exitTx.data as Hex });
    console.log("EXIT SIMULATION: SUCCESS");
  } catch (e) {
    console.log("EXIT SIMULATION REVERT: " + decodeRevert(e));
  }

  if (process.env.EXIT_BROADCAST === "1") {
    console.log("=== EXIT: broadcast ===");
    const hash = await walletClient.sendTransaction({ to: exitTx.to as Address, data: exitTx.data as Hex });
    console.log(`exit tx=${hash}`);
    const rcpt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`exit status=${rcpt.status} gasUsed=${rcpt.gasUsed} block=${rcpt.blockNumber}`);
    const pos2 = (await publicClient.readContract({
      address: MORPHO, abi: MORPHO_ABI, functionName: "position", args: [MARKET_ID, OWNER],
    })) as [bigint, bigint, bigint];
    console.log(`post-exit position: borrowShares=${pos2[1]} collateral=${pos2[2]}`);
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
