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

import {BaseTest} from "./utils/BaseTest.sol";
import {MaestroHook} from "../src/MaestroHook.sol";
import {ManagerCallback} from "../src/reactive/ManagerCallback.sol";

/// @notice Proves the autonomous-manager wiring: an authorized callback (standing in for the
///         Reactive Network relay) drives the hook's reposition/setFee with no human.
contract ManagerCallbackTest is BaseTest {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    MaestroHook hook;
    PoolId poolId;
    ManagerCallback mgr;

    address callbackProxy = makeAddr("reactiveCallbackProxy");
    address lp = makeAddr("lp");

    uint128 constant RENT = 1e15;
    uint256 constant BOND = 1e18;

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

        // ManagerCallback: this test contract is the deployer (owner + bound rvm id);
        // callbackProxy is the authorized Reactive sender.
        mgr = new ManagerCallback(callbackProxy, hook, poolKey);

        // LP deposits liquidity through the hook.
        MockERC20(Currency.unwrap(currency0)).mint(lp, 100e18);
        MockERC20(Currency.unwrap(currency1)).mint(lp, 100e18);
        vm.startPrank(lp);
        MockERC20(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.deposit(100e18, 100e18);
        vm.stopPrank();

        // Fund + enter the auction so ManagerCallback becomes the manager.
        MockERC20(Currency.unwrap(currency1)).mint(address(mgr), BOND);
        mgr.enterAuction(RENT, BOND);
        vm.roll(block.number + hook.K() + 1);
        hook.poke(poolId);
    }

    function test_callbackContractIsManager() public view {
        assertEq(hook.getLease(poolId).manager, address(mgr));
    }

    function test_authorizedCallback_repositions() public {
        // Simulate the Reactive Network relay: authorized proxy invokes the callback with the bound rvm id.
        vm.prank(callbackProxy);
        mgr.repositionTo(address(this), -600, 600);

        assertEq(hook.tickLower(), -600);
        assertEq(hook.tickUpper(), 600);
    }

    function test_authorizedCallback_updatesFee() public {
        vm.prank(callbackProxy);
        mgr.updateFee(address(this), 10_000);
        assertEq(hook.currentFee(poolId), 10_000);
    }

    function test_unauthorizedSender_reverts() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(bytes("Authorized sender only"));
        mgr.repositionTo(address(this), -600, 600);
    }
}
