// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {CurrencySettler} from "@openzeppelin/uniswap-hooks/src/utils/CurrencySettler.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {HarbergerAuction} from "./auction/HarbergerAuction.sol";

/// @title MaestroHook
/// @notice Auction-managed AMM hook for Uniswap v4. The pool fee is set by whoever wins the
///         continuous Harberger auction for the manager role (see {HarbergerAuction}). Rent paid
///         by the manager is donated to LPs via the PoolManager's native `donate()` — distributed
///         pro-rata to in-range liquidity, exactly the am-AMM model, with no custom share ledger.
/// @dev    Pools using this hook MUST be initialized with the dynamic-fee flag.
contract MaestroHook is BaseHook, HarbergerAuction {
    using PoolIdLibrary for PoolKey;
    using CurrencySettler for Currency;

    /// @notice Lifetime rent donated to LPs, per pool (the provable-economics counter).
    mapping(PoolId => uint256) public totalRentDonated;
    /// @notice Tracked liquidity per pool (used to guard donation when the pool is empty).
    mapping(PoolId => uint128) public totalLiquidity;

    event RentDonated(PoolId indexed id, uint256 amount);

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @dev Advance the auction, then apply the current manager's fee for this swap.
    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        _poke(id);
        uint24 feeWithOverride = currentFee(id) | LPFeeLibrary.OVERRIDE_FEE_FLAG;
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, feeWithOverride);
    }

    /// @dev Distribute any accrued rent to LPs via the pool's native donate accounting.
    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        if (totalLiquidity[id] > 0) {
            uint256 rent = _takeAccruedRent(id);
            if (rent > 0) {
                poolManager.donate(key, 0, rent, "");
                key.currency1.settle(poolManager, address(this), rent, false);
                totalRentDonated[id] += rent;
                emit RentDonated(id, rent);
            }
        }
        return (BaseHook.afterSwap.selector, 0);
    }

    function _beforeAddLiquidity(address, PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4)
    {
        PoolId id = key.toId();
        _poke(id);
        totalLiquidity[id] += uint128(uint256(params.liquidityDelta));
        return BaseHook.beforeAddLiquidity.selector;
    }

    function _beforeRemoveLiquidity(address, PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4)
    {
        PoolId id = key.toId();
        _poke(id);
        uint128 removed = uint128(uint256(-params.liquidityDelta));
        totalLiquidity[id] = removed >= totalLiquidity[id] ? 0 : totalLiquidity[id] - removed;
        return BaseHook.beforeRemoveLiquidity.selector;
    }
}
