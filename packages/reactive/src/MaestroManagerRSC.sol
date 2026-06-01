// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import {IReactive} from "reactive-lib/interfaces/IReactive.sol";
import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";

/// @title MaestroManagerRSC
/// @notice The autonomous brain of Maestro's pool manager, living on the Reactive Network.
///         It subscribes to the Uniswap v4 PoolManager `Swap` event for a specific pool on the
///         origin chain. Whenever the price moves, it computes a fresh concentration band around
///         the new tick and triggers a cross-chain callback to the ManagerCallback contract on
///         the destination chain — repositioning the pool's liquidity with no human in the loop.
/// @dev    This is the "innovative" Reactive use: a trustless, sequencer-independent pool manager,
///         not a keeper. Subscriptions are created on the Reactive Network; `react` runs in the ReactVM.
contract MaestroManagerRSC is AbstractReactive {
    /// @dev keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
    uint256 private constant SWAP_TOPIC_0 = 0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f;
    uint64 private constant CALLBACK_GAS_LIMIT = 1_000_000;

    uint256 public immutable originChainId;
    uint256 public immutable destinationChainId;
    address public immutable poolManager; // origin-chain PoolManager being watched
    address public immutable managerCallback; // destination-chain ManagerCallback
    int24 public immutable tickSpacing;
    int24 public immutable halfWidth; // half the concentration band width (multiple of tickSpacing)

    event ConcentrationDecision(int24 indexed atTick, int24 newLower, int24 newUpper);

    constructor(
        uint256 _originChainId,
        uint256 _destinationChainId,
        address _poolManager,
        bytes32 _poolId,
        address _managerCallback,
        int24 _tickSpacing,
        int24 _halfWidth
    ) {
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        poolManager = _poolManager;
        managerCallback = _managerCallback;
        tickSpacing = _tickSpacing;
        halfWidth = _halfWidth;

        // Subscribe to Swap events for this specific pool (topic_1 == poolId), on the Reactive Network only.
        if (!vm) {
            service.subscribe(
                _originChainId,
                _poolManager,
                SWAP_TOPIC_0,
                uint256(_poolId),
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    /// @notice Handle a Swap event: derive a concentration band around the new tick and trigger a reposition.
    function react(LogRecord calldata log) external vmOnly {
        // Swap non-indexed data: (int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
        (,,,, int24 tick,) = abi.decode(log.data, (int128, int128, uint160, uint128, int24, uint24));

        (int24 newLower, int24 newUpper) = _band(tick);

        // The leading address(0) is replaced by the ReactVM id when the callback executes.
        bytes memory payload =
            abi.encodeWithSignature("repositionTo(address,int24,int24)", address(0), newLower, newUpper);

        emit ConcentrationDecision(tick, newLower, newUpper);
        emit Callback(destinationChainId, managerCallback, CALLBACK_GAS_LIMIT, payload);
    }

    /// @dev Tick-aligned concentration band straddling `tick`.
    function _band(int24 tick) internal view returns (int24 lower, int24 upper) {
        int24 aligned = (tick / tickSpacing) * tickSpacing; // truncates toward zero; fine for a band center
        lower = aligned - halfWidth;
        upper = aligned + halfWidth;
    }
}
