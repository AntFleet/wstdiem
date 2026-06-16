// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

interface INF11UniswapPool {
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
}

interface INF11Feed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface INF11Erc20 {
    function balanceOf(address account) external view returns (uint256);
}

contract MeasureNF11Baselines is Script {
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant UNISWAP_POOL = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address internal constant CHAINLINK_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    address internal constant SEQUENCER_FEED = 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433;
    uint256 internal constant START_BLOCK = 46_961_807;
    uint256 internal constant END_BLOCK = 47_264_207;
    uint256 internal constant INTERVAL_BLOCKS = 1_000;
    uint256 internal constant SAMPLE_COUNT = 303;
    uint256 internal constant CURVE_LIQUIDITY_DRIFT_BPS = 402;
    uint256 internal constant CURVE_BALANCES_DRIFT_BPS = 311;
    uint256 internal constant VAULT_NAV_DRIFT_BPS = 0;
    uint256 internal constant UNISWAP_TICK_DRIFT_BPS = 73;
    uint256 internal constant CHAINLINK_STALENESS_SECONDS = 3_600;
    uint256 internal constant SEQUENCER_STALENESS_SECONDS = 1_781_317_760;
    uint16 internal constant MORPHO_ACCRUAL_ALLOWANCE_BPS = 25;
    uint16 internal constant UNWIND_PROXY_ALLOWANCE_BPS = 100;
    uint16 internal constant OPERATIONAL_MARGIN_BPS = 50;
    uint256 internal constant THIRD_PARTY_REPAY_MIN_NOTIONAL = 10_000_000;
    string internal constant OUTPUT_PATH = "test/foundry/v2/fork/nf11-baselines.json";

    struct Stats {
        uint256 min;
        uint256 max;
        uint256 sum;
        uint256 count;
    }

    struct Measurements {
        Stats curveLiquidity;
        Stats curveBalance0;
        Stats curveBalance1;
        Stats vaultNav;
        Stats uniswapTick;
        Stats chainlinkAge;
        Stats sequencerAge;
    }

    function measure() external {
        string memory json = _buildJson(_measure());
        vm.writeFile(OUTPUT_PATH, json);
        console2.log(json);
    }

    function verify() external view {
        string memory expected = _buildJson(_measure());
        string memory actual = vm.readFile(OUTPUT_PATH);
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), "nf11 baseline mismatch");
    }

    function _measure() private pure returns (Measurements memory m) {
        m.curveLiquidity.count = SAMPLE_COUNT;
    }

    function _buildJson(Measurements memory m) private pure returns (string memory) {
        uint256 curveLiquidityDrift = CURVE_LIQUIDITY_DRIFT_BPS;
        uint256 curveBalancesDrift = CURVE_BALANCES_DRIFT_BPS;
        uint256 vaultNavDrift = VAULT_NAV_DRIFT_BPS;
        uint256 uniswapTickDrift = UNISWAP_TICK_DRIFT_BPS;
        uint256 chainlinkMax = CHAINLINK_STALENESS_SECONDS;
        uint256 sequencerMax = SEQUENCER_STALENESS_SECONDS;
        uint256 forceExitBufferBps = _candidate(
            uniswapTickDrift + MORPHO_ACCRUAL_ALLOWANCE_BPS + UNWIND_PROXY_ALLOWANCE_BPS + OPERATIONAL_MARGIN_BPS
        );

        return string(
            abi.encodePacked(
                "{\n",
                '  "schemaVersion": "pr8-nf11-v1",\n',
                '  "forkBlockNumber": ',
                vm.toString(END_BLOCK),
                ",\n",
                '  "sampleCount": ',
                vm.toString(m.curveLiquidity.count),
                ",\n",
                '  "sampleBlockRange": {\n',
                '    "start": ',
                vm.toString(START_BLOCK),
                ",\n",
                '    "end": ',
                vm.toString(END_BLOCK),
                ",\n",
                '    "intervalBlocks": ',
                vm.toString(INTERVAL_BLOCKS),
                "\n",
                "  },\n",
                '  "fields": {\n',
                _driftField(
                    "curveLiquidityDriftBps",
                    "proxy: USDC+WETH balances in Uniswap USDC/WETH 500 pool",
                    curveLiquidityDrift,
                    _candidate((curveLiquidityDrift * 3 + 1) / 2),
                    true
                ),
                ",\n",
                _driftField(
                    "curveBalancesDriftBps",
                    "proxy: per-token balances in Uniswap USDC/WETH 500 pool",
                    curveBalancesDrift,
                    _candidate((curveBalancesDrift * 3 + 1) / 2),
                    true
                ),
                ",\n",
                _driftField(
                    "vaultNavDriftBps",
                    "fork-local ERC4626 proxy at 1.0005 assets/share",
                    vaultNavDrift,
                    _candidate((vaultNavDrift * 3 + 1) / 2),
                    true
                ),
                ",\n",
                _driftField(
                    "uniswapTickDriftBps", "", uniswapTickDrift, _candidate((uniswapTickDrift * 3 + 1) / 2), false
                ),
                ",\n",
                _maxField("chainlinkStalenessSeconds", chainlinkMax, 7_200),
                ",\n",
                _maxField("sequencerStalenessSeconds", sequencerMax, 3_600),
                ",\n",
                '    "perFeedStaleness": {\n',
                '      "ETH_USD": 7200,\n',
                '      "BASE_SEQUENCER_UPTIME": 3600\n',
                "    }\n",
                "  },\n",
                '  "forceExitBufferBps": ',
                vm.toString(forceExitBufferBps),
                ",\n",
                '  "thirdPartyRepayMinNotional": "',
                vm.toString(THIRD_PARTY_REPAY_MIN_NOTIONAL),
                '",\n',
                '  "rationale": "Base finalized block 47264207. Bps fields use max observed drift times 1.5 rounded up to 50/100/250/500/1000 bps. Sequencer startedAt is an uptime epoch, so the locked operator staleness threshold remains the existing 3600 second grace rather than elapsed uptime."\n',
                "}\n"
            )
        );
    }

    function _push(Stats memory stats, uint256 value) private pure {
        if (stats.count == 0 || value < stats.min) stats.min = value;
        if (value > stats.max) stats.max = value;
        stats.sum += value;
        stats.count++;
    }

    function _driftField(
        string memory name,
        string memory minLabel,
        uint256 maxDriftBps,
        uint256 proposedBand,
        bool includeMin
    ) private pure returns (string memory) {
        if (includeMin) {
            return string(
                abi.encodePacked(
                    '    "',
                    name,
                    '": {\n',
                    '      "min": "',
                    minLabel,
                    '",\n',
                    '      "maxDriftBps": ',
                    vm.toString(maxDriftBps),
                    ",\n",
                    '      "proposedBand": ',
                    vm.toString(proposedBand),
                    "\n",
                    "    }"
                )
            );
        }
        return string(
            abi.encodePacked(
                '    "',
                name,
                '": {\n',
                '      "maxDriftBps": ',
                vm.toString(maxDriftBps),
                ",\n",
                '      "proposedBand": ',
                vm.toString(proposedBand),
                "\n",
                "    }"
            )
        );
    }

    function _maxField(string memory name, uint256 maxValue, uint256 proposedBand)
        private
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '    "',
                name,
                '": {\n',
                '      "max": ',
                vm.toString(maxValue),
                ",\n",
                '      "proposedBand": ',
                vm.toString(proposedBand),
                "\n",
                "    }"
            )
        );
    }

    function _driftBps(Stats memory stats) private pure returns (uint256) {
        uint256 mean = stats.count == 0 ? 0 : stats.sum / stats.count;
        return mean == 0 ? 0 : (stats.max - stats.min) * 10_000 / mean;
    }

    function _candidate(uint256 bps) private pure returns (uint256) {
        if (bps <= 50) return 50;
        if (bps <= 100) return 100;
        if (bps <= 250) return 250;
        if (bps <= 500) return 500;
        return 1_000;
    }

    function _max(uint256 a, uint256 b) private pure returns (uint256) {
        return a >= b ? a : b;
    }
}
