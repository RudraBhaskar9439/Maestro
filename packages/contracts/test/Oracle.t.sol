// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {MockPyth} from "@pythnetwork/pyth-sdk-solidity/MockPyth.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

import {BaseTest} from "./utils/BaseTest.sol";
import {MaestroHook} from "../src/MaestroHook.sol";
import {HarbergerAuction} from "../src/auction/HarbergerAuction.sol";

/// @notice Phase 5: Pyth-powered, LVR-aware concentration. The manager concentrates liquidity
///         around the TRUE (oracle) price rather than the stale pool tick.
contract OracleTest is BaseTest {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    MaestroHook hook;
    PoolId poolId;
    MockPyth mockPyth;

    bytes32 constant PRICE_ID = bytes32(uint256(0xBEEF));
    address lp = makeAddr("lp");
    address manager = makeAddr("manager");
    uint128 constant RENT = 1e15;
    uint256 constant BOND = 1e18;

    function setUp() public {
        vm.warp(1_000_000); // so Pyth freshness checks don't underflow
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                    | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            ) ^ (0x4444 << 144)
        );
        deployCodeTo("MaestroHook.sol:MaestroHook", abi.encode(poolManager), flags);
        hook = MaestroHook(flags);

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1); // pool tick == 0

        mockPyth = new MockPyth(60, 1);
        hook.setOracle(IPyth(address(mockPyth)), PRICE_ID, 120);
        vm.deal(address(this), 1 ether);

        // LP liquidity through the hook.
        MockERC20(Currency.unwrap(currency0)).mint(lp, 100e18);
        MockERC20(Currency.unwrap(currency1)).mint(lp, 100e18);
        vm.startPrank(lp);
        MockERC20(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.deposit(100e18, 100e18);
        vm.stopPrank();
    }

    function _pushPrice(int64 price, int32 expo) internal {
        bytes[] memory upd = new bytes[](1);
        upd[0] = mockPyth.createPriceFeedUpdateData(PRICE_ID, price, 1, expo, price, 1, uint64(block.timestamp));
        uint256 fee = mockPyth.getUpdateFee(upd);
        mockPyth.updatePriceFeeds{value: fee}(upd);
    }

    function _becomeManager(address who) internal {
        MockERC20(Currency.unwrap(currency1)).mint(who, BOND);
        vm.startPrank(who);
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), BOND);
        hook.bid(poolKey, RENT, BOND);
        vm.stopPrank();
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);
    }

    // ── oracle price → tick ──

    function test_oracleTick_atParity() public {
        _pushPrice(1e8, -8); // ratio 1.0
        assertApproxEqAbs(int256(hook.oracleTick()), 0, 1, "parity should be ~tick 0");
    }

    function test_oracleTick_movesWithPrice() public {
        _pushPrice(110000000, -8); // ratio 1.10
        int24 t = hook.oracleTick();
        assertGt(t, 800, "1.10 should be ~tick 953");
        assertLt(t, 1100);
    }

    // ── the headline: concentrate around the TRUE price ──

    function test_repositionToOracle_tracksTruePrice() public {
        _becomeManager(manager);
        _pushPrice(110000000, -8); // true price 1.10 (~tick 953) while pool sits at tick 0

        vm.prank(manager);
        hook.repositionToOracle(120);

        // Band must stay active (straddle current tick 0) AND reach toward the oracle tick.
        assertLe(hook.tickLower(), 0, "must straddle current tick");
        assertGt(hook.tickUpper(), 900, "must extend toward the oracle price");
        assertGt(hook.positionLiquidity(), 0);
    }

    function test_repositionToOracle_onlyManager() public {
        _becomeManager(manager);
        _pushPrice(1e8, -8);

        vm.prank(lp); // not manager
        vm.expectRevert(HarbergerAuction.NotManager.selector);
        hook.repositionToOracle(120);
    }

    function test_setOracle_onlyOnce() public {
        vm.expectRevert(MaestroHook.OracleAlreadySet.selector);
        hook.setOracle(IPyth(address(mockPyth)), PRICE_ID, 60);
    }
}
