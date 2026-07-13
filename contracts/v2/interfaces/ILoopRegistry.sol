// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "../libraries/LoopV1Types.sol";

/// @notice Storage-only Phase 1 registry interface.
/// @dev PR-1 includes setters for storage scaffolding; timelock/role policy lands in PR-6.
interface ILoopRegistry {
    struct BatchOp {
        uint8 op;
        bytes data;
    }

    struct SpenderCheck {
        address spender;
        bytes32 runtimeCodeHash;
        uint8 proxyKind;
        bytes4 implSelector;
        address expectedImpl;
    }

    function registryVersion() external view returns (uint256);
    function registryMerkleRoot() external view returns (bytes32);
    function supportedMarket(bytes32 market) external view returns (bool);
    function marketParams(bytes32 market) external view returns (LoopV1Types.MorphoMarketParams memory);
    function executorFor(uint8 primaryType) external view returns (address);
    function loopAuthorization() external view returns (address);
    function loopForceExitAuthorizer() external view returns (address);
    function allowedSpender(uint8 primaryType, address token, address spender)
        external
        view
        returns (SpenderCheck memory);
    function canonicalSource(bytes32 market, bytes32 sourceId) external view returns (address sourceAddress);
    function requiredEvidenceSourceSet(uint8 primaryType) external view returns (bytes32[] memory sourceIds);
    function externalFingerprint(bytes32 integrationId)
        external
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory);
    function pendingExternalFingerprint(bytes32 integrationId)
        external
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory fingerprint, uint256 effectiveBlock);
    function preimageDisplayGuaranteedWallet(address wallet) external view returns (bool);
    function anchorSubmitter() external view returns (address);
    function indexerSigningKey() external view returns (address);
    function emergencyGuardian() external view returns (address);
    function governanceRole() external view returns (address);
    function anchorCadenceBlocks() external view returns (uint64);
    function permissionlessCallerAllowed(address caller) external view returns (bool);
    function providerFamily(bytes32 rpcEndpointId) external view returns (bytes32);
    function sourceTaxonomy() external pure returns (bytes32[] memory sourceIds);

    // ---- PB1.1 patch: PR-5 getter stubs called by PR-2 LoopAuthorization. PR-1 returns
    // safe defaults (0 / false / address(0)); PR-5 fills the bodies with real config.

    /// @notice I-71 / Lock E. PR-2 calls this as the first step of every action call frame.
    function validateExternalConfig(bytes32 market, uint8 primaryType) external view returns (bool valid);

    /// @notice I-69 harvest cooling. PR-2 reads to enforce G-PM-1 HarvestConvergencePending.
    function lastHarvestBlock(bytes32 market) external view returns (uint256);
    function harvestCoolingBlocks() external view returns (uint256);

    /// @notice NF-8 OPERATOR_RECOVERY engagement predicate inputs (forceExitBufferBps defaults
    ///   to 0 per Phase B fallback; operatorRecoveryNBlocks defaults to ~1_296_000 = 30 days × 2s blocks).
    function operatorRecoveryRole(address candidate) external view returns (bool);
    function operatorRecoveryNBlocks() external view returns (uint256);
    function forceExitBufferBps() external view returns (uint16);
    function ownerLastSignedActionBlock(address owner) external view returns (uint256);

    /// @notice I-78 per-source freshness threshold (seconds since lastUpdateBlock).
    ///   PR-5 fills per-feed heartbeat table; PR-1 stub returns 0 meaning "no extra constraint."
    function sourceFreshnessThreshold(bytes32 sourceId) external view returns (uint256);

    /// @notice PR-5 risk oracle adapter pointer used by PR-2 OPERATOR_RECOVERY strict
    ///   debt-reducing check and by §7.1 matrix evaluation.
    function loopRiskOracleAdapter() external view returns (address);
    function dustBoundFor(bytes32 market, uint256 inputAmount) external view returns (uint256);

    /// @notice I-72 throttle config + force-exit deadline cap. PR-2 uses these to enforce
    ///   AutomationAttemptThrottled and ForceExitDeadlineExceedsBound per A3.
    function maxFailedAttemptsPerWindow() external view returns (uint8);
    function attemptThrottleWindowBlocks() external view returns (uint16);
    function forceExitMaxDeadlineSeconds() external view returns (uint256);
    function maxPolicyExpiryBlocks(uint8 policyClass) external view returns (uint256);
    function maxDigestDeadline(uint8 primaryType) external view returns (uint256);

    /// @notice Per-block per-action revocation grace (defaults to 5 blocks per PROTOCOL.md §6.4).
    function revocationGraceBlocks() external view returns (uint256);

    /// @notice PB1.2: Morpho Blue address. PR-2 LoopAuthorization.executeMorpho forwards
    ///   validated calldata to this address. PR-5 sets the canonical Base mainnet Morpho
    ///   address (0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb). Defaults to address(0)
    ///   in PR-1 stub; PR-2 tests deploy a mock Morpho and set this via the registry setter
    ///   (also added in PB1.2).
    function morpho() external view returns (address);
    function curvePool(bytes32 market) external view returns (address);
    function uniswapV3FlashPool(bytes32 market) external view returns (address);
    function wstDiemVault(bytes32 market) external view returns (address);
    function navBaseline(bytes32 market) external view returns (uint256);
    function uniswapV3Factory(bytes32 market) external view returns (address);
    function uniswapV3FlashFeeTier(bytes32 market) external view returns (uint24);
    function minThirdPartyRepayDiem() external view returns (uint256);
    function maxRpcBlockLagBlocks() external view returns (uint256);
    function harvestAuthority() external view returns (address);
    function recordHarvest(bytes32 market, uint256 blockNumber, bytes32 topic0) external;
    function recordOwnerActivity(address owner) external;
    function setHarvestAuthority(address nextAuthority) external;
    function setHarvestCoolingBlocks(uint256 nextCoolingBlocks) external;
    function setOperatorRecoveryRole(address candidate, bool allowed) external;
    function setOperatorRecoveryNBlocks(uint256 nextBlocks) external;
    function setForceExitBufferBps(uint16 nextBps) external;
    function setSourceFreshnessThreshold(bytes32 sourceId, uint256 thresholdSeconds) external;
    function setMaxFailedAttemptsPerWindow(uint8 nextMax) external;
    function setAttemptThrottleWindowBlocks(uint16 nextWindow) external;
    function setMinThirdPartyRepayDiem(uint256 nextMin) external;
    function setMaxRpcBlockLagBlocks(uint256 nextLag) external;
    function setForceExitMaxDeadlineSeconds(uint256 nextSeconds) external;
    function setMaxPolicyExpiryBlocks(uint8 policyClass, uint256 nextBlocks) external;
    function setMaxDigestDeadline(uint8 primaryType, uint256 nextSeconds) external;
    function setRevocationGraceBlocks(uint256 nextBlocks) external;
    function setDustBoundBps(uint16 nextBps) external;
    function setDustBoundAbsoluteCap(uint256 nextCap) external;
    function setDustBoundFloor(uint256 nextFloor) external;
    function setMorpho(address nextMorpho) external;
    function setCurvePool(bytes32 market, address nextPool) external;
    function setUniswapV3FlashPool(bytes32 market, address nextPool) external;
    function setWstDiemVault(bytes32 market, address nextVault) external;
    function setUniswapV3Factory(bytes32 market, address nextFactory) external;
    function setUniswapV3FlashFeeTier(bytes32 market, uint24 nextFeeTier) external;
    function setLoopRiskOracleAdapter(address nextAdapter) external;
    function batchUpdate(BatchOp[] calldata ops, uint256 nextVersion, bytes32 nextRoot) external;

    function setRegistryVersion(uint256 nextVersion) external;
    function setRegistryMerkleRoot(bytes32 nextRoot) external;
    function setIndexerSigningKey(address nextKey) external;
    function applyIndexerSigningKey() external;
    function setAnchorSubmitter(address nextSubmitter) external;
    function applyAnchorSubmitter() external;
    function setEmergencyGuardian(address nextGuardian) external;
    function applyEmergencyGuardian() external;
    function setGovernanceRole(address nextGovernance) external;
    function applyGovernanceRole() external;
    function setSpendAllowlistEnforced(bool enforced) external;
    function spendAllowlistEnforced() external view returns (bool);
    function pendingCriticalRole(uint8 roleId) external view returns (address next, uint256 effectiveBlock);
    function setAnchorCadenceBlocks(uint64 nextCadenceBlocks) external;
    function setLoopAuthorization(address nextAuthorization) external;
    function setLoopForceExitAuthorizer(address nextAuthorizer) external;
    function setExecutorFor(uint8 primaryType, address executor) external;
    function setSupportedMarket(bytes32 market, bool supported) external;
    function setMarketParams(bytes32 market, LoopV1Types.MorphoMarketParams calldata params) external;
    function setAllowedSpender(uint8 primaryType, address token, address spender, SpenderCheck calldata check) external;
    function setCanonicalSource(bytes32 market, bytes32 sourceId, address sourceAddress) external;
    function setRequiredEvidenceSourceSet(uint8 primaryType, bytes32[] calldata sourceIds) external;
    function setPreimageDisplayGuaranteedWallet(address wallet, bool allowed) external;
    function setPermissionlessCallerAllowed(address caller, bool allowed) external;
    function setProviderFamily(bytes32 rpcEndpointId, bytes32 family) external;
    function updateExternalFingerprint(
        bytes32 integrationId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) external;
    function queueExternalFingerprintUpdate(
        bytes32 integrationId,
        LoopV1Types.ExternalProtocolFingerprint calldata fingerprint
    ) external;
    function applyExternalFingerprintUpdate(bytes32 integrationId) external;
}
