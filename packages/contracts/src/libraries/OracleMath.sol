// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title OracleMath
/// @notice Converts a Pyth price into a Uniswap v4 sqrtPriceX96 / tick.
/// @dev    Assumes the Pyth feed expresses currency1-per-currency0 and both tokens use 18 decimals
///         (sufficient for the demo pools). Pyth price value is `price * 10^expo`.
library OracleMath {
    uint256 internal constant Q192 = 1 << 192;
    uint256 internal constant WAD = 1e18;

    /// @notice sqrtPriceX96 = sqrt(ratio) * 2^96, where ratio = price * 10^expo.
    function priceToSqrtPriceX96(int64 price, int32 expo) internal pure returns (uint160) {
        require(price > 0, "OracleMath: price<=0");
        uint256 p = uint256(uint64(price));

        // priceWad = price * 10^(18 + expo)
        int256 e = int256(18) + int256(expo);
        uint256 priceWad = e >= 0 ? p * (10 ** uint256(e)) : p / (10 ** uint256(-e));

        // sqrtPriceX96 = sqrt(priceWad/WAD * 2^192) = sqrt(priceWad * 2^192 / WAD)
        uint256 sqrtP = Math.sqrt(Math.mulDiv(priceWad, Q192, WAD));
        return uint160(sqrtP);
    }

    /// @notice The Uniswap tick implied by a Pyth price.
    function priceToTick(int64 price, int32 expo) internal pure returns (int24) {
        return TickMath.getTickAtSqrtPrice(priceToSqrtPriceX96(price, expo));
    }
}
