// Shared test fixtures pinned from contracts/v2/snapshots/typehashes.json,
// sourceIds.json, and contracts/v2/libraries/LoopV1Errors.sol selector
// comments. The SDK's job is to reproduce these byte-for-byte.

export const PINNED_TYPEHASHES = {
  DOMAIN_SEPARATOR_TYPEHASH:
    "0xd87cd6ef79d4e2b95e15ce8abf732db51ec771f1ca2edccf22a46c729ac56472",
  ACTION_IDENTITY_TYPEHASH:
    "0xb9494d30193e1b3e8890ad413f29c853720fab4b904688d2a4e400eebfae42d1",
  FRESHNESS_TYPEHASH:
    "0xfaf6f77d84cecbe8fd6899cc48a37cdc0fdbd0f826f56803ee64456d6a9d3a67",
  FEE_CAPS_TYPEHASH:
    "0x88c1fba7dda3ffd12d58f70b2b14a7d805ffcf83d2beabd55bd2fe330a6f10ba",
  DIGEST_HASHES_TYPEHASH:
    "0x0b5f1f9ee52c2d672eb66a2dd7432dcaf9ba09cd536a70c8001e8a9cb7b6f119",
  EVIDENCE_SOURCE_TYPEHASH:
    "0xdba0e637435413fa361eac9297ca392a1c028a0b9eb8d5375d997e2d0f756765",
  EVIDENCE_BUNDLE_TYPEHASH:
    "0xe450951d3f978f72f8174b5f3163bdefe180cf090465e11f4ef5812ff3f20232",
  SPENDER_LIST_TYPEHASH:
    "0xf62193d13aec3ec72ee07ef0ee09295b3a323637701fa47f16a0203e27866284",
  ALLOWANCE_SCHEDULE_TYPEHASH:
    "0x002deced35533c9d1040e6ad69ffc0bf5ed23d91319521d2408b8dad2e64857c",
  FEE_CAP_HASH_TYPEHASH:
    "0xa316077e03b6cb7cfe1048f9940c6eaff5c8e40ee80f1d29b6788a132aa0a5dc",
  FAILURE_CONDITION_TYPEHASH:
    "0x4ce0221556229493f31530a25911dc1d081612904e6e4189d6a88dd1f7c038db",
  ARMING_CONTEXT_TYPEHASH:
    "0x3b02c9a9cfd659b4509f2222870d5e92345f7e710083fe4e21ddb47ae5368a02",
  OPEN_BOUNDS_TYPEHASH:
    "0xf4a8770bd919980654184404a437bebdb8ca2ecb00331a500c5c87357760018d",
  REBALANCE_BOUNDS_TYPEHASH:
    "0x6432e35189b576042eaadad5755f566c6d7c5bc8fc5f1fb946af9894ef76a246",
  EXIT_BOUNDS_TYPEHASH:
    "0xe7165695f44b5b28f6ccf706efb98459632a947416c2e9472508a7788c8b86b5",
  FORCE_EXIT_BOUNDS_TYPEHASH:
    "0x02f9a27af8a23b9a25777416a80126184f4f7860294bad898660dc165b462409",
  REVOKE_BOUNDS_TYPEHASH:
    "0xc32436bf46e8d08929a21e1817c6ffed64ee1060512e4e237a1dbbe95f8b67d9",
  AUTOMATION_BOUNDS_TYPEHASH:
    "0xe937c18ccb6e6f998ffdbb90a380eafd46e05c4a47840a5c4f3a64a15f4f266b",
  OPEN_TYPEHASH:
    "0x2bf326ec023d5505d6e268c1f605a44c399dadaeab0076ba7bd48261d09d3cfc",
  REBALANCE_TYPEHASH:
    "0xf256414d319bebda5c008b5d2f67aa2e09fa6c688278eecd676dfccece1c7709",
  EXIT_TYPEHASH:
    "0xccac07a147f55c08855564121c8ccdc3b1352f8347f63bc95cf4ba0de2dab231",
  FORCE_EXIT_TYPEHASH:
    "0x04ba9640cab2caceb652e1928cd497f46de1a59d89a11c39185825b1f8b34de1",
  REVOKE_TYPEHASH:
    "0x272281406c23225b34295b159d27a50245e0ada5850e679be7ea030def11f28c",
  AUTOMATION_EXEC_TYPEHASH:
    "0xc3cc6b85e7d0810b5df24ab654f52071104c552393b0e8fddd73713fa8248033",
  PREIMAGE_PROOF_TYPEHASH:
    "0xec920e6eeadf896e41868a1db4d4d57cdf529b452b8149386d38231f320e5f39",
} as const;

export const PINNED_SOURCE_IDS = {
  "morpho-position":
    "0x4572e563d333c7c905811411af5189452e337a48560e391102fd73e6145d19e4",
  "vault-nav":
    "0x4accd06ade91ccf01d8a83bd5e4fd7d94ac8ac13470f2df8a1a9c568a935829f",
  "chainlink-feed":
    "0xec5adf640ecb17c79d036d9acecb40e1eca6e23d52daf087aa2b6e5411c37278",
  "curve-quote":
    "0x3c23e543081ccc283e55ac0a6b70fad7ba6fff38442b23f88681ae1b059a34b3",
  "sequencer-uptime":
    "0x4dffde18d10c49ab00615120c262970f39d158df51a8c6e1fbe07a51ce68ada8",
  "harvest-event":
    "0xe0ae42df22d3bb227e56e47ce0c42f373ca2ad2e133e9b927cb22ceb04aa1067",
  "external-protocol-fingerprint":
    "0xdfa655c0e685077e5f5785b06545671383302adada35d41ba71149ee27cca2cb",
} as const;

/** Selectors that the LoopV1Errors.sol library comments pin explicitly.
 *  The pinned set covers the zero-arg errors with stable mainnet selectors;
 *  the SDK must reproduce each one. Note: MorphoParamsMismatch(uint8) is not
 *  pinned in the contract comments and is verified by a derivation test. */
export const PINNED_ERROR_SELECTORS = {
  WrongChain: "0x10dfc033",
  RegistryVersionMismatch: "0x66bc64c3",
  RegistryMerkleRootMismatch: "0x0ef0eebc",
  ExecutorMismatch: "0x3cb9597b",
  SpenderNotRegistered: "0x89a5dd7e",
  BytecodeMismatch: "0xd0d8722b",
  VaultAssetMismatch: "0x088e1066",
  ConfigIntegrityFailure: "0xaddf81d8",
  InvalidSignature: "0x8baa579f",
  DigestTypeMismatch: "0x8a83a48e",
  NonceAlreadyUsed: "0x1fb09b80",
  PolicyRevoking: "0x1db69521",
  PolicyExpired: "0x9c5bebca",
  PolicyClassMismatch: "0x0b522b0c",
  ForceAuthorizationRequired: "0xf5dfdc25",
  AckRiskBitMissing: "0x4fc90c8e",
  ExecutionKindMismatch: "0xe1d08d96",
  CallbackDataForbidden: "0xb2b04bdb",
  ReentrantCallback: "0x493f562f",
  InvalidCallbackSender: "0x891fcda5",
  InvalidCallbackContext: "0x654b1394",
  VaultEvidenceMissing: "0x85e84fcb",
  Eip1271PreimageNotAttested: "0x6f1b4474",
  ForceExitWaiverOverbroad: "0xa228b165",
  ForceExitPolicyNotAllowedInPhase1: "0x7230dafb",
  ForceExitDeadlineExceedsBound: "0xbcacdcdc",
  MevWaiverMissing: "0x857d72c0",
  Phase1AutomationScopeViolation: "0x360d2734",
  QuoteStale: "0x36a5021e",
  QuoteDeviationExceeded: "0x13549b5f",
  EvidenceStale: "0x1d7c2680",
  BlockInconsistent: "0x9b33cfd9",
  DeadlineExceeded: "0x559895a3",
  IndexerAnchorStale: "0x5767979e",
  HarvestConvergencePending: "0xd8772d7c",
  RpcQuorumDegraded: "0x45490bfd",
  MevModeMismatch: "0x91cd5bbd",
  RevealTooEarly: "0xc349402d",
  RpcQuorumNotIndependent: "0x39281770",
  KeeperBuilderOutage: "0x0f792d25",
  CurveLiquidityInsufficient: "0xa1eee051",
  CurveSlippageExceeded: "0xacaf05d8",
  CurvePriceImpactExceeded: "0x4f7fe240",
  FlashLiquidityUnavailable: "0x3db74538",
  AlternateProviderMissing: "0xb3504b2a",
  OracleStale: "0x04578698",
  OracleMissing: "0x37c1269f",
  OracleDeviationExceeded: "0x2d33ffcf",
  SequencerDown: "0x032b3d00",
  SequencerGracePeriod: "0xb5d44b5c",
  NavStepExceeded: "0x08fd99f3",
  MorphoEvidenceMissing: "0xa50e1b8c",
  HealthFactorBoundFailure: "0x0d340143",
  HealthIndeterminate: "0xc8d7a22b",
  LeverageBoundFailure: "0xcd8a6ffb",
  BorrowedDiemOutOfBand: "0x6618b7b5",
  CollateralSoldExceeded: "0xe5b73547",
  DustBoundExceeded: "0x18d303ad",
  LiquidationDistanceBoundFailure: "0x3fe6d421",
  UtilizationImpactExceeded: "0xdc92e56d",
  CurveShareExceeded: "0x04b17402",
  VaultDepositShortfall: "0x8717c893",
  ThirdPartyRepayNotAccepted: "0x3000eb40",
  AuditGateClosed: "0x3fef151f",
  PausedAction: "0xa59392f5",
  IncidentInvestigating: "0x0971eb12",
  IncidentMitigating: "0x899f96ca",
  RevokedAuthorization: "0xb98202c4",
  AutomationAttemptThrottled: "0x121bbfc2",
  BuilderQuotaExceeded: "0x33faf508",
  CallerNotAllowed: "0x2af07d20",
  LedgerBeforeUnavailable: "0x27e35cb3",
  LedgerAfterUnavailable: "0xd9e948ca",
  EvidenceUnsorted: "0xe1527a5f",
  EvidenceSourceUnexpected: "0x4bde5c7e",
  EvidenceSourceMissing: "0x79194196",
  EvidenceSourceAddressMismatch: "0xf0239d9e",
} as const;
