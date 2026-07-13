// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Ownable2Step} from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";

import {ILoopRegistry} from "./interfaces/ILoopRegistry.sol";
import {ILoopV1Events} from "./interfaces/ILoopV1Events.sol";
import {LoopV1Errors} from "./libraries/LoopV1Errors.sol";
import {LoopV1Types} from "./libraries/LoopV1Types.sol";

interface IMorphoFingerprintReader {
    function idToMarketParams(bytes32 market)
        external
        view
        returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv);
}

interface IChainlinkFingerprintReader {
    function aggregator() external view returns (address);
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface ICurveFingerprintReader {
    function coins(uint256 i) external view returns (address);
    function balances(uint256 i) external view returns (uint256);
    function A() external view returns (uint256);
    function fee() external view returns (uint256);
}

interface IERC4626FingerprintReader {
    function asset() external view returns (address);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

interface IUniswapV3PoolFingerprintReader {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

/// @notice Phase B registry for digest-bound config, evidence sources, risk metadata, and PR-5 real bodies.
/// @dev F22 (2026-06-17): Ownable2Step for ownership transfer. Fingerprint updates remain timelocked
///      via `queueExternalFingerprintUpdate` / batch apply. Critical role mutators that remain
///      single-step are intended for the bootstrap window before ownership is handed to governance.
contract LoopRegistry is Ownable2Step, ILoopRegistry, ILoopV1Events {
    error NonMonotonicRegistryVersion();
    error IndexerEqualsAnchor();
    error ZeroAddress();
    error UnknownBatchOp(uint8 op);
    error EmptyBatch();
    error ProductionReadinessFailed(bytes32 reason);
    error NoPendingRoleUpdate();
    error BootstrapAlreadyClosed();
    error BootstrapStillOpen();
    error NoPendingBatch();
    error PendingBatchMismatch();

    uint8 public constant ROLE_INDEXER_SIGNER = 1;
    uint8 public constant ROLE_ANCHOR_SUBMITTER = 2;
    uint8 public constant ROLE_EMERGENCY_GUARDIAN = 3;
    uint8 public constant ROLE_GOVERNANCE = 4;
    uint8 public constant ROLE_HARVEST_AUTHORITY = 5;

    uint8 public constant OP_SET_MARKET_PARAMS = 1;
    uint8 public constant OP_SET_CANONICAL_SOURCE = 2;
    uint8 public constant OP_SET_REQUIRED_EVIDENCE_SOURCE_SET = 3;
    uint8 public constant OP_SET_EXECUTOR_FOR = 4;
    uint8 public constant OP_SET_LOOP_AUTHORIZATION = 5;
    uint8 public constant OP_SET_LOOP_FORCE_EXIT_AUTHORIZER = 6;
    uint8 public constant OP_SET_ALLOWED_SPENDER = 7;
    uint8 public constant OP_SET_MORPHO = 8;
    uint8 public constant OP_SET_CURVE_POOL = 9;
    uint8 public constant OP_SET_UNISWAP_V3_FLASH_POOL = 10;
    uint8 public constant OP_SET_WSTDIEM_VAULT = 11;
    uint8 public constant OP_SET_UNISWAP_V3_FACTORY = 12;
    uint8 public constant OP_SET_UNISWAP_V3_FLASH_FEE_TIER = 13;
    uint8 public constant OP_APPLY_EXTERNAL_FINGERPRINT = 14;
    uint8 public constant OP_SET_DUST_BPS = 15;
    uint8 public constant OP_SET_DUST_ABSOLUTE_CAP = 16;
    uint8 public constant OP_SET_DUST_FLOOR = 17;
    uint8 public constant OP_SET_SUPPORTED_MARKET = 18;
    uint8 public constant OP_SET_FORCE_EXIT_BUFFER_BPS = 19;

    uint256 internal constant REGISTRY_TIMELOCK_BLOCKS = 130_000;
    uint256 internal constant WAD = 1e18;
    uint16 internal constant MAX_TOLERANCE_STEP_BPS = 50;
    uint256 internal constant SEQUENCER_GRACE_SECONDS = 3_600;

    struct PendingFingerprint {
        LoopV1Types.ExternalProtocolFingerprint fingerprint;
        uint256 effectiveBlock;
        FingerprintBaseline baseline;
    }

    struct FingerprintBaseline {
        uint256 value0;
        uint256 value1;
        int256 signedValue;
        uint256 updatedAt;
    }

    uint256 public registryVersion;
    bytes32 public registryMerkleRoot;
    address public indexerSigningKey;
    address public anchorSubmitter;
    address public emergencyGuardian;
    address public governanceRole;
    address public loopAuthorization;
    address public loopForceExitAuthorizer;
    address public morpho;

    mapping(uint8 primaryType => address executor) private executors;
    mapping(bytes32 market => bool supported) private supportedMarkets;
    mapping(bytes32 market => LoopV1Types.MorphoMarketParams params) private marketParamStore;
    mapping(uint8 primaryType => mapping(address token => mapping(address spender => SpenderCheck check))) private
        spenderChecks;
    mapping(bytes32 market => mapping(bytes32 sourceId => address sourceAddress)) private canonicalSources;
    mapping(uint8 primaryType => bytes32[] sourceIds) private requiredEvidenceSources;
    mapping(address wallet => bool allowed) private preimageDisplayWallets;
    mapping(address caller => bool allowed) private permissionlessCallers;
    mapping(bytes32 rpcEndpointId => bytes32 family) private providerFamilies;
    mapping(bytes32 market => address pool) private curvePools;
    mapping(bytes32 market => address pool) private uniswapV3FlashPools;
    mapping(bytes32 market => address vault) private wstDiemVaults;
    mapping(bytes32 market => address factory) private uniswapV3Factories;
    mapping(bytes32 market => uint24 feeTier) private uniswapV3FlashFeeTiers;
    mapping(bytes32 integrationId => LoopV1Types.ExternalProtocolFingerprint fingerprint) private fingerprints;
    mapping(bytes32 integrationId => PendingFingerprint pending) private pendingFingerprints;
    mapping(bytes32 integrationId => bytes32 market) private fingerprintMarkets;
    mapping(bytes32 integrationId => bytes32 sourceId) private fingerprintSources;
    mapping(bytes32 integrationId => FingerprintBaseline baseline) private fingerprintBaselines;
    mapping(bytes32 market => uint256 blockNumber) private harvestBlocks;
    mapping(address candidate => bool allowed) private operatorRecoveryRoles;
    mapping(address owner => uint256 blockNumber) private ownerActivityBlocks;
    mapping(bytes32 sourceId => uint256 thresholdSeconds) private freshnessThresholds;
    mapping(uint8 policyClass => uint256 maxBlocks) private policyExpiryBlocks;
    mapping(uint8 primaryType => uint256 maxSeconds) private digestDeadlineSeconds;

    address private riskOracleAdapter;
    address public harvestAuthority;
    uint256 private harvestCoolingBlocksValue;
    uint256 private operatorRecoveryNBlocksValue;
    uint16 private forceExitBufferBpsValue;
    uint16 private dustBpsValue;
    uint256 private dustAbsoluteCapValue;
    uint256 private dustFloorValue;
    uint8 private maxFailedAttemptsValue;
    uint16 private attemptThrottleWindowValue;
    uint256 private minThirdPartyRepayValue;
    uint256 private maxRpcBlockLagValue;
    uint256 private forceExitMaxDeadlineValue;
    uint256 private revocationGraceValue;
    uint64 private anchorCadenceBlocksValue;

    struct PendingRole {
        address next;
        uint256 effectiveBlock;
    }

    mapping(uint8 roleId => PendingRole pending) private pendingRoles;
    /// @dev When true, executor/authorization reject unregistered spenders (production).
    bool public spendAllowlistEnforced;

    /// @dev While false, `batchUpdate` applies immediately (deploy/bootstrap). After
    ///      `closeBootstrap()`, batches queue for REGISTRY_TIMELOCK_BLOCKS then `applyBatchUpdate`.
    bool public bootstrapClosed;

    struct PendingBatch {
        bytes32 opsHash;
        uint256 nextVersion;
        bytes32 nextRoot;
        uint256 effectiveBlock;
        uint16 opCount;
    }

    PendingBatch private pendingBatch;

    constructor(address initialOwner) Ownable(initialOwner) {
        harvestCoolingBlocksValue = 30;
        operatorRecoveryNBlocksValue = 1_296_000;
        dustBpsValue = 5;
        dustAbsoluteCapValue = 10 ether;
        dustFloorValue = 1_000;
        maxFailedAttemptsValue = 5;
        attemptThrottleWindowValue = 60;
        minThirdPartyRepayValue = 1e18;
        maxRpcBlockLagValue = 5;
        forceExitMaxDeadlineValue = 1 days;
        revocationGraceValue = 5;
        anchorCadenceBlocksValue = 100;
    }

    /// @notice Fail-closed production readiness check (2026-06-17 deploy audit).
    /// @dev Call after bootstrap before pointing real capital / opening the audit gate.
    function assertProductionReadiness(bytes32 market) external view {
        if (morpho == address(0)) revert ProductionReadinessFailed("morpho");
        if (loopAuthorization == address(0)) revert ProductionReadinessFailed("authorization");
        if (loopForceExitAuthorizer == address(0)) revert ProductionReadinessFailed("forceAuthorizer");
        if (riskOracleAdapter == address(0)) revert ProductionReadinessFailed("riskOracle");
        if (emergencyGuardian == address(0)) revert ProductionReadinessFailed("guardian");
        if (governanceRole == address(0)) revert ProductionReadinessFailed("governance");
        if (indexerSigningKey == address(0)) revert ProductionReadinessFailed("indexerSigner");
        if (anchorSubmitter == address(0)) revert ProductionReadinessFailed("anchorSubmitter");
        if (freshnessThresholds[LoopV1Types.SOURCE_CHAINLINK_FEED] == 0) {
            revert ProductionReadinessFailed("chainlinkFreshness");
        }
        if (!supportedMarkets[market]) revert ProductionReadinessFailed("market");
        if (executors[uint8(LoopV1Types.PrimaryType.OPEN)] == address(0)) {
            revert ProductionReadinessFailed("openExecutor");
        }
        if (executors[uint8(LoopV1Types.PrimaryType.EXIT)] == address(0)) {
            revert ProductionReadinessFailed("exitExecutor");
        }
        if (executors[uint8(LoopV1Types.PrimaryType.FORCE_EXIT)] == address(0)) {
            revert ProductionReadinessFailed("forceExitExecutor");
        }
        if (!spendAllowlistEnforced) revert ProductionReadinessFailed("spendAllowlist");
        LoopV1Types.MorphoMarketParams memory params = marketParamStore[market];
        if (params.loanToken == address(0)) revert ProductionReadinessFailed("marketParams");
        address vault = wstDiemVaults[market];
        address curve = curvePools[market];
        if (spenderChecks[uint8(LoopV1Types.PrimaryType.OPEN)][params.loanToken][vault].spender != vault) {
            revert ProductionReadinessFailed("openVaultSpender");
        }
        if (spenderChecks[uint8(LoopV1Types.PrimaryType.EXIT)][params.collateralToken][curve].spender != curve) {
            revert ProductionReadinessFailed("exitCurveSpender");
        }
        if (spenderChecks[uint8(LoopV1Types.PrimaryType.OPEN)][params.loanToken][morpho].spender != morpho) {
            revert ProductionReadinessFailed("openMorphoSpender");
        }
        if (requiredEvidenceSources[uint8(LoopV1Types.PrimaryType.OPEN)].length == 0) {
            revert ProductionReadinessFailed("openEvidenceSet");
        }
        if (requiredEvidenceSources[uint8(LoopV1Types.PrimaryType.EXIT)].length == 0) {
            revert ProductionReadinessFailed("exitEvidenceSet");
        }
        // Fingerprints must be applied (validateExternalConfig fail-closed when missing).
        if (!this.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN))) {
            revert ProductionReadinessFailed("openFingerprints");
        }
        if (!this.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.EXIT))) {
            revert ProductionReadinessFailed("exitFingerprints");
        }
        // Immediate batchUpdate must no longer be available for production.
        if (!bootstrapClosed) revert ProductionReadinessFailed("bootstrapOpen");
    }

    /// @notice Irreversibly end the bootstrap window. Fingerprint apply + initial wiring first.
    function closeBootstrap() external onlyOwner {
        if (bootstrapClosed) revert BootstrapAlreadyClosed();
        bootstrapClosed = true;
        emit BootstrapClosed(block.number);
    }

    function pendingBatchUpdate()
        external
        view
        returns (bytes32 opsHash, uint256 nextVersion, bytes32 nextRoot, uint256 effectiveBlock, uint16 opCount)
    {
        PendingBatch storage p = pendingBatch;
        return (p.opsHash, p.nextVersion, p.nextRoot, p.effectiveBlock, p.opCount);
    }

    function cancelPendingBatch() external onlyOwner {
        PendingBatch storage p = pendingBatch;
        if (p.effectiveBlock == 0) revert NoPendingBatch();
        uint256 version = p.nextVersion;
        bytes32 root = p.nextRoot;
        delete pendingBatch;
        emit RegistryConfigBatchCancelled(version, root, msg.sender);
    }

    function setSpendAllowlistEnforced(bool enforced) external onlyOwner {
        spendAllowlistEnforced = enforced;
        emit SpendAllowlistEnforcementChanged(enforced);
    }

    function pendingCriticalRole(uint8 roleId) external view returns (address next, uint256 effectiveBlock) {
        PendingRole storage p = pendingRoles[roleId];
        return (p.next, p.effectiveBlock);
    }

    modifier onlyLoopAuthorization() {
        if (msg.sender != loopAuthorization) revert LoopV1Errors.OnlyAuthorization();
        _;
    }

    modifier onlyHarvestAuthority() {
        if (msg.sender != harvestAuthority) revert LoopV1Errors.HarvestAuthorityOnly();
        _;
    }

    /// @notice Commit a config batch. Immediate while bootstrap is open; queues under timelock after close.
    function batchUpdate(BatchOp[] calldata ops, uint256 nextVersion, bytes32 nextRoot) external onlyOwner {
        if (ops.length == 0) revert EmptyBatch();
        if (nextVersion <= registryVersion) revert NonMonotonicRegistryVersion();
        if (!bootstrapClosed) {
            _commitBatch(ops, nextVersion, nextRoot);
            return;
        }
        // Post-bootstrap: queue only; caller must re-supply identical ops to applyBatchUpdate.
        uint256 effectiveBlock = block.number + REGISTRY_TIMELOCK_BLOCKS;
        pendingBatch = PendingBatch({
            opsHash: keccak256(abi.encode(ops)),
            nextVersion: nextVersion,
            nextRoot: nextRoot,
            effectiveBlock: effectiveBlock,
            opCount: uint16(ops.length)
        });
        emit RegistryConfigBatchQueued(nextVersion, nextRoot, msg.sender, uint16(ops.length), effectiveBlock);
    }

    /// @notice Apply a queued batch after the registry timelock. `ops` must hash-match the queue.
    function applyBatchUpdate(BatchOp[] calldata ops) external onlyOwner {
        if (!bootstrapClosed) revert BootstrapStillOpen();
        PendingBatch memory pending = pendingBatch;
        if (pending.effectiveBlock == 0) revert NoPendingBatch();
        if (block.number < pending.effectiveBlock) revert LoopV1Errors.FingerprintTimelockNotElapsed();
        if (ops.length != pending.opCount) revert PendingBatchMismatch();
        if (keccak256(abi.encode(ops)) != pending.opsHash) revert PendingBatchMismatch();
        // Monotonicity: reject if another path advanced version (should not happen without apply).
        if (pending.nextVersion <= registryVersion) revert NonMonotonicRegistryVersion();
        delete pendingBatch;
        _commitBatch(ops, pending.nextVersion, pending.nextRoot);
    }

    function _commitBatch(BatchOp[] calldata ops, uint256 nextVersion, bytes32 nextRoot) private {
        for (uint256 i = 0; i < ops.length; i++) {
            _dispatch(ops[i]);
        }
        registryVersion = nextVersion;
        registryMerkleRoot = nextRoot;
        emit RegistryConfigBatchCommitted(nextVersion, nextRoot, msg.sender, uint16(ops.length));
    }

    function setRegistryVersion(uint256) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function setRegistryMerkleRoot(bytes32 nextRoot) external onlyOwner {
        if (nextRoot == registryMerkleRoot) return;
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function setIndexerSigningKey(address nextKey) external onlyOwner {
        if (nextKey == address(0)) revert ZeroAddress();
        if (nextKey == anchorSubmitter) revert IndexerEqualsAnchor();
        if (indexerSigningKey == address(0)) {
            _applyIndexerSigningKey(nextKey);
            return;
        }
        _queueRole(ROLE_INDEXER_SIGNER, nextKey);
    }

    function applyIndexerSigningKey() external onlyOwner {
        address next = _consumePendingRole(ROLE_INDEXER_SIGNER);
        if (next == anchorSubmitter) revert IndexerEqualsAnchor();
        _applyIndexerSigningKey(next);
    }

    function setAnchorSubmitter(address nextSubmitter) external onlyOwner {
        if (nextSubmitter == address(0)) revert ZeroAddress();
        if (nextSubmitter == indexerSigningKey) revert IndexerEqualsAnchor();
        if (anchorSubmitter == address(0)) {
            _applyAnchorSubmitter(nextSubmitter);
            return;
        }
        _queueRole(ROLE_ANCHOR_SUBMITTER, nextSubmitter);
    }

    function applyAnchorSubmitter() external onlyOwner {
        address next = _consumePendingRole(ROLE_ANCHOR_SUBMITTER);
        if (next == indexerSigningKey) revert IndexerEqualsAnchor();
        _applyAnchorSubmitter(next);
    }

    function setEmergencyGuardian(address nextGuardian) external onlyOwner {
        if (nextGuardian == address(0)) revert ZeroAddress();
        if (emergencyGuardian == address(0)) {
            _applyEmergencyGuardian(nextGuardian);
            return;
        }
        _queueRole(ROLE_EMERGENCY_GUARDIAN, nextGuardian);
    }

    function applyEmergencyGuardian() external onlyOwner {
        _applyEmergencyGuardian(_consumePendingRole(ROLE_EMERGENCY_GUARDIAN));
    }

    function setGovernanceRole(address nextGovernance) external onlyOwner {
        if (nextGovernance == address(0)) revert ZeroAddress();
        if (governanceRole == address(0)) {
            _applyGovernanceRole(nextGovernance);
            return;
        }
        _queueRole(ROLE_GOVERNANCE, nextGovernance);
    }

    function applyGovernanceRole() external onlyOwner {
        _applyGovernanceRole(_consumePendingRole(ROLE_GOVERNANCE));
    }

    function setAnchorCadenceBlocks(uint64 nextCadenceBlocks) external onlyOwner {
        if (nextCadenceBlocks == 0) revert ZeroAddress();
        anchorCadenceBlocksValue = nextCadenceBlocks;
    }

    function anchorCadenceBlocks() external view returns (uint64) {
        return anchorCadenceBlocksValue;
    }

    function setLoopAuthorization(address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function setLoopForceExitAuthorizer(address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function setExecutorFor(uint8, address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function executorFor(uint8 primaryType) external view returns (address) {
        return executors[primaryType];
    }

    function setSupportedMarket(bytes32, bool) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function supportedMarket(bytes32 market) external view returns (bool) {
        return supportedMarkets[market];
    }

    function setMarketParams(bytes32, LoopV1Types.MorphoMarketParams calldata) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function marketParams(bytes32 market) external view returns (LoopV1Types.MorphoMarketParams memory) {
        return marketParamStore[market];
    }

    function setAllowedSpender(uint8, address, address, SpenderCheck calldata) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function allowedSpender(uint8 primaryType, address token, address spender)
        external
        view
        returns (SpenderCheck memory)
    {
        return spenderChecks[primaryType][token][spender];
    }

    function setCanonicalSource(bytes32, bytes32, address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function canonicalSource(bytes32 market, bytes32 sourceId) external view returns (address sourceAddress) {
        return canonicalSources[market][sourceId];
    }

    function setRequiredEvidenceSourceSet(uint8, bytes32[] calldata) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function requiredEvidenceSourceSet(uint8 primaryType) external view returns (bytes32[] memory sourceIds) {
        return requiredEvidenceSources[primaryType];
    }

    function externalFingerprint(bytes32 integrationId)
        external
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory fingerprint)
    {
        return fingerprints[integrationId];
    }

    function pendingExternalFingerprint(bytes32 integrationId)
        external
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory fingerprint, uint256 effectiveBlock)
    {
        PendingFingerprint storage pending = pendingFingerprints[integrationId];
        return (pending.fingerprint, pending.effectiveBlock);
    }

    function queueExternalFingerprintUpdate(
        bytes32 integrationId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) external onlyOwner {
        _validateFingerprintShape(integrationId, fingerprint);
        bytes32 market = fingerprintMarkets[integrationId];
        bytes32 sourceId = fingerprintSources[integrationId];
        if (sourceId == bytes32(0)) revert LoopV1Errors.FingerprintInvalid(6);
        FingerprintBaseline memory baseline = _validateQueuedFingerprint(market, sourceId, fingerprint);
        uint256 effectiveBlock = block.number + REGISTRY_TIMELOCK_BLOCKS;
        pendingFingerprints[integrationId] = PendingFingerprint(fingerprint, effectiveBlock, baseline);
        emit ExternalFingerprintUpdateQueued(integrationId, fingerprint.fingerprintHash, effectiveBlock);
    }

    function applyExternalFingerprintUpdate(bytes32) external {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function updateExternalFingerprint(bytes32, LoopV1Types.ExternalProtocolFingerprint calldata) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function validateExternalConfig(bytes32 market, uint8 primaryType) external view returns (bool valid) {
        if (!_fingerprintValidationEnabled(market)) return true;
        bytes32[] memory required = _requiredFingerprintSourceIds(primaryType);
        for (uint256 i = 0; i < required.length; i++) {
            _validateConfiguredFingerprint(market, required[i]);
        }
        return true;
    }

    function navBaseline(bytes32 market) external view returns (uint256) {
        return fingerprintBaselines[_integrationId(market, LoopV1Types.SOURCE_VAULT_NAV)].value0;
    }

    function setPreimageDisplayGuaranteedWallet(address wallet, bool allowed) external onlyOwner {
        preimageDisplayWallets[wallet] = allowed;
    }

    function preimageDisplayGuaranteedWallet(address wallet) external view returns (bool) {
        return preimageDisplayWallets[wallet];
    }

    function setPermissionlessCallerAllowed(address caller, bool allowed) external onlyOwner {
        permissionlessCallers[caller] = allowed;
    }

    function permissionlessCallerAllowed(address caller) external view returns (bool) {
        return permissionlessCallers[caller];
    }

    function setProviderFamily(bytes32 rpcEndpointId, bytes32 family) external onlyOwner {
        providerFamilies[rpcEndpointId] = family;
    }

    function providerFamily(bytes32 rpcEndpointId) external view returns (bytes32) {
        return providerFamilies[rpcEndpointId];
    }

    function setCurvePool(bytes32, address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function curvePool(bytes32 market) external view returns (address) {
        return curvePools[market];
    }

    function setUniswapV3FlashPool(bytes32, address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function uniswapV3FlashPool(bytes32 market) external view returns (address) {
        return uniswapV3FlashPools[market];
    }

    function setWstDiemVault(bytes32, address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function wstDiemVault(bytes32 market) external view returns (address) {
        return wstDiemVaults[market];
    }

    function setUniswapV3Factory(bytes32, address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function uniswapV3Factory(bytes32 market) external view returns (address) {
        return uniswapV3Factories[market];
    }

    function setUniswapV3FlashFeeTier(bytes32, uint24) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function uniswapV3FlashFeeTier(bytes32 market) external view returns (uint24) {
        return uniswapV3FlashFeeTiers[market];
    }

    function sourceTaxonomy() external pure returns (bytes32[] memory sourceIds) {
        sourceIds = new bytes32[](7);
        sourceIds[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        sourceIds[1] = LoopV1Types.SOURCE_VAULT_NAV;
        sourceIds[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        sourceIds[3] = LoopV1Types.SOURCE_CURVE_QUOTE;
        sourceIds[4] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        sourceIds[5] = LoopV1Types.SOURCE_HARVEST_EVENT;
        sourceIds[6] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
    }

    function recordHarvest(bytes32 market, uint256 blockNumber, bytes32 topic0) external onlyHarvestAuthority {
        harvestBlocks[market] = blockNumber;
        emit HarvestObserved(market, blockNumber, topic0);
    }

    function setHarvestAuthority(address nextAuthority) external onlyOwner {
        if (harvestAuthority == address(0)) {
            harvestAuthority = nextAuthority;
            return;
        }
        if (nextAuthority == address(0)) revert ZeroAddress();
        _queueRole(ROLE_HARVEST_AUTHORITY, nextAuthority);
    }

    function applyHarvestAuthority() external onlyOwner {
        address next = _consumePendingRole(ROLE_HARVEST_AUTHORITY);
        address previous = harvestAuthority;
        harvestAuthority = next;
        emit CriticalRoleUpdateApplied(ROLE_HARVEST_AUTHORITY, previous, next);
    }

    function _queueRole(uint8 roleId, address next) private {
        uint256 effectiveBlock = block.number + REGISTRY_TIMELOCK_BLOCKS;
        pendingRoles[roleId] = PendingRole(next, effectiveBlock);
        emit CriticalRoleUpdateQueued(roleId, next, effectiveBlock);
    }

    function _consumePendingRole(uint8 roleId) private returns (address next) {
        PendingRole storage pending = pendingRoles[roleId];
        if (pending.next == address(0)) revert NoPendingRoleUpdate();
        if (block.number < pending.effectiveBlock) revert LoopV1Errors.FingerprintTimelockNotElapsed();
        next = pending.next;
        delete pendingRoles[roleId];
    }

    function _applyIndexerSigningKey(address nextKey) private {
        address previous = indexerSigningKey;
        indexerSigningKey = nextKey;
        emit IndexerSignerRotated(previous, nextKey, block.number);
        emit CriticalRoleUpdateApplied(ROLE_INDEXER_SIGNER, previous, nextKey);
    }

    function _applyAnchorSubmitter(address nextSubmitter) private {
        address previous = anchorSubmitter;
        anchorSubmitter = nextSubmitter;
        emit AnchorSubmitterRotated(previous, nextSubmitter, block.number);
        emit CriticalRoleUpdateApplied(ROLE_ANCHOR_SUBMITTER, previous, nextSubmitter);
    }

    function _applyEmergencyGuardian(address nextGuardian) private {
        address previous = emergencyGuardian;
        emergencyGuardian = nextGuardian;
        emit RegistryEmergencyGuardianChanged(previous, nextGuardian, block.number);
        emit CriticalRoleUpdateApplied(ROLE_EMERGENCY_GUARDIAN, previous, nextGuardian);
    }

    function _applyGovernanceRole(address nextGovernance) private {
        address previous = governanceRole;
        governanceRole = nextGovernance;
        emit GovernanceRoleChanged(previous, nextGovernance);
        emit CriticalRoleUpdateApplied(ROLE_GOVERNANCE, previous, nextGovernance);
    }

    function lastHarvestBlock(bytes32 market) external view returns (uint256) {
        return harvestBlocks[market];
    }

    function setHarvestCoolingBlocks(uint256 nextCoolingBlocks) external onlyOwner {
        harvestCoolingBlocksValue = nextCoolingBlocks;
    }

    function harvestCoolingBlocks() external view returns (uint256) {
        return harvestCoolingBlocksValue;
    }

    function setOperatorRecoveryRole(address candidate, bool allowed) external onlyOwner {
        operatorRecoveryRoles[candidate] = allowed;
    }

    function operatorRecoveryRole(address candidate) external view returns (bool) {
        return operatorRecoveryRoles[candidate];
    }

    function setOperatorRecoveryNBlocks(uint256 nextBlocks) external onlyOwner {
        operatorRecoveryNBlocksValue = nextBlocks;
    }

    function operatorRecoveryNBlocks() external view returns (uint256) {
        return operatorRecoveryNBlocksValue;
    }

    function setForceExitBufferBps(uint16 nextBps) external onlyOwner {
        if (nextBps > 10_000) revert LoopV1Errors.LiquidationDistanceBoundFailure();
        forceExitBufferBpsValue = nextBps;
    }

    function forceExitBufferBps() external view returns (uint16) {
        return forceExitBufferBpsValue;
    }

    function recordOwnerActivity(address owner_) external onlyLoopAuthorization {
        ownerActivityBlocks[owner_] = block.number;
        emit OwnerActivityRecorded(owner_, block.number);
    }

    function ownerLastSignedActionBlock(address owner_) external view returns (uint256) {
        return ownerActivityBlocks[owner_];
    }

    function setSourceFreshnessThreshold(bytes32 sourceId, uint256 thresholdSeconds) external onlyOwner {
        if (!_isCanonicalSource(sourceId)) revert LoopV1Errors.EvidenceSourceUnexpected();
        freshnessThresholds[sourceId] = thresholdSeconds;
    }

    function sourceFreshnessThreshold(bytes32 sourceId) external view returns (uint256) {
        return freshnessThresholds[sourceId];
    }

    function loopRiskOracleAdapter() external view returns (address) {
        return riskOracleAdapter;
    }

    function setLoopRiskOracleAdapter(address nextAdapter) external onlyOwner {
        riskOracleAdapter = nextAdapter;
    }

    function setDustBoundBps(uint16) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function setDustBoundAbsoluteCap(uint256) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function setDustBoundFloor(uint256) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function dustBoundFor(bytes32, uint256 inputAmount) external view returns (uint256) {
        uint256 bpsBound = inputAmount * dustBpsValue / 10_000;
        uint256 variableBound = bpsBound < dustAbsoluteCapValue ? bpsBound : dustAbsoluteCapValue;
        return variableBound > dustFloorValue ? variableBound : dustFloorValue;
    }

    function setMaxFailedAttemptsPerWindow(uint8 nextMax) external onlyOwner {
        maxFailedAttemptsValue = nextMax;
    }

    function maxFailedAttemptsPerWindow() external view returns (uint8) {
        return maxFailedAttemptsValue;
    }

    function setAttemptThrottleWindowBlocks(uint16 nextWindow) external onlyOwner {
        attemptThrottleWindowValue = nextWindow;
    }

    function attemptThrottleWindowBlocks() external view returns (uint16) {
        return attemptThrottleWindowValue;
    }

    function setMinThirdPartyRepayDiem(uint256 nextMin) external onlyOwner {
        minThirdPartyRepayValue = nextMin;
    }

    function minThirdPartyRepayDiem() external view returns (uint256) {
        return minThirdPartyRepayValue;
    }

    function setMaxRpcBlockLagBlocks(uint256 nextLag) external onlyOwner {
        maxRpcBlockLagValue = nextLag;
    }

    function maxRpcBlockLagBlocks() external view returns (uint256) {
        return maxRpcBlockLagValue;
    }

    function setForceExitMaxDeadlineSeconds(uint256 nextSeconds) external onlyOwner {
        if (nextSeconds > 1 days) revert LoopV1Errors.ForceExitDeadlineExceedsBound();
        forceExitMaxDeadlineValue = nextSeconds;
    }

    function forceExitMaxDeadlineSeconds() external view returns (uint256) {
        return forceExitMaxDeadlineValue;
    }

    function setMaxPolicyExpiryBlocks(uint8 policyClass, uint256 nextBlocks) external onlyOwner {
        policyExpiryBlocks[policyClass] = nextBlocks;
    }

    function maxPolicyExpiryBlocks(uint8 policyClass) external view returns (uint256) {
        uint256 stored = policyExpiryBlocks[policyClass];
        if (stored != 0) return stored;
        if (policyClass == 3 || policyClass == 4) return 3_888_000;
        return 1_296_000;
    }

    function setMaxDigestDeadline(uint8 primaryType, uint256 nextSeconds) external onlyOwner {
        digestDeadlineSeconds[primaryType] = nextSeconds;
    }

    function maxDigestDeadline(uint8 primaryType) external view returns (uint256) {
        uint256 stored = digestDeadlineSeconds[primaryType];
        return stored == 0 ? 1 days : stored;
    }

    function setRevocationGraceBlocks(uint256 nextBlocks) external onlyOwner {
        revocationGraceValue = nextBlocks;
    }

    function revocationGraceBlocks() external view returns (uint256) {
        return revocationGraceValue;
    }

    function setMorpho(address) external onlyOwner {
        revert LoopV1Errors.ConfigMutationOutsideAtomicGate();
    }

    function _dispatch(BatchOp calldata op) private {
        if (op.op == OP_SET_MARKET_PARAMS) {
            (bytes32 market, LoopV1Types.MorphoMarketParams memory params) =
                abi.decode(op.data, (bytes32, LoopV1Types.MorphoMarketParams));
            marketParamStore[market] = params;
            _rememberFingerprint(market, LoopV1Types.SOURCE_MORPHO_POSITION);
        } else if (op.op == OP_SET_CANONICAL_SOURCE) {
            (bytes32 market, bytes32 sourceId, address sourceAddress) = abi.decode(op.data, (bytes32, bytes32, address));
            if (!_isCanonicalSource(sourceId)) revert LoopV1Errors.EvidenceSourceUnexpected();
            canonicalSources[market][sourceId] = sourceAddress;
            if (
                sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED || sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME
                    || sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT
            ) {
                _rememberFingerprint(market, sourceId);
            }
        } else if (op.op == OP_SET_REQUIRED_EVIDENCE_SOURCE_SET) {
            (uint8 primaryType, bytes32[] memory sourceIds) = abi.decode(op.data, (uint8, bytes32[]));
            _validateEvidenceSourceSet(primaryType, sourceIds);
            requiredEvidenceSources[primaryType] = sourceIds;
        } else if (op.op == OP_SET_EXECUTOR_FOR) {
            (uint8 primaryType, address executor) = abi.decode(op.data, (uint8, address));
            executors[primaryType] = executor;
        } else if (op.op == OP_SET_LOOP_AUTHORIZATION) {
            loopAuthorization = abi.decode(op.data, (address));
        } else if (op.op == OP_SET_LOOP_FORCE_EXIT_AUTHORIZER) {
            loopForceExitAuthorizer = abi.decode(op.data, (address));
        } else if (op.op == OP_SET_ALLOWED_SPENDER) {
            (uint8 primaryType, address token, address spender, SpenderCheck memory check) =
                abi.decode(op.data, (uint8, address, address, SpenderCheck));
            spenderChecks[primaryType][token][spender] = check;
        } else if (op.op == OP_SET_MORPHO) {
            morpho = abi.decode(op.data, (address));
        } else if (op.op == OP_SET_CURVE_POOL) {
            (bytes32 market, address pool) = abi.decode(op.data, (bytes32, address));
            curvePools[market] = pool;
            _rememberFingerprint(market, LoopV1Types.SOURCE_CURVE_QUOTE);
        } else if (op.op == OP_SET_UNISWAP_V3_FLASH_POOL) {
            (bytes32 market, address pool) = abi.decode(op.data, (bytes32, address));
            uniswapV3FlashPools[market] = pool;
            _rememberFingerprint(market, LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT);
        } else if (op.op == OP_SET_WSTDIEM_VAULT) {
            (bytes32 market, address vault) = abi.decode(op.data, (bytes32, address));
            wstDiemVaults[market] = vault;
            _rememberFingerprint(market, LoopV1Types.SOURCE_VAULT_NAV);
        } else if (op.op == OP_SET_UNISWAP_V3_FACTORY) {
            (bytes32 market, address factory) = abi.decode(op.data, (bytes32, address));
            uniswapV3Factories[market] = factory;
        } else if (op.op == OP_SET_UNISWAP_V3_FLASH_FEE_TIER) {
            (bytes32 market, uint24 feeTier) = abi.decode(op.data, (bytes32, uint24));
            uniswapV3FlashFeeTiers[market] = feeTier;
        } else if (op.op == OP_APPLY_EXTERNAL_FINGERPRINT) {
            _applyExternalFingerprint(abi.decode(op.data, (bytes32)));
        } else if (op.op == OP_SET_DUST_BPS) {
            dustBpsValue = abi.decode(op.data, (uint16));
        } else if (op.op == OP_SET_DUST_ABSOLUTE_CAP) {
            dustAbsoluteCapValue = abi.decode(op.data, (uint256));
        } else if (op.op == OP_SET_DUST_FLOOR) {
            dustFloorValue = abi.decode(op.data, (uint256));
        } else if (op.op == OP_SET_SUPPORTED_MARKET) {
            (bytes32 market, bool supported) = abi.decode(op.data, (bytes32, bool));
            supportedMarkets[market] = supported;
        } else if (op.op == OP_SET_FORCE_EXIT_BUFFER_BPS) {
            uint256 nextBps = abi.decode(op.data, (uint256));
            if (nextBps > 10_000) revert LoopV1Errors.LiquidationDistanceBoundFailure();
            // casting to uint16 is safe because nextBps is bounded by 10_000 above.
            // forge-lint: disable-next-line(unsafe-typecast)
            forceExitBufferBpsValue = uint16(nextBps);
        } else {
            revert UnknownBatchOp(op.op);
        }
    }

    function _validateEvidenceSourceSet(uint8 primaryType, bytes32[] memory sourceIds) private pure {
        bytes32[] memory required = _requiredSourceIdsForPrimaryType(primaryType);
        if (sourceIds.length != required.length) {
            if (sourceIds.length < required.length) revert LoopV1Errors.EvidenceSourceMissing();
            revert LoopV1Errors.EvidenceSourceUnexpected();
        }
        for (uint256 i = 0; i < required.length; i++) {
            if (!_isCanonicalSource(sourceIds[i])) revert LoopV1Errors.EvidenceSourceUnexpected();
            if (i != 0 && sourceIds[i - 1] >= sourceIds[i]) revert LoopV1Errors.EvidenceUnsorted();
        }
        for (uint256 i = 0; i < required.length; i++) {
            if (sourceIds[i] != required[i]) revert LoopV1Errors.EvidenceSourceUnexpected();
        }
    }

    function _requiredSourceIdsForPrimaryType(uint8 primaryType) private pure returns (bytes32[] memory required) {
        if (primaryType == uint8(LoopV1Types.PrimaryType.REVOKE)) return new bytes32[](0);
        if (primaryType == uint8(LoopV1Types.PrimaryType.OPEN)) {
            required = new bytes32[](5);
            required[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
            required[1] = LoopV1Types.SOURCE_VAULT_NAV;
            required[2] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
            required[3] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
            required[4] = LoopV1Types.SOURCE_CHAINLINK_FEED;
            return required;
        }
        required = new bytes32[](6);
        required[0] = LoopV1Types.SOURCE_CURVE_QUOTE;
        required[1] = LoopV1Types.SOURCE_MORPHO_POSITION;
        required[2] = LoopV1Types.SOURCE_VAULT_NAV;
        required[3] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        required[4] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        required[5] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        return required;
    }

    function _isCanonicalSource(bytes32 sourceId) private pure returns (bool) {
        return sourceId == LoopV1Types.SOURCE_MORPHO_POSITION || sourceId == LoopV1Types.SOURCE_VAULT_NAV
            || sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED || sourceId == LoopV1Types.SOURCE_CURVE_QUOTE
            || sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME || sourceId == LoopV1Types.SOURCE_HARVEST_EVENT
            || sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
    }

    function _integrationId(bytes32 market, bytes32 sourceId) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("wstdiem.integration", market, sourceId));
    }

    function _rememberFingerprint(bytes32 market, bytes32 sourceId) private {
        bytes32 integrationId = _integrationId(market, sourceId);
        fingerprintMarkets[integrationId] = market;
        fingerprintSources[integrationId] = sourceId;
    }

    function _requiredFingerprintSourceIds(uint8 primaryType) private pure returns (bytes32[] memory required) {
        if (primaryType == uint8(LoopV1Types.PrimaryType.REVOKE)) return new bytes32[](0);
        if (primaryType == uint8(LoopV1Types.PrimaryType.OPEN)) {
            required = new bytes32[](5);
            required[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
            required[1] = LoopV1Types.SOURCE_VAULT_NAV;
            required[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
            required[3] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
            required[4] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
            return required;
        }
        required = new bytes32[](6);
        required[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        required[1] = LoopV1Types.SOURCE_VAULT_NAV;
        required[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        required[3] = LoopV1Types.SOURCE_CURVE_QUOTE;
        required[4] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        required[5] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        return required;
    }

    function _validateConfiguredFingerprint(bytes32 market, bytes32 sourceId) private view {
        address expected = _venueAddress(market, sourceId);
        if (expected == address(0)) return;
        bytes32 integrationId = _integrationId(market, sourceId);
        LoopV1Types.ExternalProtocolFingerprint storage fp = fingerprints[integrationId];
        if (fp.integrationId == bytes32(0)) revert LoopV1Errors.ConfigIntegrityFailure();
        if (fp.integration != expected || _fingerprintHash(fp) != fp.fingerprintHash) {
            revert LoopV1Errors.FingerprintMismatch(1);
        }
        (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory current) =
            _liveFingerprint(market, sourceId, expected, false);
        if (hard != fp.hardEqualityHash) revert LoopV1Errors.FingerprintMismatch(1);
        FingerprintBaseline storage baseline = fingerprintBaselines[integrationId];
        if (!_withinTolerance(sourceId, baseline, current)) revert LoopV1Errors.FingerprintMismatch(2);
        if (!_liveBaselineFresh(sourceId, live, current)) revert LoopV1Errors.FingerprintMismatch(3);
        tolerance;
    }

    function _validateQueuedFingerprint(
        bytes32 market,
        bytes32 sourceId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) private view returns (FingerprintBaseline memory baseline) {
        address expected = _venueAddress(market, sourceId);
        if (expected == address(0) || fingerprint.integration != expected) revert LoopV1Errors.FingerprintInvalid(2);
        (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory current) =
            _liveFingerprint(market, sourceId, expected, true);
        if (fingerprint.hardEqualityHash != hard) revert LoopV1Errors.FingerprintInvalid(1);
        if (fingerprint.toleranceBandHash != tolerance) revert LoopV1Errors.FingerprintInvalid(2);
        if (fingerprint.liveBaselineHash != live) revert LoopV1Errors.FingerprintInvalid(3);
        return current;
    }

    function _validateFingerprintShape(
        bytes32 integrationId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) private pure {
        if (fingerprint.integrationId != integrationId) {
            revert LoopV1Errors.FingerprintInvalid(1);
        }
        if (fingerprint.integration == address(0)) revert LoopV1Errors.FingerprintInvalid(2);
        if (fingerprint.liveBaselineHash == bytes32(0)) revert LoopV1Errors.FingerprintInvalid(3);
        if (_fingerprintHashCalldata(fingerprint) != fingerprint.fingerprintHash) {
            revert LoopV1Errors.FingerprintInvalid(4);
        }
    }

    function _applyExternalFingerprint(bytes32 integrationId) private {
        PendingFingerprint storage pending = pendingFingerprints[integrationId];
        if (pending.effectiveBlock == 0) revert LoopV1Errors.FingerprintInvalid(5);
        if (block.number < pending.effectiveBlock) revert LoopV1Errors.FingerprintTimelockNotElapsed();
        fingerprints[integrationId] = pending.fingerprint;
        fingerprintBaselines[integrationId] = pending.baseline;
        emit ExternalFingerprintUpdateApplied(integrationId, pending.fingerprint.fingerprintHash);
        emit ReclosedIntegration(integrationId);
        delete pendingFingerprints[integrationId];
    }

    function _venueAddress(bytes32 market, bytes32 sourceId) private view returns (address) {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) return morpho;
        if (sourceId == LoopV1Types.SOURCE_VAULT_NAV) return wstDiemVaults[market];
        if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) return canonicalSources[market][sourceId];
        if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) return curvePools[market];
        if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) return canonicalSources[market][sourceId];
        if (sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT) {
            address pool = uniswapV3FlashPools[market];
            return pool == address(0) ? canonicalSources[market][sourceId] : pool;
        }
        return address(0);
    }

    function _fingerprintValidationEnabled(bytes32 market) private view returns (bool) {
        return uniswapV3FlashPools[market] != address(0)
            || canonicalSources[market][LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT] != address(0);
    }

    function _liveFingerprint(bytes32 market, bytes32 sourceId, address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) {
            return _morphoFingerprint(market, integration, queueing);
        }
        if (sourceId == LoopV1Types.SOURCE_VAULT_NAV) return _vaultFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) return _chainlinkFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) return _curveFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) return _sequencerFingerprint(integration, queueing);
        if (sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT) {
            return _uniswapFingerprint(market, integration, queueing);
        }
        revert LoopV1Errors.FingerprintInvalid(6);
    }

    function _morphoFingerprint(bytes32 market, address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IMorphoFingerprintReader(integration).idToMarketParams(market) returns (
            address loanToken, address collateralToken, address oracle, address irm, uint256 lltv
        ) {
            LoopV1Types.MorphoMarketParams memory stored = marketParamStore[market];
            if (
                loanToken != stored.loanToken || collateralToken != stored.collateralToken || oracle != stored.oracle
                    || irm != stored.irm || lltv != stored.lltv
            ) {
                if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
                revert LoopV1Errors.FingerprintMismatch(1);
            }
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.morpho.hard.v1", integration, market, loanToken, collateralToken, oracle, irm, lltv
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.morpho.live.v1", market));
            return (hard, tolerance, live, baseline);
        } catch {
            if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
            revert LoopV1Errors.FingerprintMismatch(1);
        }
    }

    function _vaultFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IERC4626FingerprintReader(integration).asset() returns (address asset_) {
            try IERC4626FingerprintReader(integration).decimals() returns (uint8 decimals_) {
                try IERC4626FingerprintReader(integration).totalSupply() returns (uint256 supply) {
                    try IERC4626FingerprintReader(integration).totalAssets() returns (uint256 assets) {
                        try IERC4626FingerprintReader(integration).convertToAssets(WAD) returns (uint256 nav) {
                            if (supply == 0 || assets == 0 || nav == 0) {
                                if (queueing) revert LoopV1Errors.FingerprintInvalid(2);
                                revert LoopV1Errors.FingerprintMismatch(2);
                            }
                            baseline.value0 = nav;
                            hard = keccak256(abi.encode("wstdiem.fp.vault.hard.v1", integration, asset_, decimals_));
                            tolerance =
                                keccak256(abi.encode("wstdiem.fp.vault.tolerance.v1", nav, MAX_TOLERANCE_STEP_BPS));
                            live = keccak256(abi.encode("wstdiem.fp.vault.live.v1", supply != 0, assets != 0));
                            return (hard, tolerance, live, baseline);
                        } catch {}
                    } catch {}
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(2);
        revert LoopV1Errors.FingerprintMismatch(2);
    }

    function _chainlinkFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IChainlinkFingerprintReader(integration).aggregator() returns (address aggregator_) {
            try IChainlinkFingerprintReader(integration).decimals() returns (uint8 decimals_) {
                try IChainlinkFingerprintReader(integration).latestRoundData() returns (
                    uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80
                ) {
                    if (answer <= 0 || updatedAt == 0) {
                        if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
                        revert LoopV1Errors.FingerprintMismatch(3);
                    }
                    baseline.updatedAt = updatedAt;
                    uint16 phaseId = uint16(roundId >> 64);
                    hard = keccak256(
                        abi.encode("wstdiem.fp.chainlink.hard.v1", integration, aggregator_, decimals_, phaseId)
                    );
                    tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
                    live = keccak256(abi.encode("wstdiem.fp.chainlink.live.v1", updatedAt));
                    return (hard, tolerance, live, baseline);
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
        revert LoopV1Errors.FingerprintMismatch(3);
    }

    function _curveFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try ICurveFingerprintReader(integration).coins(0) returns (address coin0) {
            try ICurveFingerprintReader(integration).coins(1) returns (address coin1) {
                try ICurveFingerprintReader(integration).A() returns (uint256 amplification) {
                    try ICurveFingerprintReader(integration).fee() returns (uint256 fee_) {
                        try ICurveFingerprintReader(integration).balances(0) returns (uint256 balance0) {
                            try ICurveFingerprintReader(integration).balances(1) returns (uint256 balance1) {
                                baseline.value0 = balance0;
                                baseline.value1 = balance1;
                                hard = keccak256(
                                    abi.encode(
                                        "wstdiem.fp.curve.hard.v1", integration, coin0, coin1, amplification, fee_
                                    )
                                );
                                tolerance = keccak256(
                                    abi.encode(
                                        "wstdiem.fp.curve.tolerance.v1", balance0, balance1, MAX_TOLERANCE_STEP_BPS
                                    )
                                );
                                live = keccak256(abi.encode("wstdiem.fp.curve.live.v1", block.number));
                                return (hard, tolerance, live, baseline);
                            } catch {}
                        } catch {}
                    } catch {}
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(2);
        revert LoopV1Errors.FingerprintMismatch(2);
    }

    function _sequencerFingerprint(address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IChainlinkFingerprintReader(integration).decimals() returns (uint8 decimals_) {
            try IChainlinkFingerprintReader(integration).latestRoundData() returns (
                uint80, int256 answer, uint256 startedAt, uint256, uint80
            ) {
                if (answer != 0 || block.timestamp < startedAt + SEQUENCER_GRACE_SECONDS) {
                    if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
                    revert LoopV1Errors.FingerprintMismatch(3);
                }
                baseline.updatedAt = startedAt;
                hard = keccak256(abi.encode("wstdiem.fp.sequencer.hard.v1", integration, decimals_));
                tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
                live = keccak256(abi.encode("wstdiem.fp.sequencer.live.v1", startedAt));
                return (hard, tolerance, live, baseline);
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(3);
        revert LoopV1Errors.FingerprintMismatch(3);
    }

    function _uniswapFingerprint(bytes32 market, address integration, bool queueing)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live, FingerprintBaseline memory baseline)
    {
        try IUniswapV3PoolFingerprintReader(integration).factory() returns (address factory_) {
            try IUniswapV3PoolFingerprintReader(integration).token0() returns (address token0_) {
                try IUniswapV3PoolFingerprintReader(integration).token1() returns (address token1_) {
                    try IUniswapV3PoolFingerprintReader(integration).fee() returns (uint24 fee_) {
                        try IUniswapV3PoolFingerprintReader(integration).tickSpacing() returns (int24 tickSpacing_) {
                            try IUniswapV3PoolFingerprintReader(integration).liquidity() returns (uint128 liquidity_) {
                                try IUniswapV3PoolFingerprintReader(integration).slot0() returns (
                                    uint160, int24 tick, uint16, uint16, uint16, uint8, bool
                                ) {
                                    if (
                                        factory_ != uniswapV3Factories[market] || fee_ != uniswapV3FlashFeeTiers[market]
                                    ) {
                                        if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
                                        revert LoopV1Errors.FingerprintMismatch(1);
                                    }
                                    baseline.value0 = uint256(liquidity_);
                                    baseline.signedValue = tick;
                                    hard = keccak256(
                                        abi.encode(
                                            "wstdiem.fp.uniswap.hard.v1",
                                            integration,
                                            factory_,
                                            token0_,
                                            token1_,
                                            fee_,
                                            tickSpacing_
                                        )
                                    );
                                    tolerance = keccak256(
                                        abi.encode(
                                            "wstdiem.fp.uniswap.tolerance.v1", liquidity_, MAX_TOLERANCE_STEP_BPS
                                        )
                                    );
                                    live = keccak256(abi.encode("wstdiem.fp.uniswap.live.v1", tick));
                                    return (hard, tolerance, live, baseline);
                                } catch {}
                            } catch {}
                        } catch {}
                    } catch {}
                } catch {}
            } catch {}
        } catch {}
        if (queueing) revert LoopV1Errors.FingerprintInvalid(1);
        revert LoopV1Errors.FingerprintMismatch(1);
    }

    function _withinTolerance(
        bytes32 sourceId,
        FingerprintBaseline storage baseline,
        FingerprintBaseline memory current
    ) private view returns (bool) {
        if (sourceId == LoopV1Types.SOURCE_VAULT_NAV || sourceId == LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT) {
            return _withinBps(baseline.value0, current.value0, MAX_TOLERANCE_STEP_BPS);
        }
        if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) {
            return _withinBps(baseline.value0, current.value0, MAX_TOLERANCE_STEP_BPS)
                && _withinBps(baseline.value1, current.value1, MAX_TOLERANCE_STEP_BPS);
        }
        return true;
    }

    function _withinBps(uint256 baseline, uint256 current, uint16 bps) private pure returns (bool) {
        if (baseline == 0) return current == 0;
        uint256 delta = baseline > current ? baseline - current : current - baseline;
        return delta * 10_000 <= baseline * bps;
    }

    function _liveBaselineFresh(bytes32 sourceId, bytes32 liveHash, FingerprintBaseline memory current)
        private
        view
        returns (bool)
    {
        liveHash;
        if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) {
            uint256 threshold = freshnessThresholds[sourceId];
            return threshold == 0 || block.timestamp <= current.updatedAt + threshold;
        }
        if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) {
            return block.timestamp >= current.updatedAt + SEQUENCER_GRACE_SECONDS;
        }
        return true;
    }

    function _fingerprintHash(LoopV1Types.ExternalProtocolFingerprint storage fingerprint)
        private
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                fingerprint.integrationId,
                fingerprint.integration,
                fingerprint.hardEqualityHash,
                fingerprint.toleranceBandHash,
                fingerprint.liveBaselineHash,
                fingerprint.registryVersion
            )
        );
    }

    function _fingerprintHashCalldata(LoopV1Types.ExternalProtocolFingerprint calldata fingerprint)
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                fingerprint.integrationId,
                fingerprint.integration,
                fingerprint.hardEqualityHash,
                fingerprint.toleranceBandHash,
                fingerprint.liveBaselineHash,
                fingerprint.registryVersion
            )
        );
    }
}
