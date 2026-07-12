// Minimal viem ABIs for the read-only methods the live SDK calls. We keep these
// inline (rather than importing JSON ABIs) so the SDK has no build-time
// dependency on the contracts package. Each ABI mirrors the relevant function
// signature from contracts/v2/interfaces/* and the canonical external interfaces
// (Morpho IMorpho, Chainlink AggregatorV3Interface, ERC4626).

import type { Abi } from "viem";

/** LoopRegistry — Phase 1 read-only methods. */
export const LOOP_REGISTRY_READ_ABI = [
  { type: "function", name: "registryVersion", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "registryMerkleRoot", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "supportedMarket", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "marketParams", inputs: [{ type: "bytes32" }], outputs: [
    { type: "tuple", components: [
      { name: "loanToken", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "oracle", type: "address" },
      { name: "irm", type: "address" },
      { name: "lltv", type: "uint256" },
    ]},
  ], stateMutability: "view" },
  { type: "function", name: "executorFor", inputs: [{ type: "uint8" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "loopAuthorization", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "loopForceExitAuthorizer", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "emergencyGuardian", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "governanceRole", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "anchorCadenceBlocks", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "anchorSubmitter", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "indexerSigningKey", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "canonicalSource", inputs: [{ type: "bytes32" }, { type: "bytes32" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "requiredEvidenceSourceSet", inputs: [{ type: "uint8" }], outputs: [{ type: "bytes32[]" }], stateMutability: "view" },
  { type: "function", name: "preimageDisplayGuaranteedWallet", inputs: [{ type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "permissionlessCallerAllowed", inputs: [{ type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "validateExternalConfig", inputs: [{ type: "bytes32" }, { type: "uint8" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "lastHarvestBlock", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "harvestCoolingBlocks", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "forceExitBufferBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "ownerLastSignedActionBlock", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "maxFailedAttemptsPerWindow", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "attemptThrottleWindowBlocks", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "morpho", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "curvePool", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "uniswapV3FlashPool", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "uniswapV3FlashFeeTier", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint24" }], stateMutability: "view" },
  { type: "function", name: "wstDiemVault", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "navBaseline", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "dustBoundFor", inputs: [{ type: "bytes32" }, { type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "minThirdPartyRepayDiem", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "maxRpcBlockLagBlocks", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "sourceFreshnessThreshold", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "externalFingerprint", inputs: [{ type: "bytes32" }], outputs: [
    { type: "tuple", components: [
      { name: "integrationId", type: "bytes32" },
      { name: "integration", type: "address" },
      { name: "fingerprintHash", type: "bytes32" },
      { name: "hardEqualityHash", type: "bytes32" },
      { name: "toleranceBandHash", type: "bytes32" },
      { name: "liveBaselineHash", type: "bytes32" },
      { name: "registryVersion", type: "uint256" },
    ]},
  ], stateMutability: "view" },
] as const satisfies Abi;

/** LoopAuthorization — read-only methods used pre-sign. */
export const LOOP_AUTHORIZATION_READ_ABI = [
  { type: "function", name: "domainSeparator", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "nonceBitmap", inputs: [
    { type: "address" }, { type: "uint64" }, { type: "uint8" }, { type: "uint248" },
  ], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "policyHash", inputs: [{ type: "address" }, { type: "uint64" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "policyRevocationBlock", inputs: [{ type: "address" }, { type: "uint64" }], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "acceptsThirdPartyRepay", inputs: [{ type: "address" }, { type: "uint64" }], outputs: [{ type: "bool" }], stateMutability: "view" },
] as const satisfies Abi;

/** LoopForceExitAuthorizer — verifyingContract returned via its own domain. */
export const LOOP_FORCE_EXIT_AUTHORIZER_READ_ABI = [
  { type: "function", name: "domainSeparator", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
] as const satisfies Abi;

/** Morpho — position + market read methods. */
export const MORPHO_READ_ABI = [
  {
    type: "function",
    name: "position",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [
      { name: "supplyShares", type: "uint256" },
      { name: "borrowShares", type: "uint128" },
      { name: "collateral", type: "uint128" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "market",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "totalSupplyAssets", type: "uint128" },
      { name: "totalSupplyShares", type: "uint128" },
      { name: "totalBorrowAssets", type: "uint128" },
      { name: "totalBorrowShares", type: "uint128" },
      { name: "lastUpdate", type: "uint128" },
      { name: "fee", type: "uint128" },
    ],
    stateMutability: "view",
  },
] as const satisfies Abi;

/** Chainlink AggregatorV3Interface — also used for the sequencer uptime feed. */
export const CHAINLINK_AGGREGATOR_V3_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const satisfies Abi;

/** ERC4626 vault — wstDIEM exposes the standard surface. */
export const ERC4626_ABI = [
  { type: "function", name: "asset", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "totalAssets", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "convertToAssets", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "convertToShares", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const satisfies Abi;

/** Generic ERC20 read methods used for token symbol/decimals. */
export const ERC20_READ_ABI = [
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const satisfies Abi;

/** Curve StableSwap pool — get_dy used for off-chain swap quotes. */
export const CURVE_POOL_READ_ABI = [
  {
    type: "function",
    name: "get_dy",
    inputs: [{ type: "int128" }, { type: "int128" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "coins",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

/** Uniswap V3 QuoterV2 — quoteExactInputSingle for swap pricing. */
export const UNISWAP_V3_QUOTER_V2_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

/** LoopAnchorRegistry — A5-3 anchor cross-check surface. */
export const LOOP_ANCHOR_REGISTRY_READ_ABI = [
  { type: "function", name: "lastAnchorBlock", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
] as const satisfies Abi;

/** Morpho IIrm — borrowRateView for accrued-debt quoting. */
export const MORPHO_IRM_READ_ABI = [
  {
    type: "function",
    name: "borrowRateView",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
      {
        type: "tuple",
        components: [
          { name: "totalSupplyAssets", type: "uint128" },
          { name: "totalSupplyShares", type: "uint128" },
          { name: "totalBorrowAssets", type: "uint128" },
          { name: "totalBorrowShares", type: "uint128" },
          { name: "lastUpdate", type: "uint128" },
          { name: "fee", type: "uint128" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

// ─── Executor entrypoint ABIs (calldata construction + decode) ──────────────

const ACTION_IDENTITY_ABI = {
  type: "tuple",
  components: [
    { name: "owner", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "market", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "registryVersion", type: "uint256" },
    { name: "registryMerkleRoot", type: "bytes32" },
    { name: "policyId", type: "uint64" },
    { name: "nonceSlot", type: "uint248" },
    { name: "nonceBit", type: "uint8" },
  ],
} as const;

const FRESHNESS_ABI = {
  type: "tuple",
  components: [
    { name: "deadline", type: "uint256" },
    { name: "quoteBlockNumber", type: "uint256" },
    { name: "maxQuoteAgeBlocks", type: "uint256" },
    { name: "maxQuoteDeviationBps", type: "uint16" },
  ],
} as const;

const MARKET_PARAMS_ABI = {
  type: "tuple",
  components: [
    { name: "loanToken", type: "address" },
    { name: "collateralToken", type: "address" },
    { name: "oracle", type: "address" },
    { name: "irm", type: "address" },
    { name: "lltv", type: "uint256" },
  ],
} as const;

const DIGEST_HASHES_ABI = {
  type: "tuple",
  components: [
    { name: "quoteHash", type: "bytes32" },
    { name: "spenderListHash", type: "bytes32" },
    { name: "allowanceScheduleHash", type: "bytes32" },
    { name: "feeCapHash", type: "bytes32" },
    { name: "evidenceBundleHash", type: "bytes32" },
  ],
} as const;

const OPEN_BOUNDS_ABI = {
  type: "tuple",
  components: [
    { name: "minWstDiemReceived", type: "uint256" },
    { name: "minBorrowedDiem", type: "uint256" },
    { name: "maxBorrowedDiem", type: "uint256" },
    { name: "maxSlippageBps", type: "uint16" },
    { name: "maxPriceImpactBps", type: "uint16" },
    { name: "maxLeverageBps", type: "uint16" },
    { name: "minHealthFactor", type: "uint256" },
    { name: "minLiquidationDistanceBps", type: "uint16" },
    { name: "maxMorphoUtilizationImpactBps", type: "uint16" },
    {
      name: "feeCaps",
      type: "tuple",
      components: [
        { name: "flashFeeCap", type: "uint256" },
        { name: "protocolFeeCap", type: "uint256" },
        { name: "automationFeeCap", type: "uint256" },
      ],
    },
  ],
} as const;

const REBALANCE_BOUNDS_ABI = {
  type: "tuple",
  components: [
    { name: "targetLeverageBps", type: "uint16" },
    { name: "targetLeverageToleranceBps", type: "uint16" },
    { name: "minPostHealthFactor", type: "uint256" },
    { name: "minLiquidationDistanceBps", type: "uint16" },
    { name: "maxDebtIncrease", type: "uint256" },
    { name: "maxCollateralSold", type: "uint256" },
    { name: "maxSlippageBps", type: "uint16" },
    { name: "maxCurvePositionShareBps", type: "uint16" },
    { name: "maxMorphoUtilizationImpactBps", type: "uint16" },
    {
      name: "feeCaps",
      type: "tuple",
      components: [
        { name: "flashFeeCap", type: "uint256" },
        { name: "protocolFeeCap", type: "uint256" },
        { name: "automationFeeCap", type: "uint256" },
      ],
    },
  ],
} as const;

const EXIT_BOUNDS_ABI = {
  type: "tuple",
  components: [
    { name: "minRepayment", type: "uint256" },
    { name: "maxCollateralSold", type: "uint256" },
    { name: "maxSlippageBps", type: "uint16" },
    { name: "maxCurvePositionShareBps", type: "uint16" },
    { name: "maxMorphoUtilizationImpactBps", type: "uint16" },
    {
      name: "feeCaps",
      type: "tuple",
      components: [
        { name: "flashFeeCap", type: "uint256" },
        { name: "protocolFeeCap", type: "uint256" },
        { name: "automationFeeCap", type: "uint256" },
      ],
    },
    { name: "repayOnly", type: "bool" },
    { name: "acceptsThirdPartyRepay", type: "bool" },
  ],
} as const;

const FORCE_EXIT_BOUNDS_ABI = {
  type: "tuple",
  components: [
    { name: "minRepayment", type: "uint256" },
    { name: "maxCollateralSold", type: "uint256" },
    { name: "looseSlippageBps", type: "uint16" },
    { name: "looseFlashFeeCap", type: "uint256" },
    { name: "maxCurvePositionShareBps", type: "uint16" },
    { name: "acknowledgedRisks", type: "uint8" },
  ],
} as const;

const EVIDENCE_BUNDLE_ABI = {
  type: "tuple",
  components: [
    { name: "actionId", type: "bytes32" },
    { name: "evidenceSetId", type: "bytes32" },
    { name: "owner", type: "address" },
    { name: "market", type: "bytes32" },
    { name: "blockNumber", type: "uint256" },
    { name: "stateBitmap", type: "uint16" },
    {
      name: "sources",
      type: "tuple[]",
      components: [
        { name: "sourceId", type: "bytes32" },
        { name: "sourceAddress", type: "address" },
        { name: "status", type: "uint8" },
        { name: "lastUpdateBlock", type: "uint256" },
        { name: "valueHash", type: "bytes32" },
      ],
    },
  ],
} as const;

/** LoopExecutorV2 + LoopForceExitExecutor entrypoint ABIs for calldata. */
export const LOOP_EXECUTOR_V2_ABI = [
  {
    type: "function",
    name: "executeOpen",
    inputs: [
      {
        name: "action",
        type: "tuple",
        components: [
          { name: "identity", ...ACTION_IDENTITY_ABI },
          { name: "freshness", ...FRESHNESS_ABI },
          { name: "executionKind", type: "uint8" },
          { name: "mevProtectionMode", type: "uint8" },
          { name: "mevWaiverBits", type: "uint8" },
          { name: "marketParams", ...MARKET_PARAMS_ABI },
          { name: "bounds", ...OPEN_BOUNDS_ABI },
          { name: "hashes", ...DIGEST_HASHES_ABI },
        ],
      },
      { name: "sig", type: "bytes" },
      { name: "evidence", ...EVIDENCE_BUNDLE_ABI },
      { name: "eip1271PreimageDisplayProof", type: "bytes32" },
    ],
    outputs: [
      {
        name: "result",
        type: "tuple",
        components: [
          { name: "collateralWstDiem", type: "uint256" },
          { name: "borrowedDiem", type: "uint256" },
          { name: "healthFactorWad", type: "uint256" },
          { name: "succeeded", type: "bool" },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeRebalance",
    inputs: [
      {
        name: "action",
        type: "tuple",
        components: [
          { name: "identity", ...ACTION_IDENTITY_ABI },
          { name: "freshness", ...FRESHNESS_ABI },
          { name: "executionKind", type: "uint8" },
          { name: "mevProtectionMode", type: "uint8" },
          { name: "mevWaiverBits", type: "uint8" },
          { name: "marketParams", ...MARKET_PARAMS_ABI },
          { name: "bounds", ...REBALANCE_BOUNDS_ABI },
          { name: "hashes", ...DIGEST_HASHES_ABI },
        ],
      },
      { name: "sig", type: "bytes" },
      { name: "evidence", ...EVIDENCE_BUNDLE_ABI },
      { name: "eip1271PreimageDisplayProof", type: "bytes32" },
    ],
    outputs: [
      {
        name: "result",
        type: "tuple",
        components: [
          { name: "collateralWstDiem", type: "uint256" },
          { name: "borrowedDiem", type: "uint256" },
          { name: "healthFactorWad", type: "uint256" },
          { name: "succeeded", type: "bool" },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeExit",
    inputs: [
      {
        name: "action",
        type: "tuple",
        components: [
          { name: "identity", ...ACTION_IDENTITY_ABI },
          { name: "freshness", ...FRESHNESS_ABI },
          { name: "executionKind", type: "uint8" },
          { name: "mevProtectionMode", type: "uint8" },
          { name: "mevWaiverBits", type: "uint8" },
          { name: "marketParams", ...MARKET_PARAMS_ABI },
          { name: "bounds", ...EXIT_BOUNDS_ABI },
          { name: "hashes", ...DIGEST_HASHES_ABI },
        ],
      },
      { name: "sig", type: "bytes" },
      { name: "evidence", ...EVIDENCE_BUNDLE_ABI },
      { name: "eip1271PreimageDisplayProof", type: "bytes32" },
    ],
    outputs: [
      {
        name: "result",
        type: "tuple",
        components: [
          { name: "collateralWstDiem", type: "uint256" },
          { name: "borrowedDiem", type: "uint256" },
          { name: "healthFactorWad", type: "uint256" },
          { name: "succeeded", type: "bool" },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

export const LOOP_FORCE_EXIT_EXECUTOR_ABI = [
  {
    type: "function",
    name: "executeForceExit",
    inputs: [
      {
        name: "action",
        type: "tuple",
        components: [
          { name: "identity", ...ACTION_IDENTITY_ABI },
          { name: "freshness", ...FRESHNESS_ABI },
          { name: "executionKind", type: "uint8" },
          { name: "mevProtectionMode", type: "uint8" },
          { name: "mevWaiverBits", type: "uint8" },
          { name: "marketParams", ...MARKET_PARAMS_ABI },
          { name: "bounds", ...FORCE_EXIT_BOUNDS_ABI },
          { name: "hashes", ...DIGEST_HASHES_ABI },
        ],
      },
      { name: "sig", type: "bytes" },
      { name: "evidence", ...EVIDENCE_BUNDLE_ABI },
      { name: "eip1271PreimageDisplayProof", type: "bytes32" },
    ],
    outputs: [
      {
        name: "result",
        type: "tuple",
        components: [
          { name: "collateralWstDiem", type: "uint256" },
          { name: "borrowedDiem", type: "uint256" },
          { name: "healthFactorWad", type: "uint256" },
          { name: "succeeded", type: "bool" },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

// ─── §11 event ABIs (full set for decodeLoopEvent) ──────────────────────────

export const LOOP_EVENTS_FULL_ABI = [
  {
    type: "event",
    name: "LoopActionStarted",
    inputs: [
      { name: "digest", type: "bytes32", indexed: true },
      { name: "primaryType", type: "uint8", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: false },
      { name: "blockNumber", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LoopActionStep",
    // PR-13 audit H1 fix: stepIndex is uint8 per ILoopV1Events.sol:16
    // (was incorrectly declared uint16 in initial PR-13 draft, which
    // would have produced a wrong topic0 hash and broken decode).
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "market", type: "bytes32", indexed: true },
      { name: "actionId", type: "bytes32", indexed: true },
      { name: "stepIndex", type: "uint8", indexed: false },
      { name: "primaryType", type: "uint8", indexed: false },
      { name: "target", type: "address", indexed: false },
      { name: "selector", type: "bytes4", indexed: false },
      { name: "terminal", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LoopActionCompleted",
    inputs: [
      { name: "digest", type: "bytes32", indexed: true },
      { name: "statusCode", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LoopOpenedV2",
    inputs: [
      { name: "digest", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "collateralWstDiem", type: "uint256", indexed: false },
      { name: "borrowedDiem", type: "uint256", indexed: false },
      { name: "healthFactorWad", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LoopRebalancedV2",
    inputs: [
      { name: "digest", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "debtDeltaDiem", type: "int256", indexed: false },
      { name: "collateralDeltaWstDiem", type: "int256", indexed: false },
      { name: "healthFactorWad", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LoopExitedV2",
    inputs: [
      { name: "digest", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "repaidDiem", type: "uint256", indexed: false },
      { name: "collateralSoldWstDiem", type: "uint256", indexed: false },
      { name: "diemReturned", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LoopForceExitedV2",
    inputs: [
      { name: "digest", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "repaidDiem", type: "uint256", indexed: false },
      { name: "collateralSoldWstDiem", type: "uint256", indexed: false },
      { name: "acknowledgedRisks", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PolicyCreated",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "policyId", type: "uint64", indexed: true },
      { name: "primaryType", type: "uint8", indexed: true },
      { name: "policyHash", type: "bytes32", indexed: false },
      { name: "expiryBlock", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PolicyUpdated",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "policyId", type: "uint64", indexed: true },
      { name: "oldPolicyHash", type: "bytes32", indexed: false },
      { name: "newPolicyHash", type: "bytes32", indexed: false },
      { name: "expiryBlock", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PolicyRevoking",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "policyId", type: "uint64", indexed: true },
      { name: "revocationBlock", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AutomationExecuted",
    inputs: [
      { name: "policyId", type: "uint64", indexed: true },
      { name: "digest", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AutomationFailed",
    inputs: [
      { name: "policyId", type: "uint64", indexed: true },
      { name: "digest", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "errorSelector", type: "bytes4", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StateSnapshotAccepted",
    inputs: [
      { name: "blockNumber", type: "uint256", indexed: true },
      { name: "manifestHash", type: "bytes32", indexed: true },
      { name: "submitter", type: "address", indexed: true },
    ],
  },
] as const satisfies Abi;

/**
 * PR-17 Gap 4: EmergencyGuardian events. Used by `getIncidentHistory` to
 * decode `IncidentStateChanged` logs into typed transitions. The event
 * signature matches contracts/v2/interfaces/ILoopV1Events.sol verbatim:
 *
 *   event IncidentStateChanged(
 *     LoopV1Types.IncidentState indexed previousState,
 *     LoopV1Types.IncidentState indexed nextState
 *   );
 *
 * `IncidentState` is encoded as `uint8` on the wire (Solidity enum ABI
 * encoding).
 */
export const EMERGENCY_GUARDIAN_EVENTS_ABI = [
  {
    type: "event",
    name: "IncidentStateChanged",
    inputs: [
      { name: "previousState", type: "uint8", indexed: true },
      { name: "nextState", type: "uint8", indexed: true },
    ],
  },
] as const satisfies Abi;
