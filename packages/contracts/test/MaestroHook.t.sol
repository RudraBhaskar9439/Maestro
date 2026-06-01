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
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

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

    address alice = makeAddr("alice"); // LP
    address manager = makeAddr("manager"); // auction manager

    uint128 constant RENT = 1e15; // currency1 per block
    uint256 constant DEPOSIT_BOND = 1e18; // auction deposit

    function setUp() public {
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
    }

    // ── helpers ──

    function _fundAndApprove(address who, uint256 amount) internal {
        MockERC20(Currency.unwrap(currency0)).mint(who, amount);
        MockERC20(Currency.unwrap(currency1)).mint(who, amount);
        vm.startPrank(who);
        MockERC20(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        vm.stopPrank();
    }

    function _depositLP(address who, uint256 amount) internal returns (uint256 shares) {
        _fundAndApprove(who, amount);
        vm.prank(who);
        shares = hook.deposit(amount, amount);
    }

    function _becomeManager(address who, uint128 rate) internal {
        MockERC20(Currency.unwrap(currency1)).mint(who, DEPOSIT_BOND);
        vm.startPrank(who);
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), DEPOSIT_BOND);
        hook.bid(poolKey, rate, DEPOSIT_BOND);
        vm.stopPrank();
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

    // ── vault: deposit / withdraw ──

    function test_deposit_mintsSharesAndLiquidity() public {
        uint256 shares = _depositLP(alice, 100e18);
        assertGt(shares, 0, "no shares minted");
        assertEq(hook.sharesOf(alice), shares);
        assertGt(hook.positionLiquidity(), 0, "no liquidity");
        assertEq(hook.totalShares(), shares);
    }

    function test_withdraw_returnsTokens() public {
        uint256 shares = _depositLP(alice, 100e18);
        uint256 bal0Before = MockERC20(Currency.unwrap(currency0)).balanceOf(alice);

        vm.prank(alice);
        hook.withdraw(shares);

        assertEq(hook.sharesOf(alice), 0);
        assertEq(hook.positionLiquidity(), 0);
        assertGt(MockERC20(Currency.unwrap(currency0)).balanceOf(alice), bal0Before, "no tokens returned");
    }

    function test_swap_usesVaultLiquidity() public {
        _depositLP(alice, 100e18);
        _swap(); // must route against hook-owned liquidity without reverting
    }

    /// @dev External entrypoint so expectRevert binds to the whole mint, not EasyPosm's internal balanceOf.
    function externalMint() external {
        positionManager.mint(
            poolKey,
            TickMath.minUsableTick(60),
            TickMath.maxUsableTick(60),
            1e18,
            type(uint256).max,
            type(uint256).max,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }

    function test_externalLiquidity_isBlocked() public {
        // Adding liquidity directly via the PositionManager (not the hook) must revert.
        vm.expectRevert();
        this.externalMint();
    }

    // ── the headline: manager-controlled concentration ──

    function test_manager_repositionsConcentratesLiquidity() public {
        _depositLP(alice, 100e18);
        _becomeManager(manager, RENT);

        uint128 fullRangeLiquidity = hook.positionLiquidity();

        vm.prank(manager);
        hook.reposition(-600, 600); // concentrate around the current price (tick 0)

        assertEq(hook.tickLower(), -600);
        assertEq(hook.tickUpper(), 600);
        // Same tokens in a tighter range => strictly more liquidity (capital efficiency).
        assertGt(hook.positionLiquidity(), fullRangeLiquidity, "should be more concentrated");
    }

    function test_reposition_onlyManager() public {
        _depositLP(alice, 100e18);
        _becomeManager(manager, RENT);

        vm.prank(alice); // not the manager
        vm.expectRevert(HarbergerAuction.NotManager.selector);
        hook.reposition(-600, 600);
    }

    function test_reposition_revertsOnBadRange() public {
        _depositLP(alice, 100e18);
        _becomeManager(manager, RENT);

        vm.prank(manager);
        vm.expectRevert(MaestroHook.InvalidRange.selector);
        hook.reposition(600, 1200); // does not straddle current tick (0)
    }

    // ── rent to LP shareholders ──

    function test_rentAccruesToShareholders() public {
        _depositLP(alice, 100e18); // alice holds all shares
        _becomeManager(manager, RENT);

        vm.roll(block.number + 6);
        _swap(); // beforeSwap charges 6 blocks of rent; afterSwap pushes it into the accumulator

        assertApproxEqAbs(hook.pendingRent(alice), uint256(RENT) * 6, 1e3, "rent not credited to LP");
    }

    function test_claimRent_paysShareholder() public {
        _depositLP(alice, 100e18);
        _becomeManager(manager, RENT);
        vm.roll(block.number + 6);
        _swap();

        uint256 balBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        uint256 expected = hook.pendingRent(alice);
        vm.prank(alice);
        hook.claimRent();
        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(alice) - balBefore, expected, "rent not paid");
    }

    // ── auction mechanics (carried from Phases 1-2) ──

    function test_higherBid_displacesManager() public {
        _becomeManager(manager, RENT);
        _becomeManager(alice, RENT * 3); // alice outbids
        assertEq(hook.getLease(poolId).manager, alice);
        assertGt(hook.withdrawable(poolId, manager), 0, "old manager refunded");
    }

    function test_setFee_revertsAboveMax() public {
        _becomeManager(manager, RENT);
        uint24 tooHigh = hook.F_MAX() + 1;
        vm.prank(manager);
        vm.expectRevert(HarbergerAuction.FeeTooHigh.selector);
        hook.setFee(poolId, tooHigh);
    }
}
