// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

import {MaestroHook} from "../src/MaestroHook.sol";
import {ManagerCallback} from "../src/reactive/ManagerCallback.sol";

/// @notice One-shot deploy of the Unichain-side Maestro stack:
///         mine + deploy the hook, initialize the dynamic-fee pool, wire Pyth, deploy ManagerCallback.
/// @dev    Configured entirely via environment variables (see docs/DEPLOY.md). Run with:
///         forge script script/DeployMaestro.s.sol --rpc-url $UNICHAIN_RPC --private-key $PK --broadcast
contract DeployMaestro is Script {
    using PoolIdLibrary for PoolKey;

    // Canonical CREATE2 deterministic deployer (Foundry routes `new{salt}` through it on broadcast).
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() external {
        IPoolManager poolManager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        address tokenA = vm.envAddress("TOKEN0");
        address tokenB = vm.envAddress("TOKEN1");
        address pyth = vm.envAddress("PYTH");
        bytes32 priceId = vm.envBytes32("PRICE_ID");
        address callbackProxy = vm.envAddress("CALLBACK_PROXY");
        int24 tickSpacing = int24(vm.envOr("TICK_SPACING", int256(60)));
        uint256 maxAge = vm.envOr("MAX_AGE", uint256(120));

        // Currencies must be sorted.
        (Currency currency0, Currency currency1) =
            tokenA < tokenB ? (Currency.wrap(tokenA), Currency.wrap(tokenB)) : (Currency.wrap(tokenB), Currency.wrap(tokenA));

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
        );
        bytes memory args = abi.encode(poolManager);
        (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(MaestroHook).creationCode, args);

        vm.startBroadcast();

        MaestroHook hook = new MaestroHook{salt: salt}(poolManager);
        require(address(hook) == hookAddr, "DeployMaestro: hook address mismatch");

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });
        poolManager.initialize(key, SQRT_PRICE_1_1);

        hook.setOracle(IPyth(pyth), priceId, maxAge);

        ManagerCallback managerCallback = new ManagerCallback(callbackProxy, hook, key);

        vm.stopBroadcast();

        console.log("== Maestro deployed (Unichain) ==");
        console.log("MaestroHook:     ", address(hook));
        console.log("ManagerCallback: ", address(managerCallback));
        console.log("currency0:       ", Currency.unwrap(currency0));
        console.log("currency1:       ", Currency.unwrap(currency1));
        console.log("tickSpacing:     ", int256(tickSpacing));
        console.log("PoolId (for the RSC) below:");
        console.logBytes32(PoolId.unwrap(key.toId()));
    }
}
