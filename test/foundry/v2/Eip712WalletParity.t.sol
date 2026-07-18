// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LoopV1EIP712} from "../../../contracts/v2/libraries/LoopV1EIP712.sol";
import {LoopV1Hashing} from "../../../contracts/v2/libraries/LoopV1Hashing.sol";
import {LoopV1Types} from "../../../contracts/v2/libraries/LoopV1Types.sol";

/// @dev External harness so LoopV1Hashing.hashOpen (calldata param) can be
///   invoked with an in-memory fixture struct.
contract HashOpenHarness {
    function hashOpen(LoopV1EIP712.Open calldata action, bytes32 domainSeparator) external pure returns (bytes32) {
        return LoopV1Hashing.hashOpen(action, domainSeparator);
    }
}

/// @notice Cross-language EIP-712 parity gate (Phase A).
/// @dev Asserts the contract's hashOpen reproduces the SAME digest that viem's
///   hashTypedData and the SDK's computeOpenDigest produce for a shared,
///   committed fixture (sdk/test/fixtures/eip712-open-parity.json). The SDK side
///   is asserted in sdk/test/eip712-wallet-parity.test.ts; this test locks the
///   Solidity side to the identical committed digest, so
///   contract-hashOpen == viem-hashTypedData == SDK-digest.
contract Eip712WalletParityTest is Test {
    HashOpenHarness private harness;

    function setUp() public {
        harness = new HashOpenHarness();
    }

    function testContractHashOpenMatchesSharedFixture() public view {
        string memory fixture = vm.readFile("sdk/test/fixtures/eip712-open-parity.json");
        bytes32 expectedDigest = vm.parseJsonBytes32(fixture, ".expectedDigest");

        // Domain (mirrors fixture .domain).
        bytes32 domainSeparator = keccak256(
            abi.encode(
                LoopV1EIP712.DOMAIN_SEPARATOR_TYPEHASH,
                keccak256(bytes(vm.parseJsonString(fixture, ".domain.name"))),
                keccak256(bytes(vm.parseJsonString(fixture, ".domain.version"))),
                uint256(84532),
                address(uint160(0xA1)),
                bytes32(0)
            )
        );

        // Open action (mirrors fixture .message). Literals are the committed
        // fixture values; the shared digest is read from the JSON so a fixture
        // change surfaces here as a mismatch.
        LoopV1EIP712.Open memory action = LoopV1EIP712.Open({
            identity: LoopV1EIP712.ActionIdentity({
                owner: address(0x0000000000000000000000000000000000000020),
                chainId: 84532,
                verifyingContract: address(uint160(0xA1)),
                market: bytes32(0xabababababababababababababababababababababababababababababababab),
                executor: address(0x0000000000000000000000000000000000000002),
                registryVersion: 1,
                registryMerkleRoot: bytes32(0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd),
                policyId: 0,
                nonceSlot: 0,
                nonceBit: 0
            }),
            freshness: LoopV1EIP712.Freshness({
                deadline: 1900000000,
                quoteBlockNumber: 123,
                maxQuoteAgeBlocks: 5,
                maxQuoteDeviationBps: 50
            }),
            executionKind: LoopV1Types.ExecutionKind.OWNER_DIRECT,
            mevProtectionMode: LoopV1Types.MevProtectionMode.PRIVATE_BUILDER,
            mevWaiverBits: 0,
            marketParams: LoopV1Types.MorphoMarketParams({
                loanToken: address(0x0000000000000000000000000000000000000010),
                collateralToken: address(0x0000000000000000000000000000000000000011),
                oracle: address(0x0000000000000000000000000000000000000012),
                irm: address(0x0000000000000000000000000000000000000013),
                lltv: 800000000000000000
            }),
            bounds: LoopV1EIP712.OpenBounds({
                minWstDiemReceived: 1000,
                minBorrowedDiem: 100,
                maxBorrowedDiem: 10000,
                maxSlippageBps: 25,
                maxPriceImpactBps: 25,
                maxLeverageBps: 8500,
                minHealthFactor: 1100000000000000000,
                minLiquidationDistanceBps: 500,
                maxMorphoUtilizationImpactBps: 500,
                feeCaps: LoopV1Types.FeeCaps({flashFeeCap: 100, protocolFeeCap: 50, automationFeeCap: 25})
            }),
            hashes: LoopV1EIP712.DigestHashes({
                quoteHash: bytes32(0x0101010101010101010101010101010101010101010101010101010101010101),
                spenderListHash: bytes32(0x0202020202020202020202020202020202020202020202020202020202020202),
                allowanceScheduleHash: bytes32(0x0303030303030303030303030303030303030303030303030303030303030303),
                feeCapHash: bytes32(0x0404040404040404040404040404040404040404040404040404040404040404),
                evidenceBundleHash: bytes32(0x0505050505050505050505050505050505050505050505050505050505050505)
            })
        });

        bytes32 digest = harness.hashOpen(action, domainSeparator);
        assertEq(digest, expectedDigest, "contract hashOpen != shared viem/SDK fixture digest");
    }
}
