// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {MaestroHook} from "../src/MaestroHook.sol";
import {HarbergerAuction} from "../src/auction/HarbergerAuction.sol";

contract MaestroHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    Currency currency0;
    Currency currency1;

    PoolKey poolKey;
    MaestroHook hook;
    PoolId poolId;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint128 constant ALICE_RENT = 2 gwei;
    uint128 constant BOB_RENT = 5 gwei;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        // Hook address must encode its permission flags.
        address flags = address(
            uint160(
                Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
                    | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            ) ^ (0x4444 << 144)
        );
        deployCodeTo("MaestroHook.sol:MaestroHook", abi.encode(poolManager), flags);
        hook = MaestroHook(flags);

        // Dynamic-fee pool so the manager's fee can be applied via beforeSwap.
        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        // Full-range liquidity.
        int24 tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);
        uint128 liquidityAmount = 100e18;
        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );
        positionManager.mint(
            poolKey, tickLower, tickUpper, liquidityAmount, amount0 + 1, amount1 + 1, address(this), block.timestamp, Constants.ZERO_BYTES
        );

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _swap() internal returns (BalanceDelta) {
        return swapRouter.swapExactTokensForTokens({
            amountIn: 1e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    // ── default state ──

    function test_defaultFee_whenNoManager() public {
        assertEq(hook.currentFee(poolId), hook.DEFAULT_FEE());
        _swap(); // must not revert on a dynamic-fee pool with no manager
    }

    // ── auction promotion ──

    function test_bid_promotesAfterKBlocks() public {
        vm.prank(alice);
        hook.bid{value: 1 ether}(poolId, ALICE_RENT);

        // Before the K-block delay, alice is only the pending bidder.
        hook.poke(poolId);
        assertEq(hook.getLease(poolId).manager, address(0), "promoted too early");

        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);

        HarbergerAuction.Lease memory l = hook.getLease(poolId);
        assertEq(l.manager, alice, "alice should be manager");
        assertEq(l.rentRate, ALICE_RENT);
    }

    function test_higherBid_displacesManager() public {
        vm.prank(alice);
        hook.bid{value: 1 ether}(poolId, ALICE_RENT);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);
        assertEq(hook.getLease(poolId).manager, alice);

        vm.prank(bob);
        hook.bid{value: 1 ether}(poolId, BOB_RENT);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);

        assertEq(hook.getLease(poolId).manager, bob, "bob should displace alice");
        assertGt(hook.withdrawable(alice), 0, "alice should be refunded remaining deposit");
    }

    // ── rent accrual (the provable-economics core) ──

    function test_rentAccruesToPool() public {
        vm.prank(alice);
        hook.bid{value: 1 ether}(poolId, ALICE_RENT);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId); // alice becomes manager; accrued rent resets to 0 here

        assertEq(hook.getLease(poolId).accruedRent, 0);

        uint256 blocksElapsed = 5;
        vm.roll(block.number + blocksElapsed);
        hook.poke(poolId);

        assertEq(hook.getLease(poolId).accruedRent, uint256(ALICE_RENT) * blocksElapsed, "rent miscounted");
    }

    // ── manager fee control ──

    function test_managerSetsFee_andItApplies() public {
        vm.prank(alice);
        hook.bid{value: 1 ether}(poolId, ALICE_RENT);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);

        uint24 newFee = 10_000; // 1%
        vm.prank(alice);
        hook.setFee(poolId, newFee);

        assertEq(hook.currentFee(poolId), newFee);
        _swap(); // swap honoring the manager's fee must not revert
    }

    function test_setFee_revertsAboveMax() public {
        vm.prank(alice);
        hook.bid{value: 1 ether}(poolId, ALICE_RENT);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);

        uint24 tooHigh = hook.F_MAX() + 1;
        vm.prank(alice);
        vm.expectRevert(HarbergerAuction.FeeTooHigh.selector);
        hook.setFee(poolId, tooHigh);
    }

    function test_bid_revertsIfDepositTooSmall() public {
        vm.prank(alice);
        vm.expectRevert(HarbergerAuction.DepositTooSmall.selector);
        hook.bid{value: 1}(poolId, ALICE_RENT);
    }
}
