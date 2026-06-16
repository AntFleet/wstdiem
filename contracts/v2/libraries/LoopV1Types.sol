// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice WSTDIEM Phase 1 shared enums, constants, and ABI structs.
/// @dev Mirrors the SDK type definitions and PROTOCOL.md section 5.5 for PR-1 foundation imports.
library LoopV1Types {
    /// @dev PROTOCOL.md section 6.4 canonical EIP-712 primary types.
    enum PrimaryType {
        OPEN,
        REBALANCE,
        EXIT,
        FORCE_EXIT,
        REVOKE,
        AUTOMATION_EXEC
    }

    /// @dev PROTOCOL.md section 6.4 and THREAT-MODEL I-55.
    enum ExecutionKind {
        OWNER_DIRECT,
        KEEPER_PERMISSIONLESS,
        OPERATOR_RECOVERY
    }

    /// @dev PROTOCOL.md section 6.5 four-value Phase 1 MEV posture.
    enum MevProtectionMode {
        PUBLIC,
        PRIVATE_BUILDER,
        SEQUENCER_DIRECT_FAILOPEN,
        SEALED_AUCTION
    }

    /// @dev PROTOCOL.md section 7 risk-source status enum.
    enum SourceStatus {
        FRESH,
        STALE,
        MISSING,
        DEGRADED,
        NOT_CONFIGURED,
        OUTSIDE_DEVIATION
    }

    /// @dev EmergencyGuardian incident enum, PROTOCOL.md section 5.1.
    enum IncidentState {
        NONE,
        INVESTIGATING,
        MITIGATING,
        RESOLVED
    }

    /// @dev Exact bit positions from PROTOCOL.md section 7.1 and the SDK type definitions A5.
    enum StateBit {
        AUDIT_GATE_CLOSED,
        CONFIG_INTEGRITY_FAILURE,
        PAUSE_OPEN_INCREASE,
        ORACLE_DEGRADED,
        CURVE_LIQUIDITY_INSUFFICIENT,
        FLASH_LIQUIDITY_UNAVAILABLE,
        MORPHO_OWNER_EVIDENCE_MISSING,
        SEQUENCER_DOWN_OR_GRACE,
        INCIDENT_INVESTIGATING,
        INCIDENT_MITIGATING,
        VAULT_EVIDENCE_MISSING
    }

    uint16 internal constant KNOWN_STATE_MASK = uint16((1 << 11) - 1);

    uint8 internal constant RISK_LOOSE_SLIPPAGE = 1 << 0;
    uint8 internal constant RISK_STALE_ORACLE_OVERRIDE = 1 << 1;
    uint8 internal constant RISK_INSUFFICIENT_CURVE_DEPTH = 1 << 2;
    uint8 internal constant RISK_SEQUENCER_DOWN_OVERRIDE = 1 << 3;
    uint8 internal constant RISK_VAULT_EVIDENCE_OVERRIDE = 1 << 4;
    uint8 internal constant RISK_CRITICAL_OVERRIDE_MASK = RISK_STALE_ORACLE_OVERRIDE | RISK_INSUFFICIENT_CURVE_DEPTH
        | RISK_SEQUENCER_DOWN_OVERRIDE | RISK_VAULT_EVIDENCE_OVERRIDE;

    uint8 internal constant MEV_PUBLIC_MEMPOOL_OPT_IN = 1 << 0;
    uint8 internal constant MEV_SEQUENCER_DIRECT_FALLBACK_OPT_IN = 1 << 1;
    uint8 internal constant MEV_BUILDER_KEY_OUTAGE_OPT_IN = 1 << 2;

    // PB2-fix-2 (2026-06-12): TX_ARMED_*_SLOT constants removed — PB1.3 introduced the unified `actionContext`
    // slot set owned by LoopAuthorization which supersedes the per-action arming slots from the original PR-1
    // design. TX_REENTRY_GUARD_SLOT remains in use by LoopAuthorization.executeMorpho.
    bytes32 internal constant TX_REENTRY_GUARD_SLOT = keccak256("wstdiem.tx.reentry");

    bytes32 internal constant SOURCE_MORPHO_POSITION = keccak256("wstdiem.source.morpho-position");
    bytes32 internal constant SOURCE_VAULT_NAV = keccak256("wstdiem.source.vault-nav");
    bytes32 internal constant SOURCE_CHAINLINK_FEED = keccak256("wstdiem.source.chainlink-feed");
    bytes32 internal constant SOURCE_CURVE_QUOTE = keccak256("wstdiem.source.curve-quote");
    bytes32 internal constant SOURCE_SEQUENCER_UPTIME = keccak256("wstdiem.source.sequencer-uptime");
    bytes32 internal constant SOURCE_HARVEST_EVENT = keccak256("wstdiem.source.harvest-event");
    bytes32 internal constant SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT =
        keccak256("wstdiem.source.external-protocol-fingerprint");

    struct MorphoMarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    struct FeeCaps {
        uint256 flashFeeCap;
        uint256 protocolFeeCap;
        uint256 automationFeeCap;
    }

    struct EvidenceSource {
        bytes32 sourceId;
        address sourceAddress;
        SourceStatus status;
        uint256 lastUpdateBlock;
        bytes32 valueHash;
    }

    struct ActionEvidence {
        bytes32 actionId;
        bytes32 evidenceSetId;
        address owner;
        bytes32 market;
        uint256 blockNumber;
        uint16 stateBitmap;
        EvidenceSource[] sources;
    }

    struct ExternalProtocolFingerprint {
        bytes32 integrationId;
        address integration;
        bytes32 fingerprintHash;
        bytes32 hardEqualityHash;
        bytes32 toleranceBandHash;
        bytes32 liveBaselineHash;
        uint256 registryVersion;
    }

    struct ValidationResult {
        address owner;
        bytes32 market;
        uint64 policyId;
        uint8 primaryType;
        uint16 stateBitmap;
        bool highRisk;
    }

    struct LoopActionResult {
        uint256 collateralWstDiem;
        uint256 borrowedDiem;
        uint256 healthFactorWad;
        bool succeeded;
    }
}
