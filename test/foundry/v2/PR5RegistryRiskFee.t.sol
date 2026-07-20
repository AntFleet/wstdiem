// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

import {ILoopFeeRouter} from "../../../contracts/v2/interfaces/ILoopFeeRouter.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {ILoopRiskOracleAdapter} from "../../../contracts/v2/interfaces/ILoopRiskOracleAdapter.sol";
import {LoopFeeRouter} from "../../../contracts/v2/LoopFeeRouter.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopFingerprintRegistry} from "../../../contracts/v2/LoopFingerprintRegistry.sol";
import {LoopRiskOracleAdapter} from "../../../contracts/v2/LoopRiskOracleAdapter.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1ActionValidation} from "../../../contracts/v2/libraries/LoopV1ActionValidation.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1Hashing} from "../../../contracts/v2/libraries/LoopV1Hashing.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {LoopV1Validation} from "../../../contracts/v2/libraries/LoopV1Validation.sol";
import {RegistryBatchHelpers} from "./helpers/RegistryBatchHelpers.sol";

contract PR5TestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        if (approved != type(uint256).max) allowance[from][msg.sender] = approved - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PR5MorphoMock {
    uint128 public totalSupplyAssets = 100 ether;
    uint128 public totalSupplyShares = 100 ether;
    uint128 public totalBorrowAssets = 50 ether;
    uint128 public totalBorrowShares = 50 ether;
    uint128 public borrowShares = 50 ether;
    uint128 public collateral = 100 ether;
    LoopV1Types.MorphoMarketParams public params;
    bool public revertReads;

    function setPosition(uint128 nextBorrowShares, uint128 nextCollateral) external {
        borrowShares = nextBorrowShares;
        collateral = nextCollateral;
    }

    function setParams(LoopV1Types.MorphoMarketParams memory nextParams) external {
        params = nextParams;
    }

    function setRevertReads(bool nextRevertReads) external {
        revertReads = nextRevertReads;
    }

    function position(bytes32, address) external view returns (uint256, uint128, uint128) {
        if (revertReads) revert("morpho-read");
        return (0, borrowShares, collateral);
    }

    function market(bytes32) external view returns (uint128, uint128, uint128, uint128, uint128, uint128) {
        if (revertReads) revert("morpho-read");
        return (totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, 0, 0);
    }

    function idToMarketParams(bytes32)
        external
        view
        returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)
    {
        if (revertReads) revert("morpho-read");
        return (params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv);
    }
}

contract PR5OracleMock {
    uint256 private priceValue = 1e18;
    bool public revertReads;

    function setPrice(uint256 nextPrice) external {
        priceValue = nextPrice;
    }

    function setRevertReads(bool nextRevertReads) external {
        revertReads = nextRevertReads;
    }

    function price() external view returns (uint256) {
        if (revertReads) revert("oracle-read");
        return priceValue;
    }
}

contract PR5FeedMock {
    int256 public answer = 1;
    uint256 public startedAt = 1;
    uint256 public updatedAt = 1;
    uint8 public decimals = 8;
    address public aggregator = address(0xA66);
    uint80 public roundId = uint80(1) << 64;
    bool public revertReads;

    function set(int256 nextAnswer, uint256 nextStartedAt, uint256 nextUpdatedAt) external {
        answer = nextAnswer;
        startedAt = nextStartedAt;
        updatedAt = nextUpdatedAt;
    }

    function setDecimals(uint8 nextDecimals) external {
        decimals = nextDecimals;
    }

    function setAggregator(address nextAggregator) external {
        aggregator = nextAggregator;
    }

    function setRevertReads(bool nextRevertReads) external {
        revertReads = nextRevertReads;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        if (revertReads) revert("feed-read");
        return (roundId, answer, startedAt, updatedAt, roundId);
    }
}

contract PR5CurveMock {
    uint256 public depth = 10 ether;
    address public coin0 = address(0xC0);
    address public coin1 = address(0xC1);
    uint256 public amplification = 100;
    uint256 public feeValue = 4_000_000;

    function setDepth(uint256 nextDepth) external {
        depth = nextDepth;
    }

    function setCoins(address nextCoin0, address nextCoin1) external {
        coin0 = nextCoin0;
        coin1 = nextCoin1;
    }

    function balances(int128) external view returns (uint256) {
        return depth;
    }

    function balances(uint256) external view returns (uint256) {
        return depth;
    }

    function coins(uint256 i) external view returns (address) {
        return i == 0 ? coin0 : coin1;
    }

    function A() external view returns (uint256) {
        return amplification;
    }

    function fee() external view returns (uint256) {
        return feeValue;
    }
}

contract PR5VaultMock {
    uint256 public nav = 1e18;
    address public asset = address(0xA55E7);
    uint8 public decimals = 18;
    uint256 public totalSupply = 100 ether;
    uint256 public totalAssets = 100 ether;
    bool public revertReads;

    function setNav(uint256 nextNav) external {
        nav = nextNav;
    }

    function setAsset(address nextAsset) external {
        asset = nextAsset;
    }

    function setRevertReads(bool nextRevertReads) external {
        revertReads = nextRevertReads;
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        if (revertReads) revert("vault-read");
        return shares * nav / 1e18;
    }
}

contract PR5UniswapPoolMock {
    address public factory = address(0xFA);
    address public token0 = address(0x10);
    address public token1 = address(0x11);
    uint24 public fee = 500;
    int24 public tickSpacing = 10;
    uint128 public liquidity = 1_000_000;
    int24 public tick = 100;

    function setFactory(address nextFactory) external {
        factory = nextFactory;
    }

    function setFee(uint24 nextFee) external {
        fee = nextFee;
    }

    function setLiquidity(uint128 nextLiquidity) external {
        liquidity = nextLiquidity;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (0, tick, 0, 0, 0, 0, true);
    }
}

contract PR5ValidationHarness {
    function validate(
        ILoopRegistry registry,
        LoopV1Types.ActionEvidence calldata evidence,
        LoopV1EIP712.ActionIdentity calldata identity,
        uint8 primaryType
    ) external view {
        LoopV1Validation.validateEvidence(
            registry, evidence, identity, primaryType, LoopV1Hashing.hashEvidence(evidence)
        );
    }

    function validateExecutionKind(
        ILoopRegistry registry,
        address owner,
        uint8 executionKind,
        bytes32 market,
        address executionCaller,
        uint256 localLastSigned
    ) external view {
        LoopV1ActionValidation.validateExecutionKind(
            registry, owner, executionKind, market, executionCaller, localLastSigned
        );
    }
}

contract PR5RegistryRiskFeeTest is RegistryBatchHelpers, Test {
    event FeeRouted(address indexed receiver, address indexed token, uint256 amount, bytes32 indexed actionId);
    event ReclosedIntegration(bytes32 indexed integrationId);

    address private owner = address(this);
    address private other = address(0xB0B);
    bytes32 private market;
    LoopRegistry private registry;
    LoopRiskOracleAdapter private risk;
    PR5MorphoMock private morpho;
    PR5OracleMock private oracle;
    PR5FeedMock private chainlink;
    PR5FeedMock private sequencer;
    PR5CurveMock private curve;
    PR5VaultMock private vault;
    PR5UniswapPoolMock private uniswap;
    LoopV1Types.MorphoMarketParams private params;

    function setUp() public {
        vm.warp(10_000);
        registry = new LoopRegistry(owner);
        risk = new LoopRiskOracleAdapter(registry);
        morpho = new PR5MorphoMock();
        oracle = new PR5OracleMock();
        chainlink = new PR5FeedMock();
        sequencer = new PR5FeedMock();
        curve = new PR5CurveMock();
        vault = new PR5VaultMock();
        uniswap = new PR5UniswapPoolMock();
        chainlink.set(1e18, 1, block.timestamp);
        sequencer.set(0, 1, block.timestamp);
        params = LoopV1Types.MorphoMarketParams(address(0xD1E1), address(0xC011), address(oracle), address(0x1), 0.8e18);
        morpho.setParams(params);
        market = keccak256(abi.encode(params));
        registry.setLoopRiskOracleAdapter(address(risk));
    }

    function testLockABatchCommitRequiredAndWorks() public {
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setMarketParams(market, params);

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](2);
        ops[0] = _opMarket(market, params);
        ops[1] = _opSupportedMarket(market, true);
        _commit(registry, ops, bytes32(uint256(1)));

        LoopV1Types.MorphoMarketParams memory loaded = registry.marketParams(market);
        assertEq(loaded.oracle, params.oracle);
        assertEq(registry.registryVersion(), 1);
        assertEq(registry.registryMerkleRoot(), bytes32(uint256(1)));
    }

    function testLockBRejectsNonCanonicalUnsortedAndMissingSources() public {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opCanonical(market, keccak256("bad-source"), address(1));
        uint256 nextVersion = registry.registryVersion() + 1;
        vm.expectRevert(LoopV1Errors.EvidenceSourceUnexpected.selector);
        registry.batchUpdate(ops, nextVersion, bytes32(uint256(1)));

        bytes32[] memory unsorted = _sortedOpenSources();
        unsorted[0] = LoopV1Types.SOURCE_VAULT_NAV;
        unsorted[1] = LoopV1Types.SOURCE_MORPHO_POSITION;
        ops[0] = _opRequired(uint8(LoopV1Types.PrimaryType.OPEN), unsorted);
        nextVersion = registry.registryVersion() + 1;
        vm.expectRevert(LoopV1Errors.EvidenceUnsorted.selector);
        registry.batchUpdate(ops, nextVersion, bytes32(uint256(1)));

        bytes32[] memory missing = new bytes32[](1);
        missing[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        ops[0] = _opRequired(uint8(LoopV1Types.PrimaryType.OPEN), missing);
        nextVersion = registry.registryVersion() + 1;
        vm.expectRevert(LoopV1Errors.EvidenceSourceMissing.selector);
        registry.batchUpdate(ops, nextVersion, bytes32(uint256(1)));
    }

    function testLockDRootAdvanceRequiresBatchVersionBump() public {
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setRegistryMerkleRoot(bytes32(uint256(2)));
        registry.setRegistryMerkleRoot(bytes32(0));

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(0xE));
        _commit(registry, ops, bytes32(uint256(2)));
        assertEq(registry.registryMerkleRoot(), bytes32(uint256(2)));
    }

    function testLockEFingerprintQueueTimelockAndBatchApply() public {
        ILoopRegistry.BatchOp[] memory configOps = new ILoopRegistry.BatchOp[](1);
        configOps[0] = _opVault(market, address(vault));
        _commit(registry, configOps, bytes32(uint256(1)));
        bytes32 integrationId = _integrationId(LoopV1Types.SOURCE_VAULT_NAV);
        LoopV1Types.ExternalProtocolFingerprint memory fp = _fingerprint(LoopV1Types.SOURCE_VAULT_NAV, address(vault));
        registry.fingerprints_().queueExternalFingerprintUpdate(integrationId, fp);
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opApplyFingerprint(integrationId);
        uint256 nextVersion = registry.registryVersion() + 1;
        vm.expectRevert(LoopV1Errors.FingerprintTimelockNotElapsed.selector);
        registry.batchUpdate(ops, nextVersion, bytes32(uint256(1)));

        vm.roll(block.number + 130_000);
        _commit(registry, ops, bytes32(uint256(2)));
        LoopV1Types.ExternalProtocolFingerprint memory loaded = registry.fingerprints_().externalFingerprint(integrationId);
        assertEq(loaded.fingerprintHash, fp.fingerprintHash);
    }

    function testOperationalRealBodiesAndAuthorizationHook() public {
        registry.setHarvestAuthority(address(this));
        registry.recordHarvest(market, 123, keccak256("Harvest"));
        assertEq(registry.lastHarvestBlock(market), 123);
        registry.setHarvestCoolingBlocks(44);
        assertEq(registry.harvestCoolingBlocks(), 44);
        registry.setOperatorRecoveryRole(other, true);
        assertTrue(registry.operatorRecoveryRole(other));
        registry.setOperatorRecoveryNBlocks(55);
        assertEq(registry.operatorRecoveryNBlocks(), 55);
        registry.setForceExitBufferBps(777);
        assertEq(registry.forceExitBufferBps(), 777);
        registry.setSourceFreshnessThreshold(LoopV1Types.SOURCE_CHAINLINK_FEED, 66);
        assertEq(registry.sourceFreshnessThreshold(LoopV1Types.SOURCE_CHAINLINK_FEED), 66);

        vm.expectRevert(LoopV1Errors.OnlyAuthorization.selector);
        registry.recordOwnerActivity(other);
    }

    function testForceExitBufferBatchUpdateControlsOperatorRecoveryPredicate() public {
        _configureRiskRegistry();
        registry.setOperatorRecoveryRole(other, true);
        registry.setOperatorRecoveryNBlocks(1_296_000);
        morpho.setPosition(79 ether, 100 ether);

        PR5ValidationHarness harness = new PR5ValidationHarness();
        vm.expectRevert(LoopV1Errors.ExecutionKindMismatch.selector);
        harness.validateExecutionKind(
            registry, other, uint8(LoopV1Types.ExecutionKind.OPERATOR_RECOVERY), market, other, block.number
        );

        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opForceExitBufferBps(250);
        _commit(registry, ops, bytes32(uint256(33)));
        assertEq(registry.forceExitBufferBps(), 250);

        harness.validateExecutionKind(
            registry, other, uint8(LoopV1Types.ExecutionKind.OPERATOR_RECOVERY), market, other, block.number
        );
    }

    function testRiskOraclePositionStateAndKnownBitmap() public {
        _configureRiskRegistry();
        ILoopRiskOracleAdapter.PositionState memory state = risk.readPositionState(market, other);
        assertEq(state.debt, 50 ether);
        assertEq(state.collateral, 100 ether);
        assertEq(state.healthFactor, 1.6e18);
        assertEq(state.liquidationDistanceBps, 6000);
        assertEq(risk.computeStateBitmap(market, other), 0);
        vm.expectRevert(LoopV1Errors.StateBitmapUnknownBits.selector);
        risk.requireKnownStateBitmap(uint16(LoopV1Types.KNOWN_STATE_MASK + 1));
    }

    function testRiskOracleSetsSequencerAndCurveBits() public {
        _configureRiskRegistry();
        sequencer.set(1, 1, block.timestamp);
        curve.setDepth(0);
        uint16 bitmap = risk.computeStateBitmap(market, other);
        assertTrue(bitmap & (uint16(1) << uint8(LoopV1Types.StateBit.SEQUENCER_DOWN_OR_GRACE)) != 0);
        assertTrue(bitmap & (uint16(1) << uint8(LoopV1Types.StateBit.CURVE_LIQUIDITY_INSUFFICIENT)) != 0);
    }

    function testFeeRouterRouteAndSkim() public {
        PR5TestToken token = new PR5TestToken();
        address protocol = address(0xFEE1);
        address automation = address(0xFEE2);
        LoopFeeRouter router = new LoopFeeRouter(registry, owner, protocol, automation);
        token.mint(address(this), 10 ether);
        token.approve(address(router), type(uint256).max);
        router.routeFee(address(token), 1 ether, keccak256("action"), ILoopFeeRouter.FeeKind.PROTOCOL);
        assertEq(token.balanceOf(protocol), 1 ether);
        router.routeFee(address(token), 2 ether, keccak256("action"), ILoopFeeRouter.FeeKind.AUTOMATION);
        assertEq(token.balanceOf(automation), 2 ether);

        token.mint(address(router), 3 ether);
        router.skim(address(token));
        assertEq(token.balanceOf(protocol), 4 ether);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        router.setProtocolReceiver(other);
    }

    function testFeeRouterAccrueFeeSelectorRemoved() public {
        LoopFeeRouter router = _newRouter();
        (bool ok,) = address(router)
            .call(
                abi.encodeWithSignature(
                    "accrueFee(bytes32,address,address,address,uint256)",
                    keccak256("digest"),
                    address(this),
                    address(0x1),
                    address(0x2),
                    1
                )
            );
        assertFalse(ok);
    }

    function testFeeRouterPullSelectorRemoved() public {
        LoopFeeRouter router = _newRouter();
        (bool ok,) =
            address(router).call(abi.encodeWithSignature("pull(address,uint256,address)", address(0x1), 1, other));
        assertFalse(ok);
    }

    function testFeeRouterFeeBalanceSelectorRemoved() public {
        LoopFeeRouter router = _newRouter();
        (bool ok,) =
            address(router).staticcall(abi.encodeWithSignature("feeBalance(address,address)", other, address(0x1)));
        assertFalse(ok);
    }

    function testFeeRouterSetExecutionReceiverSelectorRemoved() public {
        LoopFeeRouter router = _newRouter();
        (bool ok,) = address(router).call(abi.encodeWithSignature("setExecutionReceiver(address)", other));
        assertFalse(ok);
    }

    function testFeeRouterProtocolRouteEmits() public {
        PR5TestToken token = new PR5TestToken();
        LoopFeeRouter router = _newRouter();
        token.mint(address(this), 1 ether);
        token.approve(address(router), 1 ether);
        bytes32 actionId = keccak256("protocol-fee");
        vm.expectEmit(true, true, true, true, address(router));
        emit FeeRouted(address(0xFEE1), address(token), 1 ether, actionId);
        router.routeFee(address(token), 1 ether, actionId, ILoopFeeRouter.FeeKind.PROTOCOL);
    }

    function testFeeRouterAutomationRouteEmits() public {
        PR5TestToken token = new PR5TestToken();
        LoopFeeRouter router = _newRouter();
        token.mint(address(this), 1 ether);
        token.approve(address(router), 1 ether);
        bytes32 actionId = keccak256("automation-fee");
        vm.expectEmit(true, true, true, true, address(router));
        emit FeeRouted(address(0xFEE2), address(token), 1 ether, actionId);
        router.routeFee(address(token), 1 ether, actionId, ILoopFeeRouter.FeeKind.AUTOMATION);
    }

    function testFeeRouterZeroAmountNoop() public {
        PR5TestToken token = new PR5TestToken();
        LoopFeeRouter router = _newRouter();
        router.routeFee(address(token), 0, keccak256("zero"), ILoopFeeRouter.FeeKind.PROTOCOL);
        assertEq(token.balanceOf(address(0xFEE1)), 0);
    }

    function testFeeRouterRejectsZeroProtocolReceiver() public {
        LoopFeeRouter router = _newRouter();
        vm.expectRevert(LoopV1Errors.ReceiverNotAllowed.selector);
        router.setProtocolReceiver(address(0));
    }

    function testFeeRouterRejectsZeroAutomationReceiver() public {
        LoopFeeRouter router = _newRouter();
        vm.expectRevert(LoopV1Errors.ReceiverNotAllowed.selector);
        router.setAutomationReceiver(address(0));
    }

    function testFeeRouterSkimZeroNoop() public {
        PR5TestToken token = new PR5TestToken();
        LoopFeeRouter router = _newRouter();
        router.skim(address(token));
        assertEq(token.balanceOf(address(0xFEE1)), 0);
    }

    function testLockASetSupportedMarketRevertsOutsideGate() public {
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setSupportedMarket(market, true);
    }

    function testLockASetSupportedMarketWorksInBatch() public {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opSupportedMarket(market, true);
        _commit(registry, ops, bytes32(uint256(21)));
        assertTrue(registry.supportedMarket(market));
    }

    function testLockASetMorphoRevertsOutsideGate() public {
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setMorpho(address(morpho));
    }

    function testLockASetCurveRevertsOutsideGate() public {
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setCurvePool(market, address(curve));
    }

    function testLockASetVaultRevertsOutsideGate() public {
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setWstDiemVault(market, address(vault));
    }

    function testLockASetFlashPoolRevertsOutsideGate() public {
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setUniswapV3FlashPool(market, address(uniswap));
    }

    function testLockASetFactoryRevertsOutsideGate() public {
        address factory = uniswap.factory();
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setUniswapV3Factory(market, factory);
    }

    function testLockASetFeeTierRevertsOutsideGate() public {
        uint24 fee = uniswap.fee();
        vm.expectRevert(LoopV1Errors.ConfigMutationOutsideAtomicGate.selector);
        registry.setUniswapV3FlashFeeTier(market, fee);
    }

    function testLockBRejectsExtraCanonicalSource() public {
        bytes32[] memory extra = new bytes32[](6);
        extra[0] = LoopV1Types.SOURCE_CURVE_QUOTE;
        extra[1] = LoopV1Types.SOURCE_MORPHO_POSITION;
        extra[2] = LoopV1Types.SOURCE_VAULT_NAV;
        extra[3] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        extra[4] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        extra[5] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opRequired(uint8(LoopV1Types.PrimaryType.OPEN), extra);
        uint256 nextVersion = registry.registryVersion() + 1;
        vm.expectRevert(LoopV1Errors.EvidenceSourceUnexpected.selector);
        registry.batchUpdate(ops, nextVersion, bytes32(uint256(22)));
    }

    function testLockBRejectsWrongExactSource() public {
        bytes32[] memory wrong = _sortedOpenSources();
        wrong[3] = LoopV1Types.SOURCE_HARVEST_EVENT;
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opRequired(uint8(LoopV1Types.PrimaryType.OPEN), wrong);
        uint256 nextVersion = registry.registryVersion() + 1;
        vm.expectRevert(LoopV1Errors.EvidenceSourceUnexpected.selector);
        registry.batchUpdate(ops, nextVersion, bytes32(uint256(23)));
    }

    function testLockBAcceptsRevokeEmptySet() public {
        bytes32[] memory empty = new bytes32[](0);
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opRequired(uint8(LoopV1Types.PrimaryType.REVOKE), empty);
        _commit(registry, ops, bytes32(uint256(24)));
        assertEq(registry.requiredEvidenceSourceSet(uint8(LoopV1Types.PrimaryType.REVOKE)).length, 0);
    }

    function testLockBRejectsRevokeExtraSource() public {
        bytes32[] memory extra = new bytes32[](1);
        extra[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opRequired(uint8(LoopV1Types.PrimaryType.REVOKE), extra);
        uint256 nextVersion = registry.registryVersion() + 1;
        vm.expectRevert(LoopV1Errors.EvidenceSourceUnexpected.selector);
        registry.batchUpdate(ops, nextVersion, bytes32(uint256(25)));
    }

    function testValidateExternalConfigHappyPathReadsLiveVenues() public {
        _configureRiskRegistry();
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN)));
    }

    function testValidateExternalConfigMissingFingerprintFails() public {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](4);
        ops[0] = _opVault(market, address(vault));
        ops[1] = _opFlashPool(market, address(uniswap));
        ops[2] = _opFactory(market, uniswap.factory());
        ops[3] = _opFeeTier(market, uniswap.fee());
        _commit(registry, ops, bytes32(uint256(26)));
        vm.expectRevert(LoopV1Errors.ConfigIntegrityFailure.selector);
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testQueueFingerprintRejectsBadHardHash() public {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opVault(market, address(vault));
        _commit(registry, ops, bytes32(uint256(27)));
        LoopV1Types.ExternalProtocolFingerprint memory fp = _fingerprint(LoopV1Types.SOURCE_VAULT_NAV, address(vault));
        fp.hardEqualityHash = keccak256("bad-hard");
        fp = _rehash(fp);
        // Cache the fingerprint registry ref first: `registry.fingerprints_()` is a separate call that
        // would otherwise consume the expectRevert cheatcode (EIP-170 Phase 3 split).
        LoopFingerprintRegistry fpReg = registry.fingerprints_();
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintInvalid.selector, uint8(1)));
        fpReg.queueExternalFingerprintUpdate(_integrationId(LoopV1Types.SOURCE_VAULT_NAV), fp);
    }

    function testValidateExternalConfigDetectsVaultNavDrift() public {
        _configureRiskRegistry();
        vault.setNav(2e18);
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(2)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testValidateExternalConfigDetectsChainlinkAggregatorDrift() public {
        _configureRiskRegistry();
        chainlink.setAggregator(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(1)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testValidateExternalConfigDetectsChainlinkStaleness() public {
        _configureRiskRegistry();
        vm.warp(block.timestamp + 601);
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(3)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testValidateExternalConfigDetectsSequencerDown() public {
        _configureRiskRegistry();
        sequencer.set(1, 1, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(3)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testValidateExternalConfigDetectsMorphoParamDrift() public {
        _configureRiskRegistry();
        morpho.setParams(
            LoopV1Types.MorphoMarketParams(
                params.loanToken, params.collateralToken, address(0xBAD), params.irm, params.lltv
            )
        );
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(1)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.OPEN));
    }

    function testApplyFingerprintEmitsReclose() public {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](1);
        ops[0] = _opVault(market, address(vault));
        _commit(registry, ops, bytes32(uint256(28)));
        bytes32 integrationId = _integrationId(LoopV1Types.SOURCE_VAULT_NAV);
        registry.fingerprints_().queueExternalFingerprintUpdate(
            integrationId, _fingerprint(LoopV1Types.SOURCE_VAULT_NAV, address(vault))
        );
        vm.roll(block.number + 130_000);
        ops[0] = _opApplyFingerprint(integrationId);
        // ReclosedIntegration now emits from the split-out fingerprint registry (EIP-170 Phase 3).
        vm.expectEmit(true, false, false, true, address(registry.fingerprints_()));
        emit ReclosedIntegration(integrationId);
        _commit(registry, ops, bytes32(uint256(29)));
    }

    function testValidateExternalConfigHappyPathWithCurveAndUniswap() public {
        _configureAllFingerprints();
        assertTrue(registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.REBALANCE)));
    }

    function testValidateExternalConfigDetectsUniswapFactoryDrift() public {
        _configureAllFingerprints();
        uniswap.setFactory(address(0xBADF));
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(1)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.REBALANCE));
    }

    function testValidateExternalConfigDetectsUniswapLiquidityDrift() public {
        _configureAllFingerprints();
        uniswap.setLiquidity(1);
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(2)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.REBALANCE));
    }

    function testValidateExternalConfigDetectsCurveBalanceDrift() public {
        _configureAllFingerprints();
        curve.setDepth(1);
        vm.expectRevert(abi.encodeWithSelector(LoopV1Errors.FingerprintMismatch.selector, uint8(2)));
        registry.validateExternalConfig(market, uint8(LoopV1Types.PrimaryType.REBALANCE));
    }

    function testRiskOracleMorphoReadFailureSetsBits() public {
        _configureRiskRegistry();
        morpho.setRevertReads(true);
        uint16 bitmap = risk.computeStateBitmap(market, other);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.CONFIG_INTEGRITY_FAILURE) != 0);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.MORPHO_OWNER_EVIDENCE_MISSING) != 0);
    }

    function testRiskOracleOracleReadFailureSetsBits() public {
        _configureRiskRegistry();
        oracle.setRevertReads(true);
        uint16 bitmap = risk.computeStateBitmap(market, other);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.CONFIG_INTEGRITY_FAILURE) != 0);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.MORPHO_OWNER_EVIDENCE_MISSING) != 0);
    }

    function testRiskOracleVaultReadFailureSetsVaultBit() public {
        _configureRiskRegistry();
        vault.setRevertReads(true);
        uint16 bitmap = risk.computeStateBitmap(market, other);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.VAULT_EVIDENCE_MISSING) != 0);
    }

    function testRiskOracleNavStepSetsVaultBit() public {
        _configureRiskRegistry();
        vault.setNav(2e18);
        uint16 bitmap = risk.computeStateBitmap(market, other);
        assertTrue(bitmap & _bit(LoopV1Types.StateBit.VAULT_EVIDENCE_MISSING) != 0);
    }

    function testKnownStateMaskBoundaryPasses() public view {
        risk.requireKnownStateBitmap(LoopV1Types.KNOWN_STATE_MASK);
    }

    function testEvidenceValidationRejectsUnknownStateBits() public {
        PR5ValidationHarness harness = new PR5ValidationHarness();
        uint16 bitmap = LoopV1Types.KNOWN_STATE_MASK | (uint16(1) << 11);
        assertTrue((bitmap & ~LoopV1Types.KNOWN_STATE_MASK) != 0);
        LoopV1Types.ActionEvidence memory evidence = _emptyActionEvidence(bitmap);
        LoopV1EIP712.ActionIdentity memory identity = _identity();
        vm.expectRevert(LoopV1Errors.StateBitmapUnknownBits.selector);
        harness.validate(registry, evidence, identity, uint8(LoopV1Types.PrimaryType.REVOKE));
    }

    function testEvidenceValidationAcceptsKnownStateMask() public {
        PR5ValidationHarness harness = new PR5ValidationHarness();
        harness.validate(
            registry,
            _emptyActionEvidence(LoopV1Types.KNOWN_STATE_MASK),
            _identity(),
            uint8(LoopV1Types.PrimaryType.REVOKE)
        );
    }

    function _configureRiskRegistry() private {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](10);
        ops[0] = _opMarket(market, params);
        ops[1] = _opMorpho(address(morpho));
        ops[2] = _opCurve(market, address(curve));
        ops[3] = _opVault(market, address(vault));
        ops[4] = _opCanonical(market, LoopV1Types.SOURCE_CHAINLINK_FEED, address(chainlink));
        ops[5] = _opCanonical(market, LoopV1Types.SOURCE_SEQUENCER_UPTIME, address(sequencer));
        ops[6] = _opSupportedMarket(market, true);
        ops[7] = _opFlashPool(market, address(uniswap));
        ops[8] = _opFactory(market, uniswap.factory());
        ops[9] = _opFeeTier(market, uniswap.fee());
        _commit(registry, ops, bytes32(uint256(10)));
        registry.setSourceFreshnessThreshold(LoopV1Types.SOURCE_CHAINLINK_FEED, 600);
        bytes32[] memory sourceIds = new bytes32[](5);
        address[] memory integrations = new address[](5);
        sourceIds[0] = LoopV1Types.SOURCE_MORPHO_POSITION;
        integrations[0] = address(morpho);
        sourceIds[1] = LoopV1Types.SOURCE_VAULT_NAV;
        integrations[1] = address(vault);
        sourceIds[2] = LoopV1Types.SOURCE_CHAINLINK_FEED;
        integrations[2] = address(chainlink);
        sourceIds[3] = LoopV1Types.SOURCE_SEQUENCER_UPTIME;
        integrations[3] = address(sequencer);
        sourceIds[4] = LoopV1Types.SOURCE_EXTERNAL_PROTOCOL_FINGERPRINT;
        integrations[4] = address(uniswap);
        _installFingerprints(sourceIds, integrations, bytes32(uint256(11)));
    }

    function _configureAllFingerprints() private {
        _configureRiskRegistry();
        bytes32[] memory sourceIds = new bytes32[](1);
        address[] memory integrations = new address[](1);
        sourceIds[0] = LoopV1Types.SOURCE_CURVE_QUOTE;
        integrations[0] = address(curve);
        _installFingerprints(sourceIds, integrations, bytes32(uint256(31)));
    }

    function _newRouter() private returns (LoopFeeRouter) {
        return new LoopFeeRouter(registry, owner, address(0xFEE1), address(0xFEE2));
    }

    function _bit(LoopV1Types.StateBit bit_) private pure returns (uint16) {
        return uint16(1) << uint8(bit_);
    }

    function _identity() private view returns (LoopV1EIP712.ActionIdentity memory identity) {
        identity.owner = other;
        identity.chainId = block.chainid;
        identity.verifyingContract = address(this);
        identity.market = market;
        identity.executor = address(this);
        identity.registryVersion = registry.registryVersion();
        identity.registryMerkleRoot = registry.registryMerkleRoot();
    }

    function _emptyActionEvidence(uint16 stateBitmap)
        private
        view
        returns (LoopV1Types.ActionEvidence memory evidence)
    {
        evidence.actionId = keccak256("action");
        evidence.evidenceSetId = keccak256("evidence");
        evidence.owner = other;
        evidence.market = market;
        evidence.blockNumber = block.number;
        evidence.stateBitmap = stateBitmap;
        evidence.sources = new LoopV1Types.EvidenceSource[](0);
    }

    function _rehash(LoopV1Types.ExternalProtocolFingerprint memory fp)
        private
        pure
        returns (LoopV1Types.ExternalProtocolFingerprint memory)
    {
        fp.fingerprintHash = keccak256(
            abi.encode(
                fp.integrationId,
                fp.integration,
                fp.hardEqualityHash,
                fp.toleranceBandHash,
                fp.liveBaselineHash,
                fp.registryVersion
            )
        );
        return fp;
    }

    function _installFingerprints(bytes32[] memory sourceIds, address[] memory integrations, bytes32 root) private {
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](sourceIds.length);
        for (uint256 i = 0; i < sourceIds.length; i++) {
            bytes32 integrationId = _integrationId(sourceIds[i]);
            registry.fingerprints_().queueExternalFingerprintUpdate(integrationId, _fingerprint(sourceIds[i], integrations[i]));
            ops[i] = _opApplyFingerprint(integrationId);
        }
        vm.roll(block.number + 130_000);
        _commit(registry, ops, root);
    }

    function _integrationId(bytes32 sourceId) private view returns (bytes32) {
        return keccak256(abi.encodePacked("wstdiem.integration", market, sourceId));
    }

    function _fingerprint(bytes32 sourceId, address integration)
        private
        view
        returns (LoopV1Types.ExternalProtocolFingerprint memory fp)
    {
        bytes32 integrationId = _integrationId(sourceId);
        fp.integrationId = integrationId;
        fp.integration = integration;
        (fp.hardEqualityHash, fp.toleranceBandHash, fp.liveBaselineHash) = _fingerprintHashes(sourceId, integration);
        fp.registryVersion = registry.registryVersion();
        fp.fingerprintHash = keccak256(
            abi.encode(
                fp.integrationId,
                fp.integration,
                fp.hardEqualityHash,
                fp.toleranceBandHash,
                fp.liveBaselineHash,
                fp.registryVersion
            )
        );
    }

    function _fingerprintHashes(bytes32 sourceId, address integration)
        private
        view
        returns (bytes32 hard, bytes32 tolerance, bytes32 live)
    {
        if (sourceId == LoopV1Types.SOURCE_MORPHO_POSITION) {
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.morpho.hard.v1",
                    integration,
                    market,
                    params.loanToken,
                    params.collateralToken,
                    params.oracle,
                    params.irm,
                    params.lltv
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.morpho.live.v1", market));
        } else if (sourceId == LoopV1Types.SOURCE_VAULT_NAV) {
            hard = keccak256(abi.encode("wstdiem.fp.vault.hard.v1", integration, vault.asset(), vault.decimals()));
            tolerance = keccak256(abi.encode("wstdiem.fp.vault.tolerance.v1", vault.nav(), uint16(50)));
            live = keccak256(abi.encode("wstdiem.fp.vault.live.v1", true, true));
        } else if (sourceId == LoopV1Types.SOURCE_CHAINLINK_FEED) {
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.chainlink.hard.v1",
                    integration,
                    chainlink.aggregator(),
                    chainlink.decimals(),
                    uint16(chainlink.roundId() >> 64)
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.chainlink.live.v1", chainlink.updatedAt()));
        } else if (sourceId == LoopV1Types.SOURCE_CURVE_QUOTE) {
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.curve.hard.v1",
                    integration,
                    curve.coin0(),
                    curve.coin1(),
                    curve.amplification(),
                    curve.feeValue()
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.curve.tolerance.v1", curve.depth(), curve.depth(), uint16(50)));
            live = keccak256(abi.encode("wstdiem.fp.curve.live.v1", block.number));
        } else if (sourceId == LoopV1Types.SOURCE_SEQUENCER_UPTIME) {
            hard = keccak256(abi.encode("wstdiem.fp.sequencer.hard.v1", integration, sequencer.decimals()));
            tolerance = keccak256(abi.encode("wstdiem.fp.none.v1"));
            live = keccak256(abi.encode("wstdiem.fp.sequencer.live.v1", sequencer.startedAt()));
        } else {
            PR5UniswapPoolMock pool = PR5UniswapPoolMock(integration);
            hard = keccak256(
                abi.encode(
                    "wstdiem.fp.uniswap.hard.v1",
                    integration,
                    pool.factory(),
                    pool.token0(),
                    pool.token1(),
                    pool.fee(),
                    pool.tickSpacing()
                )
            );
            tolerance = keccak256(abi.encode("wstdiem.fp.uniswap.tolerance.v1", pool.liquidity(), uint16(50)));
            live = keccak256(abi.encode("wstdiem.fp.uniswap.live.v1", pool.tick()));
        }
    }
}
