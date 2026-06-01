// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

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
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

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

    uint128 constant ALICE_RENT = 1e15; // currency1 per block
    uint128 constant BOB_RENT = 3e15;
    uint256 constant DEPOSIT = 1e18;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

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
    }

    // ── helpers ──

    function _bid(address who, uint128 rate, uint256 deposit) internal {
        MockERC20 token = MockERC20(Currency.unwrap(currency1));
        token.mint(who, deposit);
        vm.startPrank(who);
        token.approve(address(hook), deposit);
        hook.bid(poolKey, rate, deposit);
        vm.stopPrank();
    }

    function _becomeManager(address who, uint128 rate) internal {
        _bid(who, rate, DEPOSIT);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);
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
        _swap();
    }

    // ── auction promotion ──

    function test_bid_promotesAfterKBlocks() public {
        _bid(alice, ALICE_RENT, DEPOSIT);
        hook.poke(poolId);
        assertEq(hook.getLease(poolId).manager, address(0), "promoted too early");

        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);

        HarbergerAuction.Lease memory l = hook.getLease(poolId);
        assertEq(l.manager, alice, "alice should be manager");
        assertEq(l.rentRate, ALICE_RENT);
    }

    function test_higherBid_displacesManager() public {
        _becomeManager(alice, ALICE_RENT);

        _bid(bob, BOB_RENT, DEPOSIT);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);

        assertEq(hook.getLease(poolId).manager, bob, "bob should displace alice");
        assertGt(hook.withdrawable(poolId, alice), 0, "alice should be refunded");
    }

    // ── rent accrual + distribution (the provable-economics core) ──

    function test_rentAccruesToPool() public {
        _becomeManager(alice, ALICE_RENT);
        assertEq(hook.getLease(poolId).accruedRent, 0);

        vm.roll(block.number + 5);
        hook.poke(poolId);

        assertEq(hook.getLease(poolId).accruedRent, uint256(ALICE_RENT) * 5, "rent miscounted");
    }

    function test_rentDonatedToLPs_onSwap() public {
        _becomeManager(alice, ALICE_RENT);

        vm.roll(block.number + 5);
        _swap(); // beforeSwap charges 5 blocks of rent; afterSwap donates it to LPs

        assertEq(hook.totalRentDonated(poolId), uint256(ALICE_RENT) * 5, "rent not donated");
        assertEq(hook.getLease(poolId).accruedRent, 0, "accrued should be flushed");
    }

    /// @notice Conservation invariant: every unit of rent charged is either pending or donated to LPs.
    function test_conservation_noRentLeaks() public {
        _becomeManager(alice, ALICE_RENT);

        vm.roll(block.number + 7);
        _swap();

        HarbergerAuction.Lease memory l = hook.getLease(poolId);
        assertEq(l.totalRentCharged, hook.totalRentDonated(poolId) + l.accruedRent, "rent leaked");
        assertGt(l.totalRentCharged, 0);
    }

    // ── manager fee control ──

    function test_managerSetsFee_andItApplies() public {
        _becomeManager(alice, ALICE_RENT);

        uint24 newFee = 10_000; // 1%
        vm.prank(alice);
        hook.setFee(poolId, newFee);

        assertEq(hook.currentFee(poolId), newFee);
        _swap();
    }

    function test_setFee_revertsAboveMax() public {
        _becomeManager(alice, ALICE_RENT);

        uint24 tooHigh = hook.F_MAX() + 1;
        vm.prank(alice);
        vm.expectRevert(HarbergerAuction.FeeTooHigh.selector);
        hook.setFee(poolId, tooHigh);
    }

    function test_bid_revertsIfDepositTooSmall() public {
        MockERC20 token = MockERC20(Currency.unwrap(currency1));
        token.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        token.approve(address(hook), DEPOSIT);
        vm.expectRevert(HarbergerAuction.DepositTooSmall.selector);
        hook.bid(poolKey, ALICE_RENT, 1);
        vm.stopPrank();
    }
}
