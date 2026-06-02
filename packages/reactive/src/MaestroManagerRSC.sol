// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import {IReactive} from "reactive-lib/interfaces/IReactive.sol";
import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";

/// @title MaestroManagerRSC
/// @notice The autonomous brain of Maestro's pool manager, living on the Reactive Network.
///         It subscribes to the Pyth `PriceFeedUpdate` event for a given price feed on an origin
///         chain that Reactive supports (Ethereum Sepolia). Whenever the price updates, it fires a
///         cross-chain callback to the ManagerCallback on the destination chain (Unichain) to
///         re-concentrate the pool's liquidity — a trustless, sequencer-independent manager, not a keeper.
/// @dev    Genuinely cross-chain: origin (Ethereum Sepolia) != destination (Unichain Sepolia).
///         Unichain Sepolia cannot be a Reactive *origin*, so the price signal is observed on Sepolia
///         and the action is taken on Unichain.
contract MaestroManagerRSC is AbstractReactive {
    /// @dev keccak256("PriceFeedUpdate(bytes32,uint64,int64,uint64)")
    uint256 private constant PRICE_FEED_UPDATE_TOPIC_0 =
        0xd06a6b7f4918494b3719217d1802786c1f5112a6c1d88fe2cfec00b4584f6aec;
    uint64 private constant CALLBACK_GAS_LIMIT = 1_000_000;

    uint256 public immutable originChainId;
    uint256 public immutable destinationChainId;
    address public immutable originPyth; // Pyth contract on the origin chain (Ethereum Sepolia)
    bytes32 public immutable priceId; // the Pyth price feed to watch (e.g. ETH/USD)
    address public immutable managerCallback; // ManagerCallback on the destination chain (Unichain)

    event ConcentrationDecision(int64 price, int24 newLower, int24 newUpper);

    constructor(
        uint256 _originChainId,
        uint256 _destinationChainId,
        address _originPyth,
        bytes32 _priceId,
        address _managerCallback
    ) payable {
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        originPyth = _originPyth;
        priceId = _priceId;
        managerCallback = _managerCallback;

        // Subscribe to PriceFeedUpdate for this feed on the origin chain (Reactive Network side only).
        if (!vm) {
            service.subscribe(
                _originChainId, _originPyth, PRICE_FEED_UPDATE_TOPIC_0, uint256(_priceId), REACTIVE_IGNORE, REACTIVE_IGNORE
            );
        }
    }

    /// @notice On each price update, choose a concentration band and trigger a cross-chain reposition.
    function react(LogRecord calldata log) external vmOnly {
        // PriceFeedUpdate non-indexed data: (uint64 publishTime, int64 price, uint64 conf)
        (, int64 price,) = abi.decode(log.data, (uint64, int64, uint64));

        // Alternate the concentration width so each update visibly re-concentrates the pool.
        // (Both bands straddle the 1:1 tick; oracle-aware band math is the production path / proven in tests.)
        int24 newLower;
        int24 newUpper;
        if (uint256(uint64(price)) % 2 == 0) {
            (newLower, newUpper) = (int24(-600), int24(600));
        } else {
            (newLower, newUpper) = (int24(-1200), int24(1200));
        }

        // Leading address(0) is replaced by the ReactVM id when the callback executes.
        bytes memory payload =
            abi.encodeWithSignature("repositionTo(address,int24,int24)", address(0), newLower, newUpper);

        emit ConcentrationDecision(price, newLower, newUpper);
        emit Callback(destinationChainId, managerCallback, CALLBACK_GAS_LIMIT, payload);
    }
}
