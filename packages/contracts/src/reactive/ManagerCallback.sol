// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AbstractCallback} from "reactive-lib/abstract-base/AbstractCallback.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MaestroHook} from "../MaestroHook.sol";

/// @title ManagerCallback
/// @notice The autonomous pool-manager for Maestro. This contract wins the Harberger auction
///         (becoming the manager) and is driven entirely by the Reactive Network: a Reactive
///         Smart Contract observes price moves on Unichain and triggers callbacks here, which
///         reposition the concentrated liquidity and re-price the fee — with no human in the loop.
/// @dev    Deployed on the destination chain (Unichain). Only the Reactive callback proxy
///         (an authorized sender) may invoke the callback functions.
contract ManagerCallback is AbstractCallback {
    using PoolIdLibrary for PoolKey;

    MaestroHook public immutable hook;
    PoolKey public poolKey;
    address public immutable owner;

    /// @dev Pyth ETH/USD exponent (price is `price * 10^-8`) and the concentration half-width (tick units).
    int32 public constant PRICE_EXPO = -8;
    int24 public constant HALF_WIDTH = 600;

    event AutoRepositioned(int24 tickLower, int24 tickUpper);
    event AutoRepositionedToPrice(int64 price);
    event AutoFeeUpdated(uint24 fee);

    error OnlyOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _callbackSender, MaestroHook _hook, PoolKey memory _key)
        payable
        AbstractCallback(_callbackSender)
    {
        hook = _hook;
        poolKey = _key;
        owner = msg.sender;
    }

    // ───────────────────────────── owner: auction participation ─────────────────────────────

    /// @notice Enter the Harberger auction so THIS contract becomes the pool manager.
    /// @dev    The contract must already hold `deposit` of currency1 (the rent currency).
    function enterAuction(uint128 rentRate, uint256 deposit) external onlyOwner {
        IERC20(Currency.unwrap(poolKey.currency1)).approve(address(hook), deposit);
        hook.bid(poolKey, rentRate, deposit);
    }

    /// @notice Reclaim a refunded deposit if displaced as manager.
    function withdrawRefund() external onlyOwner {
        hook.withdraw(poolKey.toId());
    }

    // ───────────────────────── Reactive callbacks (autonomous manager) ─────────────────────────

    /// @notice Reposition the pool's liquidity. Called by the Reactive callback proxy.
    /// @param rvmId The originating ReactVM id (validated against this contract's bound id).
    function repositionTo(address rvmId, int24 newLower, int24 newUpper)
        external
        authorizedSenderOnly
        rvmIdOnly(rvmId)
    {
        hook.reposition(newLower, newUpper);
        emit AutoRepositioned(newLower, newUpper);
    }

    /// @notice Reposition the pool around a live price carried from the origin chain. The autonomous path:
    ///         the Reactive contract observes the Pyth ETH/USD price and forwards it here, and the hook
    ///         re-concentrates liquidity to track that price — no keeper, no local oracle read.
    /// @param rvmId The originating ReactVM id (validated against this contract's bound id).
    /// @param price The Pyth ETH/USD price (exponent PRICE_EXPO).
    function repositionToPrice(address rvmId, int64 price) external authorizedSenderOnly rvmIdOnly(rvmId) {
        hook.repositionToPrice(price, PRICE_EXPO, HALF_WIDTH);
        emit AutoRepositionedToPrice(price);
    }

    /// @notice Re-price the swap fee. Called by the Reactive callback proxy.
    function updateFee(address rvmId, uint24 newFee) external authorizedSenderOnly rvmIdOnly(rvmId) {
        hook.setFee(poolKey.toId(), newFee);
        emit AutoFeeUpdated(newFee);
    }
}
