// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LoopV1Types} from "./LoopV1Types.sol";

/// @notice WSTDIEM Phase 1 EIP-712 structs and canonical typehash constants.
/// @dev Type strings mirror the SDK type definitions and PROTOCOL.md section 6.4 exactly.
library LoopV1EIP712 {
    struct DomainSeparator {
        string name;
        string version;
        uint256 chainId;
        address verifyingContract;
        bytes32 salt;
    }

    struct ActionIdentity {
        address owner;
        uint256 chainId;
        address verifyingContract;
        bytes32 market;
        address executor;
        uint256 registryVersion;
        bytes32 registryMerkleRoot;
        uint64 policyId;
        uint248 nonceSlot;
        uint8 nonceBit;
    }

    struct Freshness {
        uint256 deadline;
        uint256 quoteBlockNumber;
        uint256 maxQuoteAgeBlocks;
        uint16 maxQuoteDeviationBps;
    }

    struct DigestHashes {
        bytes32 quoteHash;
        bytes32 spenderListHash;
        bytes32 allowanceScheduleHash;
        bytes32 feeCapHash;
        bytes32 evidenceBundleHash;
    }

    struct OpenBounds {
        uint256 minWstDiemReceived;
        uint256 minBorrowedDiem;
        uint256 maxBorrowedDiem;
        uint16 maxSlippageBps;
        uint16 maxPriceImpactBps;
        uint16 maxLeverageBps;
        uint256 minHealthFactor;
        uint16 minLiquidationDistanceBps;
        uint16 maxMorphoUtilizationImpactBps;
        LoopV1Types.FeeCaps feeCaps;
    }

    struct RebalanceBounds {
        uint16 targetLeverageBps;
        uint16 targetLeverageToleranceBps;
        uint256 minPostHealthFactor;
        uint16 minLiquidationDistanceBps;
        uint256 maxDebtIncrease;
        uint256 maxCollateralSold;
        uint16 maxSlippageBps;
        uint16 maxCurvePositionShareBps;
        uint16 maxMorphoUtilizationImpactBps;
        LoopV1Types.FeeCaps feeCaps;
    }

    struct ExitBounds {
        uint256 minRepayment;
        uint256 maxCollateralSold;
        uint16 maxSlippageBps;
        uint16 maxCurvePositionShareBps;
        uint16 maxMorphoUtilizationImpactBps;
        LoopV1Types.FeeCaps feeCaps;
        bool repayOnly;
        bool acceptsThirdPartyRepay;
    }

    struct ForceExitBounds {
        uint256 minRepayment;
        uint256 maxCollateralSold;
        uint16 looseSlippageBps;
        uint256 looseFlashFeeCap;
        uint16 maxCurvePositionShareBps;
        uint8 acknowledgedRisks;
    }

    struct RevokeBounds {
        uint64 policyId;
        uint8 policyClass;
        uint256 effectiveBlock;
    }

    struct AutomationBounds {
        bytes32 triggerConditionHash;
        uint8 underlyingPrimaryType;
        bytes32 underlyingActionHash;
        bytes32 policyHash;
        bytes32 boundSubsetHash;
        uint256 notBeforeBlock;
        uint256 notAfterBlock;
    }

    struct Open {
        ActionIdentity identity;
        Freshness freshness;
        LoopV1Types.ExecutionKind executionKind;
        LoopV1Types.MevProtectionMode mevProtectionMode;
        uint8 mevWaiverBits;
        LoopV1Types.MorphoMarketParams marketParams;
        OpenBounds bounds;
        DigestHashes hashes;
    }

    struct Rebalance {
        ActionIdentity identity;
        Freshness freshness;
        LoopV1Types.ExecutionKind executionKind;
        LoopV1Types.MevProtectionMode mevProtectionMode;
        uint8 mevWaiverBits;
        LoopV1Types.MorphoMarketParams marketParams;
        RebalanceBounds bounds;
        DigestHashes hashes;
    }

    struct Exit {
        ActionIdentity identity;
        Freshness freshness;
        LoopV1Types.ExecutionKind executionKind;
        LoopV1Types.MevProtectionMode mevProtectionMode;
        uint8 mevWaiverBits;
        LoopV1Types.MorphoMarketParams marketParams;
        ExitBounds bounds;
        DigestHashes hashes;
    }

    struct ForceExit {
        ActionIdentity identity;
        Freshness freshness;
        LoopV1Types.ExecutionKind executionKind;
        LoopV1Types.MevProtectionMode mevProtectionMode;
        uint8 mevWaiverBits;
        LoopV1Types.MorphoMarketParams marketParams;
        ForceExitBounds bounds;
        DigestHashes hashes;
    }

    struct Revoke {
        ActionIdentity identity;
        Freshness freshness;
        LoopV1Types.ExecutionKind executionKind;
        RevokeBounds bounds;
        DigestHashes hashes;
    }

    struct AutomationExec {
        ActionIdentity identity;
        Freshness freshness;
        LoopV1Types.ExecutionKind executionKind;
        LoopV1Types.MevProtectionMode mevProtectionMode;
        uint8 mevWaiverBits;
        AutomationBounds bounds;
        DigestHashes hashes;
    }

    bytes32 internal constant DOMAIN_SEPARATOR_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 internal constant ACTION_IDENTITY_TYPEHASH = keccak256(
        "ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)"
    );
    bytes32 internal constant FRESHNESS_TYPEHASH = keccak256(
        "Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)"
    );
    bytes32 internal constant FEE_CAPS_TYPEHASH =
        keccak256("FeeCaps(uint256 flashFeeCap,uint256 protocolFeeCap,uint256 automationFeeCap)");
    bytes32 internal constant DIGEST_HASHES_TYPEHASH = keccak256(
        "DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)"
    );
    // Canonical MorphoMarketParams typehash. The action-level encodeType strings
    // reference this nested struct, so _hashMarketParams MUST prefix it (matching
    // viem's hashStruct(MorphoMarketParams)).
    bytes32 internal constant MORPHO_MARKET_PARAMS_TYPEHASH =
        keccak256("MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)");
    bytes32 internal constant EVIDENCE_SOURCE_TYPEHASH = keccak256(
        "EvidenceSource(bytes32 sourceId,address sourceAddress,uint8 status,uint256 lastUpdateBlock,bytes32 valueHash)"
    );
    bytes32 internal constant EVIDENCE_BUNDLE_TYPEHASH = keccak256(
        "ActionEvidence(bytes32 actionId,bytes32 evidenceSetId,address owner,bytes32 market,uint256 blockNumber,uint16 stateBitmap,bytes32 sourcesHash)"
    );
    bytes32 internal constant SPENDER_LIST_TYPEHASH = keccak256("SpenderList(bytes32 sortedTokenSpenderAllowanceHash)");
    bytes32 internal constant ALLOWANCE_SCHEDULE_TYPEHASH = keccak256("AllowanceSchedule(bytes32 sequentialDeltaHash)");
    bytes32 internal constant FEE_CAP_HASH_TYPEHASH =
        keccak256("FeeCapHash(uint256 flashFeeCap,uint256 protocolFeeCap,uint256 automationFeeCap)");
    bytes32 internal constant FAILURE_CONDITION_TYPEHASH = keccak256("FailureCondition(bytes32 previewOnlyHash)");
    bytes32 internal constant ARMING_CONTEXT_TYPEHASH = keccak256(
        "ArmingContext(uint256 chainId,address executor,bytes4 callbackSelector,uint8 primaryType,address owner,bytes32 market,uint256 registryVersion,address flashProvider,bytes32 routeId,bytes32 quoteHash,uint256 nonceSlot,uint8 nonceBit,uint256 deadline)"
    );

    bytes32 internal constant OPEN_BOUNDS_TYPEHASH = keccak256(
        "OpenBounds(uint256 minWstDiemReceived,uint256 minBorrowedDiem,uint256 maxBorrowedDiem,uint16 maxSlippageBps,uint16 maxPriceImpactBps,uint16 maxLeverageBps,uint256 minHealthFactor,uint16 minLiquidationDistanceBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)"
    );
    bytes32 internal constant REBALANCE_BOUNDS_TYPEHASH = keccak256(
        "RebalanceBounds(uint16 targetLeverageBps,uint16 targetLeverageToleranceBps,uint256 minPostHealthFactor,uint16 minLiquidationDistanceBps,uint256 maxDebtIncrease,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)"
    );
    bytes32 internal constant EXIT_BOUNDS_TYPEHASH = keccak256(
        "ExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash,bool repayOnly,bool acceptsThirdPartyRepay)"
    );
    bytes32 internal constant FORCE_EXIT_BOUNDS_TYPEHASH = keccak256(
        "ForceExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 looseSlippageBps,uint256 looseFlashFeeCap,uint16 maxCurvePositionShareBps,uint8 acknowledgedRisks)"
    );
    bytes32 internal constant REVOKE_BOUNDS_TYPEHASH =
        keccak256("RevokeBounds(uint64 policyId,uint8 policyClass,uint256 effectiveBlock)");
    bytes32 internal constant AUTOMATION_BOUNDS_TYPEHASH = keccak256(
        "AutomationBounds(bytes32 triggerConditionHash,uint8 underlyingPrimaryType,bytes32 underlyingActionHash,bytes32 policyHash,bytes32 boundSubsetHash,uint256 notBeforeBlock,uint256 notAfterBlock)"
    );

    // Canonical EIP-712 encodeType strings: primary type followed by the
    // definitions of ALL referenced structs, sorted alphabetically by type name.
    // Derived via viem's encodeType (the EIP-712 reference implementation) so a
    // wallet's eth_signTypedData_v4 reproduces hashOpen/... byte-for-byte.
    bytes32 internal constant OPEN_TYPEHASH = keccak256(
        "Open(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,OpenBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)OpenBounds(uint256 minWstDiemReceived,uint256 minBorrowedDiem,uint256 maxBorrowedDiem,uint16 maxSlippageBps,uint16 maxPriceImpactBps,uint16 maxLeverageBps,uint256 minHealthFactor,uint16 minLiquidationDistanceBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)"
    );
    bytes32 internal constant REBALANCE_TYPEHASH = keccak256(
        "Rebalance(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,RebalanceBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)RebalanceBounds(uint16 targetLeverageBps,uint16 targetLeverageToleranceBps,uint256 minPostHealthFactor,uint16 minLiquidationDistanceBps,uint256 maxDebtIncrease,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash)"
    );
    bytes32 internal constant EXIT_TYPEHASH = keccak256(
        "Exit(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,ExitBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)ExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 maxSlippageBps,uint16 maxCurvePositionShareBps,uint16 maxMorphoUtilizationImpactBps,bytes32 feeCapsHash,bool repayOnly,bool acceptsThirdPartyRepay)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)"
    );
    bytes32 internal constant FORCE_EXIT_TYPEHASH = keccak256(
        "ForceExit(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,MorphoMarketParams marketParams,ForceExitBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)ForceExitBounds(uint256 minRepayment,uint256 maxCollateralSold,uint16 looseSlippageBps,uint256 looseFlashFeeCap,uint16 maxCurvePositionShareBps,uint8 acknowledgedRisks)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)MorphoMarketParams(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)"
    );
    bytes32 internal constant REVOKE_TYPEHASH = keccak256(
        "Revoke(ActionIdentity identity,Freshness freshness,uint8 executionKind,RevokeBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)RevokeBounds(uint64 policyId,uint8 policyClass,uint256 effectiveBlock)"
    );
    bytes32 internal constant AUTOMATION_EXEC_TYPEHASH = keccak256(
        "AutomationExec(ActionIdentity identity,Freshness freshness,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,AutomationBounds bounds,DigestHashes hashes)ActionIdentity(address owner,uint256 chainId,address verifyingContract,bytes32 market,address executor,uint256 registryVersion,bytes32 registryMerkleRoot,uint64 policyId,uint248 nonceSlot,uint8 nonceBit)AutomationBounds(bytes32 triggerConditionHash,uint8 underlyingPrimaryType,bytes32 underlyingActionHash,bytes32 policyHash,bytes32 boundSubsetHash,uint256 notBeforeBlock,uint256 notAfterBlock)DigestHashes(bytes32 quoteHash,bytes32 spenderListHash,bytes32 allowanceScheduleHash,bytes32 feeCapHash,bytes32 evidenceBundleHash)Freshness(uint256 deadline,uint256 quoteBlockNumber,uint256 maxQuoteAgeBlocks,uint16 maxQuoteDeviationBps)"
    );

    /// @notice PB1.2: I-66 EIP-1271 preimage attestation typehash per the SDK type definitions NF-15
    ///   encoding rule. Wallet computes keccak256(abi.encode(PREIMAGE_PROOF_TYPEHASH, ...fields...))
    ///   and returns the bytes32 result; LoopAuthorization.validateHighRiskPolicy recomputes from
    ///   its own arguments and asserts equality.
    bytes32 internal constant PREIMAGE_PROOF_TYPEHASH = keccak256(
        "Eip1271PreimageDisplayProof(address owner,uint8 primaryType,uint8 executionKind,uint8 mevProtectionMode,uint8 mevWaiverBits,uint8 acknowledgedRisks,uint8 policyClass,bytes32 market,uint256 registryVersion,uint248 nonceSlot,uint8 nonceBit,uint256 maxCollateralSold,uint256 maxDebtIncrease,uint256 deadline,address verifyingContract)"
    );
}
