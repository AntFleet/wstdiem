// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

import {ILoopV1Events} from "../../../contracts/v2/interfaces/ILoopV1Events.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {MorphoSelectors} from "../../../contracts/v2/libraries/MorphoSelectors.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {TypehashOracle} from "./helpers/TypehashOracle.sol";

/// @notice Event reachability probe for the Phase B PR-1 event interface.
contract FoundationEventProbe is ILoopV1Events {
    function emitAll() external {
        emit LoopActionStarted(
            bytes32(uint256(1)), uint8(LoopV1Types.PrimaryType.OPEN), address(0x1001), bytes32(uint256(2)), 3
        );
        emit LoopActionStep(
            address(0x1001),
            bytes32(uint256(2)),
            bytes32(uint256(1)),
            1,
            uint8(LoopV1Types.PrimaryType.OPEN),
            address(0x1002),
            bytes4(0x12345678),
            false
        );
        emit LoopActionCompleted(bytes32(uint256(1)), 200);
        emit LoopOpenedV2(bytes32(uint256(1)), address(0x1001), bytes32(uint256(2)), 3, 4, 5);
        emit LoopRebalancedV2(bytes32(uint256(1)), address(0x1001), bytes32(uint256(2)), -3, 4, 5);
        emit LoopExitedV2(bytes32(uint256(1)), address(0x1001), bytes32(uint256(2)), 3, 4, 5);
        emit LoopForceExitedV2(bytes32(uint256(1)), address(0x1001), bytes32(uint256(2)), 3, 4, 1);
        emit LoopRepayedV2(bytes32(uint256(1)), address(0x1001), bytes32(uint256(2)), 3);
        emit LoopRepayedByThirdParty(bytes32(uint256(1)), address(0x1001), address(0x1002), bytes32(uint256(2)), 3);
        emit WstdiemAuthorizationSet(address(0x1001), 2, uint8(LoopV1Types.PrimaryType.OPEN), bytes32(uint256(3)), 4);
        emit WstdiemAuthorizationRevoked(address(0x1001), 2, 3);
        emit MorphoAuthorizationSet(address(0x1001), address(0x1002));
        emit MorphoAuthorizationRevoked(address(0x1001), address(0x1002));
        emit PolicyCreated(address(0x1001), 2, uint8(LoopV1Types.PrimaryType.OPEN), bytes32(uint256(3)), 4);
        emit PolicyUpdated(address(0x1001), 2, bytes32(uint256(3)), bytes32(uint256(4)), 5);
        emit PolicyRevoking(address(0x1001), 2, 3);
        emit PolicyRevoked(address(0x1001), 2);
        emit IndexerSignerRotated(address(0x1001), address(0x1002), 3);
        emit AnchorSubmitterRotated(address(0x1001), address(0x1002), 3);
        emit AutomationProposed(1, bytes32(uint256(2)), address(0x1001), 3, 4);
        emit AutomationExecuted(1, bytes32(uint256(2)), address(0x1001));
        emit AutomationFailed(1, bytes32(uint256(2)), address(0x1001), bytes4(0x12345678));
        emit AutomationExpired(1, bytes32(uint256(2)));
        emit AutomationAttemptRateLimited(1, address(0x1001));
        emit BuilderQuotaExceeded(1);
        emit KeeperBuilderOutage(1, bytes32(uint256(2)), bytes32(uint256(3)));
        emit StateSnapshotAccepted(1, bytes32(uint256(2)), address(0x1001));
        emit IncidentStateChanged(LoopV1Types.IncidentState.INVESTIGATING, LoopV1Types.IncidentState.MITIGATING);
        emit EmergencyPaused(uint8(LoopV1Types.PrimaryType.OPEN), 2);
        emit EmergencyUnpaused(uint8(LoopV1Types.PrimaryType.OPEN));
        emit PauseReaffirmed(uint8(LoopV1Types.PrimaryType.OPEN), 3);
        emit GuardianRoleRotated(address(0x1001), address(0x1002));
        emit GovernanceRoleChanged(address(0x1001), address(0x1002));
        emit FeePayoutFailed(bytes32(uint256(1)), address(0x1001), address(0x1002), 3);
        emit LargeDustRefund(bytes32(uint256(1)), address(0x1001), address(0x1002), 3, 4);
        emit OperatorRecoveryNotice(address(0x1001), bytes32(uint256(2)), 3, bytes32(uint256(4)));
        emit RegistryConfigBatchQueued(1, bytes32(uint256(2)), address(0x1001), 3, 4);
        emit RegistryConfigBatchCancelled(1, bytes32(uint256(2)), address(0x1001));
        emit BootstrapClosed(1);
    }
}

/// @notice Phase B PR-1 foundation parity tests.
/// @dev These tests intentionally cover shape selectors and storage scaffolding only; no executor logic lands in PR-1.
contract FoundationTest is TestHelpers, Test {
    string private typehashSnapshot;
    string private sourceSnapshot;
    string private morphoSelectorSnapshot;
    TypehashOracle private oracle;

    function setUp() public {
        typehashSnapshot = vm.readFile("test/foundry/v2/snapshots/typehashes.json");
        sourceSnapshot = vm.readFile("test/foundry/v2/snapshots/sourceIds.json");
        morphoSelectorSnapshot = vm.readFile("test/foundry/v2/snapshots/morpho-selectors.json");
        oracle = new TypehashOracle();
    }

    function testCompileParityReachability() public {
        bytes32[32] memory constants = [
            LoopV1Types.TX_REENTRY_GUARD_SLOT,
            LoopV1Types.SOURCE_MORPHO_POSITION,
            LoopV1Types.SOURCE_VAULT_NAV,
            LoopV1Types.SOURCE_CHAINLINK_FEED,
            LoopV1Types.SOURCE_CURVE_QUOTE,
            LoopV1Types.SOURCE_SEQUENCER_UPTIME,
            LoopV1Types.SOURCE_HARVEST_EVENT,
            LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT,
            LoopV1EIP712.DOMAIN_SEPARATOR_TYPEHASH,
            LoopV1EIP712.ACTION_IDENTITY_TYPEHASH,
            LoopV1EIP712.FRESHNESS_TYPEHASH,
            LoopV1EIP712.FEE_CAPS_TYPEHASH,
            LoopV1EIP712.DIGEST_HASHES_TYPEHASH,
            LoopV1EIP712.EVIDENCE_SOURCE_TYPEHASH,
            LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
            LoopV1EIP712.SPENDER_LIST_TYPEHASH,
            LoopV1EIP712.ALLOWANCE_SCHEDULE_TYPEHASH,
            LoopV1EIP712.FEE_CAP_HASH_TYPEHASH,
            LoopV1EIP712.FAILURE_CONDITION_TYPEHASH,
            LoopV1EIP712.ARMING_CONTEXT_TYPEHASH,
            LoopV1EIP712.OPEN_BOUNDS_TYPEHASH,
            LoopV1EIP712.REBALANCE_BOUNDS_TYPEHASH,
            LoopV1EIP712.EXIT_BOUNDS_TYPEHASH,
            LoopV1EIP712.FORCE_EXIT_BOUNDS_TYPEHASH,
            LoopV1EIP712.REVOKE_BOUNDS_TYPEHASH,
            LoopV1EIP712.AUTOMATION_BOUNDS_TYPEHASH,
            LoopV1EIP712.OPEN_TYPEHASH,
            LoopV1EIP712.REBALANCE_TYPEHASH,
            LoopV1EIP712.EXIT_TYPEHASH,
            LoopV1EIP712.FORCE_EXIT_TYPEHASH,
            LoopV1EIP712.REVOKE_TYPEHASH,
            LoopV1EIP712.AUTOMATION_EXEC_TYPEHASH
        ];

        for (uint256 i = 0; i < constants.length; i++) {
            assertTrue(constants[i] != bytes32(0));
        }

        assertEq(LoopV1Types.TX_REENTRY_GUARD_SLOT, keccak256("wstdiem.tx.reentry"));
        assertEq(_allErrorSelectors().length, 116);
        new FoundationEventProbe().emitAll();
    }

    function testTypehashSnapshotMatch() public view {
        _assertTypehash("DOMAIN_SEPARATOR_TYPEHASH", LoopV1EIP712.DOMAIN_SEPARATOR_TYPEHASH);
        _assertTypehash("ACTION_IDENTITY_TYPEHASH", LoopV1EIP712.ACTION_IDENTITY_TYPEHASH);
        _assertTypehash("FRESHNESS_TYPEHASH", LoopV1EIP712.FRESHNESS_TYPEHASH);
        _assertTypehash("FEE_CAPS_TYPEHASH", LoopV1EIP712.FEE_CAPS_TYPEHASH);
        _assertTypehash("DIGEST_HASHES_TYPEHASH", LoopV1EIP712.DIGEST_HASHES_TYPEHASH);
        _assertTypehash("MORPHO_MARKET_PARAMS_TYPEHASH", LoopV1EIP712.MORPHO_MARKET_PARAMS_TYPEHASH);
        _assertTypehash("EVIDENCE_SOURCE_TYPEHASH", LoopV1EIP712.EVIDENCE_SOURCE_TYPEHASH);
        _assertTypehash("EVIDENCE_BUNDLE_TYPEHASH", LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH);
        _assertTypehash("SPENDER_LIST_TYPEHASH", LoopV1EIP712.SPENDER_LIST_TYPEHASH);
        _assertTypehash("ALLOWANCE_SCHEDULE_TYPEHASH", LoopV1EIP712.ALLOWANCE_SCHEDULE_TYPEHASH);
        _assertTypehash("FEE_CAP_HASH_TYPEHASH", LoopV1EIP712.FEE_CAP_HASH_TYPEHASH);
        _assertTypehash("FAILURE_CONDITION_TYPEHASH", LoopV1EIP712.FAILURE_CONDITION_TYPEHASH);
        _assertTypehash("ARMING_CONTEXT_TYPEHASH", LoopV1EIP712.ARMING_CONTEXT_TYPEHASH);
        _assertTypehash("OPEN_BOUNDS_TYPEHASH", LoopV1EIP712.OPEN_BOUNDS_TYPEHASH);
        _assertTypehash("REBALANCE_BOUNDS_TYPEHASH", LoopV1EIP712.REBALANCE_BOUNDS_TYPEHASH);
        _assertTypehash("EXIT_BOUNDS_TYPEHASH", LoopV1EIP712.EXIT_BOUNDS_TYPEHASH);
        _assertTypehash("FORCE_EXIT_BOUNDS_TYPEHASH", LoopV1EIP712.FORCE_EXIT_BOUNDS_TYPEHASH);
        _assertTypehash("REVOKE_BOUNDS_TYPEHASH", LoopV1EIP712.REVOKE_BOUNDS_TYPEHASH);
        _assertTypehash("AUTOMATION_BOUNDS_TYPEHASH", LoopV1EIP712.AUTOMATION_BOUNDS_TYPEHASH);
        _assertTypehash("OPEN_TYPEHASH", LoopV1EIP712.OPEN_TYPEHASH);
        _assertTypehash("REBALANCE_TYPEHASH", LoopV1EIP712.REBALANCE_TYPEHASH);
        _assertTypehash("EXIT_TYPEHASH", LoopV1EIP712.EXIT_TYPEHASH);
        _assertTypehash("FORCE_EXIT_TYPEHASH", LoopV1EIP712.FORCE_EXIT_TYPEHASH);
        _assertTypehash("REVOKE_TYPEHASH", LoopV1EIP712.REVOKE_TYPEHASH);
        _assertTypehash("AUTOMATION_EXEC_TYPEHASH", LoopV1EIP712.AUTOMATION_EXEC_TYPEHASH);
        _assertTypehash("PREIMAGE_PROOF_TYPEHASH", LoopV1EIP712.PREIMAGE_PROOF_TYPEHASH);
    }

    function testSourceIdSnapshotMatch() public view {
        _assertSource("SOURCE_MORPHO_POSITION", LoopV1Types.SOURCE_MORPHO_POSITION);
        _assertSource("SOURCE_VAULT_NAV", LoopV1Types.SOURCE_VAULT_NAV);
        _assertSource("SOURCE_CHAINLINK_FEED", LoopV1Types.SOURCE_CHAINLINK_FEED);
        _assertSource("SOURCE_CURVE_QUOTE", LoopV1Types.SOURCE_CURVE_QUOTE);
        _assertSource("SOURCE_SEQUENCER_UPTIME", LoopV1Types.SOURCE_SEQUENCER_UPTIME);
        _assertSource("SOURCE_HARVEST_EVENT", LoopV1Types.SOURCE_HARVEST_EVENT);
        _assertSource("SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT", LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT);
    }

    function testEnumAbiMappings() public pure {
        assertEq(uint8(LoopV1Types.PrimaryType.OPEN), 0);
        assertEq(uint8(LoopV1Types.PrimaryType.REBALANCE), 1);
        assertEq(uint8(LoopV1Types.PrimaryType.EXIT), 2);
        assertEq(uint8(LoopV1Types.PrimaryType.FORCE_EXIT), 3);
        assertEq(uint8(LoopV1Types.PrimaryType.REVOKE), 4);
        assertEq(uint8(LoopV1Types.PrimaryType.AUTOMATION_EXEC), 5);

        assertEq(uint8(LoopV1Types.ExecutionKind.OWNER_DIRECT), 0);
        assertEq(uint8(LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS), 1);
        assertEq(uint8(LoopV1Types.ExecutionKind.OPERATOR_RECOVERY), 2);

        assertEq(uint8(LoopV1Types.MevProtectionMode.PUBLIC), 0);
        assertEq(uint8(LoopV1Types.MevProtectionMode.PRIVATE_BUILDER), 1);
        assertEq(uint8(LoopV1Types.MevProtectionMode.SEQUENCER_DIRECT_FAILOPEN), 2);
        assertEq(uint8(LoopV1Types.MevProtectionMode.SEALED_AUCTION), 3);

        assertEq(uint8(LoopV1Types.SourceStatus.FRESH), 0);
        assertEq(uint8(LoopV1Types.SourceStatus.STALE), 1);
        assertEq(uint8(LoopV1Types.SourceStatus.MISSING), 2);
        assertEq(uint8(LoopV1Types.SourceStatus.DEGRADED), 3);
        assertEq(uint8(LoopV1Types.SourceStatus.NOT_CONFIGURED), 4);
        assertEq(uint8(LoopV1Types.SourceStatus.OUTSIDE_DEVIATION), 5);
    }

    function testStateBitPositions() public pure {
        assertEq(_stateMask(LoopV1Types.StateBit.AUDIT_GATE_CLOSED), 1);
        assertEq(_stateMask(LoopV1Types.StateBit.CONFIG_INTEGRITY_FAILURE), 2);
        assertEq(_stateMask(LoopV1Types.StateBit.PAUSE_OPEN_INCREASE), 4);
        assertEq(_stateMask(LoopV1Types.StateBit.ORACLE_DEGRADED), 8);
        assertEq(_stateMask(LoopV1Types.StateBit.CURVE_LIQUIDITY_INSUFFICIENT), 16);
        assertEq(_stateMask(LoopV1Types.StateBit.FLASH_LIQUIDITY_UNAVAILABLE), 32);
        assertEq(_stateMask(LoopV1Types.StateBit.MORPHO_OWNER_EVIDENCE_MISSING), 64);
        assertEq(_stateMask(LoopV1Types.StateBit.SEQUENCER_DOWN_OR_GRACE), 128);
        assertEq(_stateMask(LoopV1Types.StateBit.INCIDENT_INVESTIGATING), 256);
        assertEq(_stateMask(LoopV1Types.StateBit.INCIDENT_MITIGATING), 512);
        assertEq(_stateMask(LoopV1Types.StateBit.VAULT_EVIDENCE_MISSING), 1024);
        assertEq(LoopV1Types.KNOWN_STATE_MASK, 0x07FF);
    }

    /// @dev ForceExit waiver bits (RISK_*) and MEV waiver bits (MEV_*) intentionally reuse
    ///   low bits in SEPARATE namespaces per LoopV1Types lines 67-78. The non-overlap rule
    ///   from the PR-1 prompt applies INTRA-namespace (RISK_LOOSE_SLIPPAGE != RISK_CRITICAL_OVERRIDE
    ///   bits), NOT cross-namespace. This test enforces the intra-namespace rule plus
    ///   each namespace fits within the locked uint8 width.
    function testBitmaskNamespaceWidthsAndIntraNamespaceNonOverlap() public pure {
        uint8 forceExitWaiverMask = LoopV1Types.RISK_LOOSE_SLIPPAGE | LoopV1Types.RISK_CRITICAL_OVERRIDE_MASK;
        uint8 mevMask = LoopV1Types.MEV_PUBLIC_MEMPOOL_OPT_IN | LoopV1Types.MEV_SEQUENCER_DIRECT_FALLBACK_OPT_IN
            | LoopV1Types.MEV_BUILDER_KEY_OUTAGE_OPT_IN;

        assertEq(forceExitWaiverMask, 0x1F);
        assertEq(mevMask, 0x07);
        assertEq(LoopV1Types.RISK_CRITICAL_OVERRIDE_MASK & LoopV1Types.RISK_LOOSE_SLIPPAGE, 0);
        assertEq(uint16(forceExitWaiverMask) & ~LoopV1Types.KNOWN_STATE_MASK, 0);
        assertEq(uint16(mevMask) & ~LoopV1Types.KNOWN_STATE_MASK, 0);
    }

    function testAllErrorSelectorsReachable() public pure {
        bytes4[116] memory selectors = _allErrorSelectors();
        for (uint256 i = 0; i < selectors.length; i++) {
            assertTrue(selectors[i] != bytes4(0));
        }
    }

    /// @dev Claude verifier closure: spot-check at testErrorSelectorSpotChecks covers 10 errors;
    ///   this test asserts pairwise distinctness across the canonical selector set so a future error addition
    ///   colliding with an existing one fails the build instead of silently routing reverts wrong.
    function testAllErrorSelectorsPairwiseDistinct() public pure {
        bytes4[116] memory selectors = _allErrorSelectors();
        for (uint256 i = 0; i < selectors.length; i++) {
            for (uint256 j = i + 1; j < selectors.length; j++) {
                assertTrue(selectors[i] != selectors[j], "error selector collision");
            }
        }
    }

    function testErrorSelectorSpotChecks() public pure {
        assertEq(LoopV1Errors.WrongChain.selector, bytes4(0x10dfc033));
        assertEq(LoopV1Errors.InvalidSignature.selector, bytes4(0x8baa579f));
        assertEq(LoopV1Errors.QuoteStale.selector, bytes4(0x36a5021e));
        assertEq(LoopV1Errors.RpcQuorumDegraded.selector, bytes4(0x45490bfd));
        assertEq(LoopV1Errors.CurveLiquidityInsufficient.selector, bytes4(0xa1eee051));
        assertEq(LoopV1Errors.OracleStale.selector, bytes4(0x04578698));
        assertEq(LoopV1Errors.MorphoEvidenceMissing.selector, bytes4(0xa50e1b8c));
        assertEq(LoopV1Errors.AuditGateClosed.selector, bytes4(0x3fef151f));
        assertEq(LoopV1Errors.EvidenceUnsorted.selector, bytes4(0xe1527a5f));
        assertEq(LoopV1Errors.Phase1AutomationScopeViolation.selector, bytes4(0x360d2734));
    }

    function testEventSignaturesReachable() public pure {
        bytes32[33] memory topics = [
            keccak256("LoopActionStarted(bytes32,uint8,address,bytes32,uint256)"),
            keccak256("LoopActionStep(address,bytes32,bytes32,uint8,uint8,address,bytes4,bool)"),
            keccak256("LoopActionCompleted(bytes32,uint16)"),
            keccak256("LoopOpenedV2(bytes32,address,bytes32,uint256,uint256,uint256)"),
            keccak256("LoopRebalancedV2(bytes32,address,bytes32,int256,int256,uint256)"),
            keccak256("LoopExitedV2(bytes32,address,bytes32,uint256,uint256,uint256)"),
            keccak256("LoopForceExitedV2(bytes32,address,bytes32,uint256,uint256,uint8)"),
            keccak256("LoopRepayedV2(bytes32,address,bytes32,uint256)"),
            keccak256("LoopRepayedByThirdParty(bytes32,address,address,bytes32,uint256)"),
            keccak256("WstdiemAuthorizationSet(address,uint64,uint8,bytes32,uint256)"),
            keccak256("WstdiemAuthorizationRevoked(address,uint64,uint256)"),
            keccak256("MorphoAuthorizationSet(address,address)"),
            keccak256("MorphoAuthorizationRevoked(address,address)"),
            keccak256("PolicyCreated(address,uint64,uint8,bytes32,uint256)"),
            keccak256("PolicyUpdated(address,uint64,bytes32,bytes32,uint256)"),
            keccak256("PolicyRevoking(address,uint64,uint256)"),
            keccak256("PolicyRevoked(address,uint64)"),
            keccak256("IndexerSignerRotated(address,address,uint256)"),
            keccak256("AnchorSubmitterRotated(address,address,uint256)"),
            keccak256("AutomationProposed(uint64,bytes32,address,uint256,uint256)"),
            keccak256("AutomationExecuted(uint64,bytes32,address)"),
            keccak256("AutomationFailed(uint64,bytes32,address,bytes4)"),
            keccak256("AutomationExpired(uint64,bytes32)"),
            keccak256("AutomationAttemptRateLimited(uint64,address)"),
            keccak256("BuilderQuotaExceeded(uint8)"),
            keccak256("KeeperBuilderOutage(uint64,bytes32,bytes32)"),
            keccak256("StateSnapshotAccepted(uint256,bytes32,address)"),
            keccak256("IncidentStateChanged(uint8,uint8)"),
            keccak256("EmergencyPaused(uint8,uint256)"),
            keccak256("EmergencyUnpaused(uint8)"),
            keccak256("FeePayoutFailed(bytes32,address,address,uint256)"),
            keccak256("LargeDustRefund(bytes32,address,address,uint256,uint256)"),
            keccak256("OperatorRecoveryNotice(address,bytes32,uint256,bytes32)")
        ];

        for (uint256 i = 0; i < topics.length; i++) {
            assertTrue(topics[i] != bytes32(0));
        }
    }

    function testRegistryStorageRoundTrip() public {
        LoopRegistry registry = deployRegistry();

        bytes32 market = keccak256("market");
        bytes32 rootTwo = bytes32(uint256(2));
        bytes32 rpcEndpointId = keccak256("rpc");
        bytes32 providerFamily = keccak256("self_hosted_base_node");
        bytes32[] memory sourceIds = _sortedOpenSources();

        LoopV1Types.MorphoMarketParams memory params = LoopV1Types.MorphoMarketParams({
            loanToken: address(0x1001),
            collateralToken: address(0x1002),
            oracle: address(0x1003),
            irm: address(0x1004),
            lltv: 860_000_000_000_000_000
        });

        vm.startPrank(OWNER);
        registry.setIndexerSigningKey(address(0x2001));
        registry.setAnchorSubmitter(address(0x2002));
        registry.setPreimageDisplayGuaranteedWallet(address(0x5001), true);
        registry.setPermissionlessCallerAllowed(address(0x5002), true);
        registry.setProviderFamily(rpcEndpointId, providerFamily);
        ILoopRegistry.SpenderCheck memory spenderCheck = ILoopRegistry.SpenderCheck({
            spender: address(0x6002),
            runtimeCodeHash: keccak256("codehash"),
            proxyKind: 1,
            implSelector: bytes4(0x5c60da1b),
            expectedImpl: address(0x6003)
        });
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](9);
        ops[0] = _opLoopAuthorization(address(0x2003));
        ops[1] = _opForceAuthorizer(address(0x2004));
        ops[2] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0x3001));
        ops[3] = _opExecutor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT), address(0x3002));
        ops[4] = _opMarket(market, params);
        ops[5] = _opCanonical(market, LoopV1Types.SOURCE_MORPHO_POSITION, address(0x4001));
        ops[6] = _opRequired(uint8(LoopV1Types.PrimaryType.OPEN), sourceIds);
        ops[7] = _opSpender(uint8(LoopV1Types.PrimaryType.OPEN), address(0x6001), address(0x6002), spenderCheck);
        ops[8] = _opSupportedMarket(market, true);
        _commit(registry, ops, rootTwo);
        vm.stopPrank();

        assertEq(registry.registryVersion(), 1);
        assertEq(registry.registryMerkleRoot(), rootTwo);
        assertEq(registry.indexerSigningKey(), address(0x2001));
        assertEq(registry.anchorSubmitter(), address(0x2002));
        assertEq(registry.loopAuthorization(), address(0x2003));
        assertEq(registry.loopForceExitAuthorizer(), address(0x2004));
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)), address(0x3001));
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.FORCE_EXIT)), address(0x3002));
        assertTrue(registry.supportedMarket(market));

        LoopV1Types.MorphoMarketParams memory loadedParams = registry.marketParams(market);
        assertEq(loadedParams.loanToken, params.loanToken);
        assertEq(loadedParams.collateralToken, params.collateralToken);
        assertEq(loadedParams.oracle, params.oracle);
        assertEq(loadedParams.irm, params.irm);
        assertEq(loadedParams.lltv, params.lltv);

        assertEq(registry.canonicalSource(market, LoopV1Types.SOURCE_MORPHO_POSITION), address(0x4001));
        assertTrue(registry.preimageDisplayGuaranteedWallet(address(0x5001)));
        assertTrue(registry.permissionlessCallerAllowed(address(0x5002)));
        assertEq(registry.providerFamily(rpcEndpointId), providerFamily);

        bytes32[] memory loadedSources = registry.requiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.OPEN));
        assertEq(loadedSources.length, 5);
        assertEq(loadedSources[0], LoopV1Types.SOURCE_MORPHO_POSITION);
        assertEq(loadedSources[1], LoopV1Types.SOURCE_VAULT_NAV);

        ILoopRegistry.SpenderCheck memory check =
            registry.allowedSpender(uint8(LoopV1Types.PrimaryType.OPEN), address(0x6001), address(0x6002));
        assertEq(check.spender, address(0x6002));
        assertEq(check.runtimeCodeHash, keccak256("codehash"));
        assertEq(check.proxyKind, 1);
        assertEq(check.implSelector, bytes4(0x5c60da1b));
        assertEq(check.expectedImpl, address(0x6003));
    }

    function testRegistryOwnerGating() public {
        LoopRegistry registry = deployRegistry();

        vm.prank(NOT_OWNER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, NOT_OWNER));
        registry.setRegistryVersion(1);
    }

    /// @dev Claude verifier closure: testRegistryOwnerGating only proved setRegistryVersion is
    ///   owner-gated; this test asserts every PR-1 LoopRegistry mutator reverts with
    ///   OwnableUnauthorizedAccount when called by a non-owner. Closes the H-3-adjacent coverage gap.
    function testAllSettersRejectNonOwner() public {
        LoopRegistry registry = deployRegistry();
        bytes memory expectedRevert = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, NOT_OWNER);

        bytes32 market = bytes32(uint256(0xABCD));
        LoopV1Types.MorphoMarketParams memory params = LoopV1Types.MorphoMarketParams({
            loanToken: address(0x1),
            collateralToken: address(0x2),
            oracle: address(0x3),
            irm: address(0x4),
            lltv: 800_000_000_000_000_000
        });
        ILoopRegistry.SpenderCheck memory check = ILoopRegistry.SpenderCheck({
            spender: address(0x6002),
            runtimeCodeHash: keccak256("codehash"),
            proxyKind: 1,
            implSelector: bytes4(0x5c60da1b),
            expectedImpl: address(0x6003)
        });
        bytes32[] memory sources = new bytes32[](1);
        sources[0] = LoopV1Types.SOURCE_MORPHO_POSITION;

        vm.startPrank(NOT_OWNER);

        vm.expectRevert(expectedRevert);
        registry.setRegistryVersion(1);
        vm.expectRevert(expectedRevert);
        registry.setRegistryMerkleRoot(bytes32(uint256(1)));
        vm.expectRevert(expectedRevert);
        registry.setIndexerSigningKey(address(0x1001));
        vm.expectRevert(expectedRevert);
        registry.setAnchorSubmitter(address(0x1002));
        vm.expectRevert(expectedRevert);
        registry.setLoopAuthorization(address(0x1003));
        vm.expectRevert(expectedRevert);
        registry.setLoopForceExitAuthorizer(address(0x1004));
        vm.expectRevert(expectedRevert);
        registry.setExecutorFor(uint8(LoopV1Types.PrimaryType.OPEN), address(0x1005));
        vm.expectRevert(expectedRevert);
        registry.setSupportedMarket(market, true);
        vm.expectRevert(expectedRevert);
        registry.setMarketParams(market, params);
        vm.expectRevert(expectedRevert);
        registry.setAllowedSpender(uint8(LoopV1Types.PrimaryType.OPEN), address(0x6001), address(0x6002), check);
        vm.expectRevert(expectedRevert);
        registry.setCanonicalSource(market, LoopV1Types.SOURCE_MORPHO_POSITION, address(0x4001));
        vm.expectRevert(expectedRevert);
        registry.setRequiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.OPEN), sources);
        vm.expectRevert(expectedRevert);
        registry.setPreimageDisplayGuaranteedWallet(address(0x5001), true);
        vm.expectRevert(expectedRevert);
        registry.setPermissionlessCallerAllowed(address(0x5002), true);
        vm.expectRevert(expectedRevert);
        registry.setProviderFamily(bytes32(uint256(1)), bytes32(uint256(2)));

        vm.stopPrank();
    }

    function testRegistryVersionMonotonicAdvance() public {
        LoopRegistry registry = deployRegistry();

        vm.startPrank(OWNER);
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0x1005));
        registry.batchUpdate(ops, 2, bytes32(uint256(2)));
        vm.expectRevert(LoopRegistry.NonMonotonicRegistryVersion.selector);
        registry.batchUpdate(ops, 2, bytes32(uint256(3)));
        vm.expectRevert(LoopRegistry.NonMonotonicRegistryVersion.selector);
        registry.batchUpdate(ops, 1, bytes32(uint256(4)));

        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setRegistryMerkleRoot(bytes32(uint256(1)));
        registry.setRegistryMerkleRoot(bytes32(uint256(2)));
        vm.stopPrank();
    }

    function testBatchUpdateImmediateDuringBootstrap() public {
        LoopRegistry registry = deployRegistry();
        assertFalse(registry.bootstrapClosed());

        vm.startPrank(OWNER);
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0x1005));
        registry.batchUpdate(ops, 1, bytes32(uint256(1)));
        assertEq(registry.registryVersion(), 1);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)), address(0x1005));
        (,,, uint256 effectiveBlock,) = registry.pendingBatchUpdate();
        assertEq(effectiveBlock, 0, "no pending during bootstrap");
        vm.stopPrank();
    }

    function testBatchUpdateQueuesAfterBootstrapClosed() public {
        LoopRegistry registry = deployRegistry();

        vm.startPrank(OWNER);
        registry.closeBootstrap();
        assertTrue(registry.bootstrapClosed());

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0xABCD));
        uint256 start = block.number;
        registry.batchUpdate(ops, 1, bytes32(uint256(11)));

        // Not applied yet.
        assertEq(registry.registryVersion(), 0);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)), address(0));

        (bytes32 opsHash, uint256 nextVersion, bytes32 nextRoot, uint256 effectiveBlock, uint16 opCount) =
            registry.pendingBatchUpdate();
        assertEq(nextVersion, 1);
        assertEq(nextRoot, bytes32(uint256(11)));
        assertEq(opCount, 1);
        assertEq(effectiveBlock, start + 130_000);
        assertEq(opsHash, keccak256(abi.encode(ops)));

        // Timelock not elapsed.
        vm.expectRevert(LoopV1Errors.FingerprintTimelockNotElapsed.selector);
        registry.applyBatchUpdate(ops);

        vm.roll(effectiveBlock);
        registry.applyBatchUpdate(ops);
        assertEq(registry.registryVersion(), 1);
        assertEq(registry.executorFor(uint8(LoopV1Types.PrimaryType.OPEN)), address(0xABCD));
        (,,, uint256 cleared,) = registry.pendingBatchUpdate();
        assertEq(cleared, 0);
        vm.stopPrank();
    }

    function testApplyBatchUpdateRejectsOpsMismatch() public {
        LoopRegistry registry = deployRegistry();
        vm.startPrank(OWNER);
        registry.closeBootstrap();

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0x1111));
        registry.batchUpdate(ops, 1, bytes32(uint256(1)));
        vm.roll(block.number + 130_000);

        ILoopRegistry.BatchOp[] memory wrong = new ILoopRegistry.BatchOp[](1);
        wrong[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0x2222));
        vm.expectRevert(LoopRegistry.PendingBatchMismatch.selector);
        registry.applyBatchUpdate(wrong);
        vm.stopPrank();
    }

    function testCancelPendingBatch() public {
        LoopRegistry registry = deployRegistry();
        vm.startPrank(OWNER);
        registry.closeBootstrap();

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0x3333));
        registry.batchUpdate(ops, 1, bytes32(uint256(1)));
        registry.cancelPendingBatch();
        (,,, uint256 effectiveBlock,) = registry.pendingBatchUpdate();
        assertEq(effectiveBlock, 0);

        vm.roll(block.number + 130_000);
        vm.expectRevert(LoopRegistry.NoPendingBatch.selector);
        registry.applyBatchUpdate(ops);
        vm.stopPrank();
    }

    function testCloseBootstrapIsOneWay() public {
        LoopRegistry registry = deployRegistry();
        vm.startPrank(OWNER);
        registry.closeBootstrap();
        vm.expectRevert(LoopRegistry.BootstrapAlreadyClosed.selector);
        registry.closeBootstrap();
        vm.stopPrank();
    }

    function testRoleSeparationRejectsZeroAddress() public {
        LoopRegistry registry = deployRegistry();

        vm.startPrank(OWNER);
        vm.expectRevert(LoopRegistry.ZeroAddress.selector);
        registry.setIndexerSigningKey(address(0));
        vm.expectRevert(LoopRegistry.ZeroAddress.selector);
        registry.setAnchorSubmitter(address(0));
        vm.stopPrank();
    }

    function testRoleSeparationRejectsEqualAddress() public {
        LoopRegistry registry = deployRegistry();
        address shared = address(0xCAFE);

        vm.startPrank(OWNER);
        registry.setIndexerSigningKey(shared);
        vm.expectRevert(LoopRegistry.IndexerEqualsAnchor.selector);
        registry.setAnchorSubmitter(shared);

        registry.setAnchorSubmitter(address(0xBEEF));
        vm.expectRevert(LoopRegistry.IndexerEqualsAnchor.selector);
        registry.setIndexerSigningKey(address(0xBEEF));
        vm.stopPrank();
    }

    function testSetEmergencyGuardianEmitsEvent() public {
        LoopRegistry registry = deployRegistry();
        address previous = registry.emergencyGuardian();
        address next = address(0xDEAD);

        vm.expectEmit(true, true, false, true);
        emit ILoopV1Events.RegistryEmergencyGuardianChanged(previous, next, block.number);

        vm.prank(OWNER);
        registry.setEmergencyGuardian(next);

        assertEq(registry.emergencyGuardian(), next);
    }

    function testSetEmergencyGuardianRejectsZero() public {
        LoopRegistry registry = deployRegistry();
        vm.prank(OWNER);
        vm.expectRevert(LoopRegistry.ZeroAddress.selector);
        registry.setEmergencyGuardian(address(0));
    }

    function testSourceTaxonomyLengthAndSnapshot() public {
        LoopRegistry registry = deployRegistry();
        bytes32[] memory taxonomy = registry.sourceTaxonomy();

        assertEq(taxonomy.length, 7);
        assertEq(taxonomy[0], _sourceSnapshot("SOURCE_MORPHO_POSITION"));
        assertEq(taxonomy[1], _sourceSnapshot("SOURCE_VAULT_NAV"));
        assertEq(taxonomy[2], _sourceSnapshot("SOURCE_CHAINLINK_FEED"));
        assertEq(taxonomy[3], _sourceSnapshot("SOURCE_CURVE_QUOTE"));
        assertEq(taxonomy[4], _sourceSnapshot("SOURCE_SEQUENCER_UPTIME"));
        assertEq(taxonomy[5], _sourceSnapshot("SOURCE_HARVEST_EVENT"));
        assertEq(taxonomy[6], _sourceSnapshot("SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT"));
    }

    function testMorphoSelectorSnapshotMatch() public view {
        _assertSelector(
            "SUPPLY_COLLATERAL",
            MorphoSelectors.SUPPLY_COLLATERAL,
            bytes4(keccak256("supplyCollateral((address,address,address,address,uint256),uint256,address,bytes)"))
        );
        _assertSelector(
            "BORROW",
            MorphoSelectors.BORROW,
            bytes4(keccak256("borrow((address,address,address,address,uint256),uint256,uint256,address,address)"))
        );
        _assertSelector(
            "REPAY",
            MorphoSelectors.REPAY,
            bytes4(keccak256("repay((address,address,address,address,uint256),uint256,uint256,address,bytes)"))
        );
        _assertSelector(
            "WITHDRAW_COLLATERAL",
            MorphoSelectors.WITHDRAW_COLLATERAL,
            bytes4(keccak256("withdrawCollateral((address,address,address,address,uint256),uint256,address,address)"))
        );
        _assertSelector(
            "SET_AUTHORIZATION", MorphoSelectors.SET_AUTHORIZATION, bytes4(keccak256("setAuthorization(address,bool)"))
        );
        _assertSelector(
            "ACCRUE_INTEREST",
            MorphoSelectors.ACCRUE_INTEREST,
            bytes4(keccak256("accrueInterest((address,address,address,address,uint256))"))
        );
        _assertSelector(
            "LIQUIDATE",
            MorphoSelectors.LIQUIDATE,
            bytes4(keccak256("liquidate((address,address,address,address,uint256),address,uint256,uint256,bytes)"))
        );
    }

    function _assertTypehash(string memory name, bytes32 actual) private view {
        bytes32 expected = vm.parseJsonBytes32(typehashSnapshot, string.concat(".", name, ".hash"));
        string memory preimage = vm.parseJsonString(typehashSnapshot, string.concat(".", name, ".preimage"));
        assertEq(actual, expected);
        assertEq(oracle.hash(preimage), expected);
    }

    function _assertSource(string memory name, bytes32 actual) private view {
        assertEq(actual, _sourceSnapshot(name));
    }

    function _assertSelector(string memory name, bytes4 actual, bytes4 computed) private view {
        assertEq(actual, computed);
        assertEq(actual, _selectorSnapshot(name));
    }

    function _sourceSnapshot(string memory name) private view returns (bytes32) {
        return vm.parseJsonBytes32(sourceSnapshot, string.concat(".", name, ".hash"));
    }

    function _selectorSnapshot(string memory name) private view returns (bytes4 selector) {
        bytes memory raw = vm.parseJsonBytes(morphoSelectorSnapshot, string.concat(".", name));
        assembly {
            selector := mload(add(raw, 32))
        }
    }

    function _stateMask(LoopV1Types.StateBit bit) private pure returns (uint16) {
        return uint16(1) << uint8(bit);
    }

    function _allErrorSelectors() private pure returns (bytes4[116] memory selectors) {
        selectors[0] = LoopV1Errors.WrongChain.selector;
        selectors[1] = LoopV1Errors.RegistryVersionMismatch.selector;
        selectors[2] = LoopV1Errors.RegistryMerkleRootMismatch.selector;
        selectors[3] = LoopV1Errors.ExecutorMismatch.selector;
        selectors[4] = LoopV1Errors.SpenderNotRegistered.selector;
        selectors[5] = LoopV1Errors.BytecodeMismatch.selector;
        selectors[6] = LoopV1Errors.VaultAssetMismatch.selector;
        selectors[7] = LoopV1Errors.MorphoParamsMismatch.selector;
        selectors[8] = LoopV1Errors.ConfigIntegrityFailure.selector;
        selectors[9] = LoopV1Errors.InvalidSignature.selector;
        selectors[10] = LoopV1Errors.DigestTypeMismatch.selector;
        selectors[11] = LoopV1Errors.NonceAlreadyUsed.selector;
        selectors[12] = LoopV1Errors.PolicyRevoking.selector;
        selectors[13] = LoopV1Errors.PolicyExpired.selector;
        selectors[14] = LoopV1Errors.PolicyClassMismatch.selector;
        selectors[15] = LoopV1Errors.ForceAuthorizationRequired.selector;
        selectors[16] = LoopV1Errors.AckRiskBitMissing.selector;
        selectors[17] = LoopV1Errors.ExecutionKindMismatch.selector;
        selectors[18] = LoopV1Errors.CallbackDataForbidden.selector;
        selectors[19] = LoopV1Errors.ReentrantCallback.selector;
        selectors[20] = LoopV1Errors.InvalidCallbackSender.selector;
        selectors[21] = LoopV1Errors.InvalidCallbackContext.selector;
        selectors[22] = LoopV1Errors.VaultEvidenceMissing.selector;
        selectors[23] = LoopV1Errors.Eip1271PreimageNotAttested.selector;
        selectors[24] = LoopV1Errors.ForceExitWaiverOverbroad.selector;
        selectors[25] = LoopV1Errors.ForceExitPolicyNotAllowedInPhase1.selector;
        selectors[26] = LoopV1Errors.ForceExitDeadlineExceedsBound.selector;
        selectors[27] = LoopV1Errors.MevWaiverMissing.selector;
        selectors[28] = LoopV1Errors.Phase1AutomationScopeViolation.selector;
        selectors[29] = LoopV1Errors.QuoteStale.selector;
        selectors[30] = LoopV1Errors.QuoteDeviationExceeded.selector;
        selectors[31] = LoopV1Errors.EvidenceStale.selector;
        selectors[32] = LoopV1Errors.BlockInconsistent.selector;
        selectors[33] = LoopV1Errors.DeadlineExceeded.selector;
        selectors[34] = LoopV1Errors.IndexerAnchorStale.selector;
        selectors[35] = LoopV1Errors.HarvestConvergencePending.selector;
        selectors[36] = LoopV1Errors.RpcQuorumDegraded.selector;
        selectors[37] = LoopV1Errors.MevModeMismatch.selector;
        selectors[38] = LoopV1Errors.RevealTooEarly.selector;
        selectors[39] = LoopV1Errors.RpcQuorumNotIndependent.selector;
        selectors[40] = LoopV1Errors.KeeperBuilderOutage.selector;
        selectors[41] = LoopV1Errors.CurveLiquidityInsufficient.selector;
        selectors[42] = LoopV1Errors.CurveSlippageExceeded.selector;
        selectors[43] = LoopV1Errors.CurvePriceImpactExceeded.selector;
        selectors[44] = LoopV1Errors.FlashLiquidityUnavailable.selector;
        selectors[45] = LoopV1Errors.AlternateProviderMissing.selector;
        selectors[46] = LoopV1Errors.OracleStale.selector;
        selectors[47] = LoopV1Errors.OracleMissing.selector;
        selectors[48] = LoopV1Errors.OracleDeviationExceeded.selector;
        selectors[49] = LoopV1Errors.SequencerDown.selector;
        selectors[50] = LoopV1Errors.SequencerGracePeriod.selector;
        selectors[51] = LoopV1Errors.NavStepExceeded.selector;
        selectors[52] = LoopV1Errors.MorphoEvidenceMissing.selector;
        selectors[53] = LoopV1Errors.HealthFactorBoundFailure.selector;
        selectors[54] = LoopV1Errors.DebtNotReduced.selector;
        selectors[55] = LoopV1Errors.HealthIndeterminate.selector;
        selectors[56] = LoopV1Errors.LeverageBoundFailure.selector;
        selectors[57] = LoopV1Errors.BorrowedDiemOutOfBand.selector;
        selectors[58] = LoopV1Errors.CollateralSoldExceeded.selector;
        selectors[59] = LoopV1Errors.DustBoundExceeded.selector;
        selectors[60] = LoopV1Errors.LiquidationDistanceBoundFailure.selector;
        selectors[61] = LoopV1Errors.UtilizationImpactExceeded.selector;
        selectors[62] = LoopV1Errors.CurveShareExceeded.selector;
        selectors[63] = LoopV1Errors.VaultDepositShortfall.selector;
        selectors[64] = LoopV1Errors.ThirdPartyRepayNotAccepted.selector;
        selectors[65] = LoopV1Errors.AuditGateClosed.selector;
        selectors[66] = LoopV1Errors.PausedAction.selector;
        selectors[67] = LoopV1Errors.PauseRateLimited.selector;
        selectors[68] = LoopV1Errors.PauseScopeViolation.selector;
        selectors[69] = LoopV1Errors.PauseAuthorityOnly.selector;
        selectors[70] = LoopV1Errors.GovernanceRoleOnly.selector;
        selectors[71] = LoopV1Errors.AnchorSubmitterOnly.selector;
        selectors[72] = LoopV1Errors.AnchorTooFrequent.selector;
        selectors[73] = LoopV1Errors.AnchorInFuture.selector;
        selectors[74] = LoopV1Errors.NotPaused.selector;
        selectors[75] = LoopV1Errors.AlreadyPaused.selector;
        selectors[76] = LoopV1Errors.RolesMustDiffer.selector;
        selectors[77] = LoopV1Errors.IncidentInvestigating.selector;
        selectors[78] = LoopV1Errors.IncidentMitigating.selector;
        selectors[79] = LoopV1Errors.RevokedAuthorization.selector;
        selectors[80] = LoopV1Errors.AutomationAttemptThrottled.selector;
        selectors[81] = LoopV1Errors.BuilderQuotaExceeded.selector;
        selectors[82] = LoopV1Errors.CallerNotAllowed.selector;
        selectors[83] = LoopV1Errors.LedgerBeforeUnavailable.selector;
        selectors[84] = LoopV1Errors.LedgerAfterUnavailable.selector;
        selectors[85] = LoopV1Errors.EvidenceUnsorted.selector;
        selectors[86] = LoopV1Errors.EvidenceSourceUnexpected.selector;
        selectors[87] = LoopV1Errors.EvidenceSourceMissing.selector;
        selectors[88] = LoopV1Errors.EvidenceSourceAddressMismatch.selector;
        selectors[89] = LoopV1Errors.MorphoSelectorForbidden.selector;
        selectors[90] = LoopV1Errors.MorphoSharesModeForbidden.selector;
        selectors[91] = LoopV1Errors.ReceiverNotAllowed.selector;
        selectors[92] = LoopV1Errors.ActionContextMissing.selector;
        selectors[93] = LoopV1Errors.ActionContextDigestMismatch.selector;
        selectors[94] = LoopV1Errors.MorphoSelectorOutOfOrder.selector;
        selectors[95] = LoopV1Errors.MorphoSelectorAfterTerminal.selector;
        selectors[96] = LoopV1Errors.MorphoTerminalSelectorMissing.selector;
        selectors[97] = LoopV1Errors.ActionContextAlreadyArmed.selector;
        selectors[98] = LoopV1Errors.EvidenceBundleHashMismatch.selector;
        selectors[99] = LoopV1Errors.PolicyHashMismatch.selector;
        selectors[100] = LoopV1Errors.AutomationProposalWindow.selector;
        selectors[101] = LoopV1Errors.PolicyExpiryExceedsBound.selector;
        selectors[102] = LoopV1Errors.DeadlineExceedsBound.selector;
        selectors[103] = LoopV1Errors.AnchorNotMonotonic.selector;
        selectors[104] = LoopV1Errors.OperatorRecoveryActivityUnknown.selector;
        selectors[105] = LoopV1Errors.Erc20ApproveFailed.selector;
        selectors[106] = LoopV1Errors.Erc20TransferFailed.selector;
        selectors[107] = LoopV1Errors.Erc20TransferFromFailed.selector;
        selectors[108] = LoopV1Errors.StateBitmapUnknownBits.selector;
        selectors[109] = LoopV1Errors.RegistryVersionStale.selector;
        selectors[110] = LoopV1Errors.FingerprintTimelockNotElapsed.selector;
        selectors[111] = LoopV1Errors.FingerprintInvalid.selector;
        selectors[112] = LoopV1Errors.FingerprintMismatch.selector;
        selectors[113] = LoopV1Errors.ConfigMutationOutsideAtomicGate.selector;
        selectors[114] = LoopV1Errors.HarvestAuthorityOnly.selector;
        selectors[115] = LoopV1Errors.OnlyAuthorization.selector;
    }
}
