// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {LoopAuthorization} from "../../../contracts/v2/LoopAuthorization.sol";
import {LoopExecutorBase} from "../../../contracts/v2/LoopExecutorBase.sol";
import {IEmergencyGuardian} from "../../../contracts/v2/interfaces/IEmergencyGuardian.sol";
import {ILoopRegistry} from "../../../contracts/v2/interfaces/ILoopRegistry.sol";
import {LoopRegistry} from "../../../contracts/v2/LoopRegistry.sol";
import {LoopV1ActionValidation} from "../../../contracts/v2/libraries/LoopV1ActionValidation.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Errors} from "../../../contracts/v2/libraries/LoopV1Errors.sol";
import {LoopV1ThrottleCounter} from "../../../contracts/v2/libraries/LoopV1ThrottleCounter.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";
import {DigestBuilder} from "./helpers/DigestBuilder.sol";
import {RegistryBatchHelpers} from "./helpers/RegistryBatchHelpers.sol";

contract PB3MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failApprove;
    bool public failTransfer;
    bool public failTransferFrom;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFailures(bool approveFails, bool transferFails, bool transferFromFails) external {
        failApprove = approveFails;
        failTransfer = transferFails;
        failTransferFrom = transferFromFails;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (failApprove) return false;
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfer || balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransferFrom || balanceOf[from] < amount || allowance[from][msg.sender] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PB3Oracle {
    uint256 public price = 1e18;

    function setPrice(uint256 nextPrice) external {
        price = nextPrice;
    }
}

contract PB3MorphoPosition {
    uint128 public borrowShares;
    uint128 public collateral;

    function setPosition(uint128 nextDebt, uint128 nextCollateral) external {
        borrowShares = nextDebt;
        collateral = nextCollateral;
    }

    function position(bytes32, address) external view returns (uint256 supplyShares, uint128 debt, uint128 coll) {
        return (0, borrowShares, collateral);
    }

    /// @dev 1:1 shares→assets so executor F01 conversion matches the historical test semantics.
    function market(bytes32)
        external
        view
        returns (uint128, uint128, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128, uint128)
    {
        return (0, 0, borrowShares, borrowShares, 0, 0);
    }
}

contract PB3PullingMorpho {
    PB3MockToken public immutable token;
    uint256 public pulledCollateral;

    constructor(PB3MockToken token_) {
        token = token_;
    }

    function supplyCollateral(LoopV1Types.MorphoMarketParams calldata, uint256 assets, address, bytes calldata)
        external
    {
        require(token.transferFrom(msg.sender, address(this), assets), "pull failed");
        pulledCollateral += assets;
    }

    function borrow(LoopV1Types.MorphoMarketParams calldata, uint256 assets, uint256 shares, address, address)
        external
        pure
        returns (uint256, uint256)
    {
        return (assets, shares);
    }
}

contract PB3Curve {
    uint256 public output = 1 ether;
    uint256 public depth = 100 ether;

    function setOutput(uint256 nextOutput) external {
        output = nextOutput;
    }

    function setDepth(uint256 nextDepth) external {
        depth = nextDepth;
    }

    function exchange(int128, int128, uint256, uint256 minDy) external returns (uint256) {
        if (output < minDy) revert("curve min");
        return output;
    }

    function balances(int128) external view returns (uint256) {
        return depth;
    }
}

contract PB3RiskAdapter {
    uint16 public leverageBps;
    uint16 public liquidationDistanceBps = 10_000;
    uint16 public utilizationBps;

    function setMetrics(uint16 leverage, uint16 distance, uint16 utilization) external {
        leverageBps = leverage;
        liquidationDistanceBps = distance;
        utilizationBps = utilization;
    }

    function currentLeverageBps(address, bytes32) external view returns (uint16) {
        return leverageBps;
    }

    function currentLiquidationDistanceBps(address, bytes32) external view returns (uint16) {
        return liquidationDistanceBps;
    }

    function currentUtilizationBps(bytes32) external view returns (uint16) {
        return utilizationBps;
    }

    function computeStateBitmap(bytes32, address) external pure returns (uint16) {
        return 0;
    }
}

contract PB3ThrottleHarness {
    using LoopV1ThrottleCounter for LoopV1ThrottleCounter.Counter;

    LoopV1ThrottleCounter.Counter private counter;

    function check(LoopRegistry registry) external view {
        counter.check(registry);
    }

    function recordFailure(LoopRegistry registry) external {
        counter.recordFailure(registry);
    }

    function clear() external {
        counter.clear();
    }

    function state() external view returns (uint64 windowStartBlock, uint8 failedAttempts) {
        return (counter.windowStartBlock, counter.failedAttempts);
    }
}

contract PB3ExecutorHarness is LoopExecutorBase {
    constructor(LoopAuthorization authorization, LoopRegistry registry)
        LoopExecutorBase(authorization, registry, IEmergencyGuardian(address(0)))
    {}

    function reentrancySlot() external pure returns (bytes32) {
        return WSTDIEM_REENTRANCY_SLOT;
    }

    function openSlot() external pure returns (bytes32) {
        return WSTDIEM_ARM_OPEN_SLOT;
    }

    function rebalanceSlot() external pure returns (bytes32) {
        return WSTDIEM_ARM_REBALANCE_SLOT;
    }

    function exitSlot() external pure returns (bytes32) {
        return WSTDIEM_ARM_EXIT_SLOT;
    }

    function forceExitSlot() external pure returns (bytes32) {
        return WSTDIEM_ARM_FORCE_EXIT_SLOT;
    }

    function contextHashFor(
        address owner,
        bytes32 market,
        uint8 primaryType,
        uint256 registryVersion,
        address flashProvider,
        bytes32 quoteHash,
        uint248 nonceSlot,
        uint8 nonceBit,
        uint256 deadline
    ) external view returns (bytes32) {
        FlashContext memory context;
        context.owner = owner;
        context.market = market;
        context.primaryType = primaryType;
        context.registryVersion = registryVersion;
        context.flashProvider = flashProvider;
        context.quoteHash = quoteHash;
        context.nonceSlot = nonceSlot;
        context.nonceBit = nonceBit;
        context.deadline = deadline;
        return _contextHash(context);
    }

    function safeApprove(address token, address spender, uint256 amount) external {
        _safeApprove(token, spender, amount);
    }

    function safeTransfer(address token, address to, uint256 amount) external {
        _safeTransfer(token, to, amount);
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) external {
        _safeTransferFrom(token, from, to, amount);
    }

    function sweepDust(bytes32 digest, bytes32 market, uint256 inputAmount, address token, address to) external {
        _sweepDust(digest, market, inputAmount, token, to);
    }

    function curveCheck(bytes32 market, uint256 sold, uint256 received, uint16 slippageBps, uint16 shareBps)
        external
        view
    {
        FlashContext memory context;
        context.market = market;
        context.withdrawCollateralAssets = sold;
        context.maxSlippageBps = slippageBps;
        context.maxCurvePositionShareBps = shareBps;
        _enforceCurveBounds(context, received);
    }

    function snapshot(bytes32 market, address owner, LoopV1Types.MorphoMarketParams memory params)
        external
        view
        returns (uint256 debt, uint256 collateral, uint256 healthFactor)
    {
        FlashContext memory context;
        context.market = market;
        context.owner = owner;
        context.params = params;
        PositionSnapshot memory snap = _snapshotPosition(context);
        return (snap.debt, snap.collateral, snap.healthFactor);
    }

    function enforcePost(
        uint8 primaryType,
        uint256 preDebt,
        uint256 preCollateral,
        uint256 preHealthFactor,
        uint256 minHealthFactor,
        uint16 minDistance,
        uint16 maxLeverage,
        LoopV1Types.MorphoMarketParams memory params,
        bytes32 market,
        address owner
    ) external view {
        FlashContext memory context;
        context.primaryType = primaryType;
        context.preState.debt = preDebt;
        context.preState.collateral = preCollateral;
        context.preState.healthFactor = preHealthFactor;
        context.minPostHealthFactor = minHealthFactor;
        context.minLiquidationDistanceBps = minDistance;
        context.maxLeverageBps = maxLeverage;
        context.params = params;
        context.market = market;
        context.owner = owner;
        _enforcePostState(context, LoopV1Types.LoopActionResult(0, 0, 0, true));
    }

    function _executeOpenInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }

    function _executeRebalanceInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }

    function _executeExitInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }

    function _executeAutomationInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }

    function _executeForceExitInCallback(FlashContext memory, uint256)
        internal
        pure
        override
        returns (LoopV1Types.LoopActionResult memory)
    {
        return LoopV1Types.LoopActionResult(0, 0, 0, true);
    }
}

contract PB3FixRegressionTest is RegistryBatchHelpers, Test {
    using DigestBuilder for LoopAuthorization;

    uint256 private constant OWNER_PK = 0xB333;
    address private owner = address(0xA11CE);
    LoopRegistry private registry;
    LoopAuthorization private auth;
    PB3ExecutorHarness private harness;
    PB3MockToken private token;
    PB3MorphoPosition private morpho;
    PB3Oracle private oracle;
    PB3Curve private curve;
    PB3RiskAdapter private risk;
    LoopV1Types.MorphoMarketParams private params;
    bytes32 private market;

    function setUp() public {
        registry = new LoopRegistry(address(this));
        auth = new LoopAuthorization(registry);
        harness = new PB3ExecutorHarness(auth, registry);
        token = new PB3MockToken();
        morpho = new PB3MorphoPosition();
        oracle = new PB3Oracle();
        curve = new PB3Curve();
        risk = new PB3RiskAdapter();
        params = LoopV1Types.MorphoMarketParams(address(token), address(token), address(oracle), address(0x1234), 8600);
        market = keccak256(abi.encode(params));
        registry.setLoopRiskOracleAdapter(address(risk));
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](5);
        ops[0] = _opLoopAuthorization(address(auth));
        ops[1] = _opMorpho(address(morpho));
        ops[2] = _opCurve(market, address(curve));
        ops[3] = _opMarket(market, params);
        ops[4] = _opSupportedMarket(market, true);
        _commit(registry, ops, bytes32(uint256(9)));
    }

    function testNF12_ReentrancySlotString() public view {
        assertEq(harness.reentrancySlot(), keccak256("wstdiem.loop.executor.base.reentrancy.v1"));
    }

    function testNF12_OpenSlotString() public view {
        assertEq(harness.openSlot(), keccak256("wstdiem.loop.executor.v2.arm.Open.v1"));
    }

    function testNF12_RebalanceSlotString() public view {
        assertEq(harness.rebalanceSlot(), keccak256("wstdiem.loop.executor.v2.arm.Rebalance.v1"));
    }

    function testNF12_ExitSlotString() public view {
        assertEq(harness.exitSlot(), keccak256("wstdiem.loop.executor.v2.arm.Exit.v1"));
    }

    function testNF12_ForceExitSlotString() public view {
        assertEq(harness.forceExitSlot(), keccak256("wstdiem.loop.force-exit-executor.arm.ForceExit.v1"));
    }

    function testNF12_ContextHashBindsNonceBit() public view {
        bytes32 one = harness.contextHashFor(owner, market, 1, 1, address(0xF1), bytes32(uint256(2)), 7, 1, 100);
        bytes32 two = harness.contextHashFor(owner, market, 1, 1, address(0xF1), bytes32(uint256(2)), 7, 2, 100);
        assertTrue(one != two);
    }

    function testNF12_ContextHashBindsQuoteHash() public view {
        bytes32 one = harness.contextHashFor(owner, market, 1, 1, address(0xF1), bytes32(uint256(2)), 7, 1, 100);
        bytes32 two = harness.contextHashFor(owner, market, 1, 1, address(0xF1), bytes32(uint256(3)), 7, 1, 100);
        assertTrue(one != two);
    }

    function testNF12_ContextHashBindsFlashProvider() public view {
        bytes32 one = harness.contextHashFor(owner, market, 1, 1, address(0xF1), bytes32(uint256(2)), 7, 1, 100);
        bytes32 two = harness.contextHashFor(owner, market, 1, 1, address(0xF2), bytes32(uint256(2)), 7, 1, 100);
        assertTrue(one != two);
    }

    function testRegistryDustBoundHasRoundingFloor() public view {
        assertEq(registry.dustBoundFor(market, 1), 1_000);
    }

    function testRegistryDustBoundUsesFiveBps() public view {
        assertEq(registry.dustBoundFor(market, 100 ether), 0.05 ether);
    }

    function testRegistryDustBoundCapsAtTenDiem() public view {
        assertEq(registry.dustBoundFor(market, 1_000_000 ether), 10 ether);
    }

    function testSweepDustBelowBoundTransfersToOwner() public {
        token.mint(address(harness), 500);
        harness.sweepDust(bytes32(uint256(1)), market, 1 ether, address(token), owner);
        assertEq(token.balanceOf(owner), 500);
    }

    function testSweepDustAboveBoundReverts() public {
        token.mint(address(harness), 1 ether);
        vm.expectRevert(LoopV1Errors.DustBoundExceeded.selector);
        harness.sweepDust(bytes32(uint256(1)), market, 1 ether, address(token), owner);
    }

    function testSafeApproveFailureUsesCanonicalError() public {
        token.setFailures(true, false, false);
        vm.expectRevert(LoopV1Errors.Erc20ApproveFailed.selector);
        harness.safeApprove(address(token), address(0xBEEF), 1);
    }

    function testSafeTransferFailureUsesCanonicalError() public {
        token.setFailures(false, true, false);
        vm.expectRevert(LoopV1Errors.Erc20TransferFailed.selector);
        harness.safeTransfer(address(token), owner, 1);
    }

    function testSafeTransferFromFailureUsesCanonicalError() public {
        token.setFailures(false, false, true);
        vm.expectRevert(LoopV1Errors.Erc20TransferFromFailed.selector);
        harness.safeTransferFrom(address(token), owner, address(harness), 1);
    }

    function testSnapshotReadsMorphoDebtAndCollateral() public {
        morpho.setPosition(10 ether, 20 ether);
        (uint256 debt, uint256 collateral,) = harness.snapshot(market, owner, params);
        assertEq(debt, 10 ether);
        assertEq(collateral, 20 ether);
    }

    function testSnapshotHealthFactorUsesOraclePrice() public {
        morpho.setPosition(10 ether, 20 ether);
        oracle.setPrice(1e18);
        (,, uint256 hf) = harness.snapshot(market, owner, params);
        assertEq(hf, 1.72 ether);
    }

    function testSnapshotDebtFreeHealthIsMax() public {
        morpho.setPosition(0, 20 ether);
        (,, uint256 hf) = harness.snapshot(market, owner, params);
        assertEq(hf, type(uint256).max);
    }

    function testPostStateDebtReducingRequiresDebtDrop() public {
        morpho.setPosition(10 ether, 20 ether);
        vm.expectRevert(LoopV1Errors.DebtNotReduced.selector);
        harness.enforcePost(
            uint8(LoopV1Types.PrimaryType.EXIT), 10 ether, 20 ether, 1 ether, 0, 0, 0, params, market, owner
        );
    }

    function testPostStateDebtReducingRequiresHealthImprovement() public {
        morpho.setPosition(9 ether, 9 ether);
        vm.expectRevert(LoopV1Errors.HealthFactorBoundFailure.selector);
        harness.enforcePost(
            uint8(LoopV1Types.PrimaryType.EXIT), 10 ether, 20 ether, 2 ether, 0, 0, 0, params, market, owner
        );
    }

    function testPostStateDebtReducingPassesWhenDebtDropsAndHealthImproves() public {
        morpho.setPosition(5 ether, 20 ether);
        harness.enforcePost(
            uint8(LoopV1Types.PrimaryType.EXIT), 10 ether, 20 ether, 1 ether, 0, 0, 0, params, market, owner
        );
    }

    function testPostStateHealthFloorReverts() public {
        morpho.setPosition(10 ether, 10 ether);
        vm.expectRevert(LoopV1Errors.HealthFactorBoundFailure.selector);
        harness.enforcePost(uint8(LoopV1Types.PrimaryType.OPEN), 0, 0, 0, 2 ether, 0, 0, params, market, owner);
    }

    function testPostStateLiquidationDistanceReverts() public {
        risk.setMetrics(0, 99, 0);
        morpho.setPosition(1 ether, 10 ether);
        vm.expectRevert(LoopV1Errors.LiquidationDistanceBoundFailure.selector);
        harness.enforcePost(uint8(LoopV1Types.PrimaryType.OPEN), 0, 0, 0, 0, 100, 0, params, market, owner);
    }

    function testPostStateLeverageReverts() public {
        risk.setMetrics(501, 10_000, 0);
        morpho.setPosition(1 ether, 10 ether);
        vm.expectRevert(LoopV1Errors.LeverageBoundFailure.selector);
        harness.enforcePost(uint8(LoopV1Types.PrimaryType.OPEN), 0, 0, 0, 0, 0, 500, params, market, owner);
    }

    function testCurveBoundsAcceptsWithinSlippageAndShare() public view {
        harness.curveCheck(market, 1 ether, 0.99 ether, 100, 1000);
    }

    function testCurveSlippageRevertsWhenReceivedBelowSignedQuote() public {
        vm.expectRevert(LoopV1Errors.CurveSlippageExceeded.selector);
        harness.curveCheck(market, 1 ether, 0.98 ether, 100, 1000);
    }

    function testCurveShareRevertsWhenSoldExceedsDepthShare() public {
        curve.setDepth(10 ether);
        vm.expectRevert(LoopV1Errors.CurveShareExceeded.selector);
        harness.curveCheck(market, 2 ether, 2 ether, 0, 1000);
    }

    function testCurveShareZeroDepthRevertsLiquidity() public {
        curve.setDepth(0);
        vm.expectRevert(LoopV1Errors.CurveLiquidityInsufficient.selector);
        harness.curveCheck(market, 1 ether, 1 ether, 0, 1000);
    }

    function testCurveShareSkippedWhenBoundZero() public {
        curve.setDepth(0);
        harness.curveCheck(market, 1 ether, 1 ether, 0, 0);
    }

    function testCurveSlippageSkippedWhenBoundZero() public view {
        harness.curveCheck(market, 1 ether, 0.5 ether, 0, 0);
    }

    function testThrottleRecordsFirstFailure() public {
        PB3ThrottleHarness throttle = new PB3ThrottleHarness();
        throttle.recordFailure(registry);
        (uint64 start, uint8 failures) = throttle.state();
        assertEq(start, block.number);
        assertEq(failures, 1);
    }

    function testThrottleIncrementsWithinWindow() public {
        PB3ThrottleHarness throttle = new PB3ThrottleHarness();
        throttle.recordFailure(registry);
        throttle.recordFailure(registry);
        (, uint8 failures) = throttle.state();
        assertEq(failures, 2);
    }

    function testThrottleCheckRevertsAtLimit() public {
        PB3ThrottleHarness throttle = new PB3ThrottleHarness();
        for (uint256 i = 0; i < registry.maxFailedAttemptsPerWindow(); i++) {
            throttle.recordFailure(registry);
        }
        vm.expectRevert(LoopV1Errors.AutomationAttemptThrottled.selector);
        throttle.check(registry);
    }

    function testThrottleWindowResetStartsNewWindow() public {
        PB3ThrottleHarness throttle = new PB3ThrottleHarness();
        throttle.recordFailure(registry);
        vm.roll(block.number + registry.attemptThrottleWindowBlocks() + 1);
        throttle.recordFailure(registry);
        (uint64 start, uint8 failures) = throttle.state();
        assertEq(start, block.number);
        assertEq(failures, 1);
    }

    function testThrottleClearResetsState() public {
        PB3ThrottleHarness throttle = new PB3ThrottleHarness();
        throttle.recordFailure(registry);
        throttle.clear();
        (uint64 start, uint8 failures) = throttle.state();
        assertEq(start, 0);
        assertEq(failures, 0);
    }

    function testHarvestOpenBlockedDuringCooling() public {
        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(registry.lastHarvestBlock.selector, market),
            abi.encode(block.number)
        );
        vm.expectRevert(LoopV1Errors.HarvestConvergencePending.selector);
        LoopV1ActionValidation.validateHarvest(registry, market, uint8(LoopV1Types.PrimaryType.OPEN), 1);
    }

    function testHarvestRiskReducingRebalanceBypassesCooling() public {
        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(registry.lastHarvestBlock.selector, market),
            abi.encode(block.number)
        );
        LoopV1ActionValidation.validateHarvest(registry, market, uint8(LoopV1Types.PrimaryType.REBALANCE), 0);
    }

    function testHarvestForceExitBypassesCooling() public {
        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(registry.lastHarvestBlock.selector, market),
            abi.encode(block.number)
        );
        LoopV1ActionValidation.validateHarvest(registry, market, uint8(LoopV1Types.PrimaryType.FORCE_EXIT), 1);
    }

    function testLoopActionResultSuccessFlagCanRepresentSuccess() public pure {
        LoopV1Types.LoopActionResult memory result = LoopV1Types.LoopActionResult(1, 2, 3, true);
        assertTrue(result.succeeded);
    }

    function testLoopActionResultSuccessFlagCanRepresentFailure() public pure {
        LoopV1Types.LoopActionResult memory result = LoopV1Types.LoopActionResult(0, 0, 0, false);
        assertFalse(result.succeeded);
    }

    function testArmingTypehashSnapshotValue() public pure {
        assertEq(
            LoopV1EIP712.ARMING_CONTEXT_TYPEHASH,
            keccak256(
                "ArmingContext(uint256 chainId,address executor,bytes4 callbackSelector,uint8 primaryType,address owner,bytes32 market,uint256 registryVersion,address flashProvider,bytes32 routeId,bytes32 quoteHash,uint256 nonceSlot,uint8 nonceBit,uint256 deadline)"
            )
        );
    }

    function testAuthorizationApprovesMorphoForTokenInCalls() public {
        address signer = vm.addr(OWNER_PK);
        PB3PullingMorpho pullingMorpho = new PB3PullingMorpho(token);
        ILoopRegistry.BatchOp[] memory ops = new ILoopRegistry.BatchOp[](2);
        ops[0] = _opMorpho(address(pullingMorpho));
        ops[1] = _opExecutor(uint8(LoopV1Types.PrimaryType.OPEN), address(this));
        _commit(registry, ops, bytes32(uint256(10)));
        registry.setPermissionlessCallerAllowed(address(this), true);
        token.mint(address(auth), 1 ether);

        LoopV1EIP712.Open memory action = _openAction(signer);
        bytes32 digest = auth.openDigest(action);
        auth.validateOpen(digest, _sign(OWNER_PK, digest), action, _emptyEvidence(signer), bytes32(0));
        auth.executeMorpho(
            digest,
            _sign(OWNER_PK, digest),
            abi.encodeWithSelector(
                bytes4(keccak256("supplyCollateral((address,address,address,address,uint256),uint256,address,bytes)")),
                params,
                1 ether,
                signer,
                ""
            )
        );

        assertEq(pullingMorpho.pulledCollateral(), 1 ether);
        assertEq(token.allowance(address(auth), address(pullingMorpho)), 0);
    }

    function _openAction(address signer) private view returns (LoopV1EIP712.Open memory action) {
        action.identity = LoopV1EIP712.ActionIdentity({
            owner: signer,
            chainId: block.chainid,
            verifyingContract: address(auth),
            market: market,
            executor: address(this),
            registryVersion: registry.registryVersion(),
            registryMerkleRoot: registry.registryMerkleRoot(),
            policyId: 0,
            nonceSlot: 999,
            nonceBit: 1
        });
        action.freshness = LoopV1EIP712.Freshness({
            deadline: block.timestamp + 1 days,
            quoteBlockNumber: block.number,
            maxQuoteAgeBlocks: 10,
            maxQuoteDeviationBps: 0
        });
        action.executionKind = LoopV1Types.ExecutionKind.KEEPER_PERMISSIONLESS;
        action.mevProtectionMode = LoopV1Types.MevProtectionMode.PRIVATE_BUILDER;
        action.marketParams = params;
        action.bounds.minWstDiemReceived = 1 ether;
        action.bounds.maxBorrowedDiem = 1 ether;
        action.hashes.evidenceBundleHash = _emptyEvidenceHash(signer);
    }

    function _emptyEvidence(address signer) private view returns (LoopV1Types.ActionEvidence memory evidence) {
        evidence.owner = signer;
        evidence.market = market;
        evidence.blockNumber = block.number;
    }

    function _emptyEvidenceHash(address signer) private view returns (bytes32) {
        LoopV1Types.EvidenceSource[] memory sources = new LoopV1Types.EvidenceSource[](0);
        return keccak256(
            abi.encode(
                LoopV1EIP712.EVIDENCE_BUNDLE_TYPEHASH,
                bytes32(0),
                bytes32(0),
                signer,
                market,
                block.number,
                uint16(0),
                keccak256(abi.encode(sources))
            )
        );
    }

    function _sign(uint256 privateKey, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
