// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {MockPyth} from "@pythnetwork/pyth-sdk-solidity/MockPyth.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

import {BaseTest} from "./utils/BaseTest.sol";
import {MaestroHook} from "../src/MaestroHook.sol";
import {ManagerCallback} from "../src/reactive/ManagerCallback.sol";

/// @notice Full product lifecycle in one flow — the "does the whole thing work together" test.
///         deposit -> auction -> autonomous manager -> swap -> rent to LP -> oracle move ->
///         autonomous reposition -> swap -> claim rent -> withdraw.
contract EndToEndTest is BaseTest {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    MaestroHook hook;
    PoolId poolId;
    MockPyth pyth;
    ManagerCallback mgr;

    bytes32 constant PRICE_ID = bytes32(uint256(0xBEEF));
    address callbackProxy = makeAddr("reactiveCallbackProxy");
    address lp = makeAddr("lp");

    uint128 constant RENT = 1e15;
    uint256 constant BOND = 5e18;

    function setUp() public {
        vm.warp(1_000_000);
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
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        pyth = new MockPyth(60, 1);
        hook.setOracle(IPyth(address(pyth)), PRICE_ID, 120);
        vm.deal(address(this), 1 ether);
    }

    function _pushPrice(int64 price) internal {
        bytes[] memory upd = new bytes[](1);
        upd[0] = pyth.createPriceFeedUpdateData(PRICE_ID, price, 1, -8, price, 1, uint64(block.timestamp));
        pyth.updatePriceFeeds{value: pyth.getUpdateFee(upd)}(upd);
    }

    function _swap() internal returns (BalanceDelta) {
        return swapRouter.swapExactTokensForTokens({
            amountIn: 5e17,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    /// @dev Absolute roll targets are used deliberately: with via_ir the compiler caches
    ///      block.number within a function frame, so chained `block.number + N` rolls would
    ///      compute off a stale base. Absolute targets sidestep that test-only quirk.
    function test_fullLifecycle() public {
        // ── 1) LP deposits liquidity through the hook ──
        MockERC20(Currency.unwrap(currency0)).mint(lp, 100e18);
        MockERC20(Currency.unwrap(currency1)).mint(lp, 100e18);
        vm.startPrank(lp);
        MockERC20(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        uint256 shares = hook.deposit(100e18, 100e18);
        vm.stopPrank();
        assertGt(shares, 0, "1) LP got shares");
        assertGt(hook.positionLiquidity(), 0, "1) pool has liquidity");

        // ── 2) Autonomous manager (ManagerCallback) wins the auction ──
        mgr = new ManagerCallback(callbackProxy, hook, poolKey);
        MockERC20(Currency.unwrap(currency1)).mint(address(mgr), BOND);
        mgr.enterAuction(RENT, BOND);
        vm.roll(20); // past bid + K
        hook.poke(poolId);
        assertEq(hook.getLease(poolId).manager, address(mgr), "2) ManagerCallback is manager");

        // ── 3) Trading accrues rent that flows to the LP ──
        vm.roll(30); // +10 blocks of rent
        _swap();
        uint256 rent1 = hook.pendingRent(lp);
        assertGt(rent1, 0, "3) rent accrued to LP");

        // ── 4) Price moves; the autonomous manager repositions toward the true price ──
        _pushPrice(110000000); // 1.10 -> oracle tick ~953
        assertGt(hook.oracleTick(), 800, "4) oracle reflects the move");
        // Simulate the Reactive relay: authorized proxy delivers the reposition the RSC computed.
        vm.prank(callbackProxy);
        mgr.repositionTo(address(this), -120, 1080); // band straddles current tick, reaches the oracle
        assertEq(hook.tickUpper(), 1080, "4) liquidity concentrated toward true price");
        assertLe(hook.tickLower(), 0, "4) band stays active");

        // ── 5) More trading, more rent ──
        vm.roll(40); // +10 more blocks of rent
        _swap();
        assertGt(hook.pendingRent(lp), rent1, "5) rent keeps accruing to LP");

        // ── 6) LP claims rent and withdraws principal ──
        uint256 c1Before = MockERC20(Currency.unwrap(currency1)).balanceOf(lp);
        vm.startPrank(lp);
        hook.claimRent();
        hook.withdraw(hook.sharesOf(lp));
        vm.stopPrank();

        assertEq(hook.sharesOf(lp), 0, "6) LP fully withdrawn");
        assertGt(MockERC20(Currency.unwrap(currency1)).balanceOf(lp), c1Before, "6) LP received rent + principal");

        // ── 7) Conservation: rent was charged and fully flushed into the LP accumulator ──
        MaestroHook.Lease memory l = hook.getLease(poolId);
        assertGt(l.totalRentCharged, 0, "7) rent was actually charged");
        assertEq(l.accruedRent, 0, "7) all charged rent was flushed to LP shareholders");
    }
}
