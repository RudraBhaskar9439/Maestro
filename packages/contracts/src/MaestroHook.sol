// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {CurrencySettler} from "@openzeppelin/uniswap-hooks/src/utils/CurrencySettler.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

import {HarbergerAuction} from "./auction/HarbergerAuction.sol";
import {OracleMath} from "./libraries/OracleMath.sol";

/// @title MaestroHook
/// @notice Auction-managed AMM for Uniswap v4 with hook-owned, manager-concentrated liquidity.
///         LPs deposit through the hook and receive shares of a single aggregate position. The
///         winner of the continuous Harberger auction (see {HarbergerAuction}) is the "manager":
///         they set the swap fee AND `reposition()` the pool's liquidity to concentrate it around
///         the price — the concentrated-liquidity extension of am-AMM. Manager rent accrues to LP
///         shareholders pro-rata via a per-share accumulator in currency1.
/// @dev    Single-pool: deploy one instance per pool. Pool must use the dynamic-fee flag.
contract MaestroHook is BaseHook, HarbergerAuction, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencySettler for Currency;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;

    uint256 private constant ACC_PRECISION = 1e18;

    enum Action {
        DEPOSIT,
        WITHDRAW,
        REPOSITION
    }

    struct CallbackData {
        Action action;
        address user;
        uint128 liquidity; // liquidity to add (DEPOSIT) or remove (WITHDRAW)
        int24 newLower; // REPOSITION target
        int24 newUpper;
    }

    // ── the pool this hook serves (single-pool) ──
    PoolKey public poolKey;
    bool public initialized;

    // ── the hook-owned aggregate position ──
    int24 public tickLower;
    int24 public tickUpper;
    uint128 public positionLiquidity;

    // ── LP shares ──
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    // ── rent distribution to shareholders (currency1) ──
    uint256 public rentPerShare; // scaled by ACC_PRECISION
    mapping(address => uint256) public rentDebt;

    // ── Pyth oracle (for LVR-aware concentration) ──
    IPyth public pyth;
    bytes32 public priceId;
    uint256 public maxPriceAge;

    event Deposit(address indexed user, uint128 liquidity, uint256 shares);
    event Withdraw(address indexed user, uint128 liquidity, uint256 shares);
    event Repositioned(address indexed manager, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event RepositionedToOracle(int24 oracleTick, int24 tickLower, int24 tickUpper);
    event RentClaimed(address indexed user, uint256 amount);
    event OracleSet(address pyth, bytes32 priceId, uint256 maxAge);

    error AlreadyInitialized();
    error NotInitialized();
    error LiquidityOnlyViaHook();
    error InvalidRange();
    error NothingToReposition();
    error InsufficientShares();
    error OracleNotSet();
    error OracleAlreadySet();

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true, // block external liquidity (hook-owned only)
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

    // ─────────────────────────────────────── initialization ───────────────────────────────────────

    function _beforeInitialize(address, PoolKey calldata key, uint160) internal override returns (bytes4) {
        if (initialized) revert AlreadyInitialized();
        poolKey = key;
        initialized = true;
        // Start full-range; the manager concentrates later via reposition().
        tickLower = TickMath.minUsableTick(key.tickSpacing);
        tickUpper = TickMath.maxUsableTick(key.tickSpacing);
        return BaseHook.beforeInitialize.selector;
    }

    // ──────────────────────────────────────── LP: deposit ────────────────────────────────────────

    /// @notice Deposit liquidity into the hook-owned position at the current managed range.
    /// @dev    Caller must approve this hook for currency0/currency1 (settled via transferFrom).
    function deposit(uint256 amount0Desired, uint256 amount1Desired) external returns (uint256 shares) {
        if (!initialized) revert NotInitialized();
        PoolId id = poolKey.toId();
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0Desired,
            amount1Desired
        );
        if (liquidity == 0) revert InvalidRange();

        _harvestRent(msg.sender);

        shares = totalShares == 0 ? liquidity : (uint256(liquidity) * totalShares) / positionLiquidity;

        poolManager.unlock(abi.encode(CallbackData(Action.DEPOSIT, msg.sender, liquidity, 0, 0)));

        positionLiquidity += liquidity;
        totalShares += shares;
        sharesOf[msg.sender] += shares;
        rentDebt[msg.sender] = (sharesOf[msg.sender] * rentPerShare) / ACC_PRECISION;

        emit Deposit(msg.sender, liquidity, shares);
    }

    /// @notice Withdraw `shares` worth of liquidity from the hook-owned position.
    function withdraw(uint256 shares) external {
        if (shares == 0 || shares > sharesOf[msg.sender]) revert InsufficientShares();

        _harvestRent(msg.sender);

        uint128 liquidity = uint128((uint256(positionLiquidity) * shares) / totalShares);

        poolManager.unlock(abi.encode(CallbackData(Action.WITHDRAW, msg.sender, liquidity, 0, 0)));

        positionLiquidity -= liquidity;
        totalShares -= shares;
        sharesOf[msg.sender] -= shares;
        rentDebt[msg.sender] = (sharesOf[msg.sender] * rentPerShare) / ACC_PRECISION;

        emit Withdraw(msg.sender, liquidity, shares);
    }

    /// @notice Claim accrued rent (currency1) owed to the caller's shares.
    function claimRent() external {
        _harvestRent(msg.sender);
        rentDebt[msg.sender] = (sharesOf[msg.sender] * rentPerShare) / ACC_PRECISION;
    }

    // ─────────────────────────────────── MANAGER: reposition ───────────────────────────────────

    /// @notice The auction manager concentrates the pool's liquidity into [newLower, newUpper].
    /// @dev    The new range must be tick-aligned and straddle the current price so liquidity is active.
    function reposition(int24 newLower, int24 newUpper) external {
        PoolId id = poolKey.toId();
        _poke(id);
        if (msg.sender != _leases[id].manager) revert NotManager();
        if (positionLiquidity == 0) revert NothingToReposition();

        (, int24 currentTick,,) = poolManager.getSlot0(id);
        int24 spacing = poolKey.tickSpacing;
        if (
            newLower >= newUpper || newLower % spacing != 0 || newUpper % spacing != 0 || newLower > currentTick
                || newUpper < currentTick
        ) revert InvalidRange();

        poolManager.unlock(abi.encode(CallbackData(Action.REPOSITION, msg.sender, 0, newLower, newUpper)));

        emit Repositioned(msg.sender, tickLower, tickUpper, positionLiquidity);
    }

    // ─────────────────────────────── ORACLE: LVR-aware concentration ───────────────────────────────

    /// @notice One-time configuration of the Pyth price feed used for oracle-aware concentration.
    function setOracle(IPyth _pyth, bytes32 _priceId, uint256 _maxAge) external {
        if (address(pyth) != address(0)) revert OracleAlreadySet();
        pyth = _pyth;
        priceId = _priceId;
        maxPriceAge = _maxAge;
        emit OracleSet(address(_pyth), _priceId, _maxAge);
    }

    /// @notice The tick implied by the current Pyth price (the "true" market price).
    function oracleTick() public view returns (int24) {
        if (address(pyth) == address(0)) revert OracleNotSet();
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(priceId, maxPriceAge);
        return OracleMath.priceToTick(p.price, p.expo);
    }

    /// @notice Manager concentrates liquidity around the TRUE (oracle) price, neutralizing LVR.
    /// @dev    The band spans from the current pool tick to the oracle tick — so it stays active and
    ///         covers the arbitrage path — padded by `halfWidth` (tick units) on each side.
    function repositionToOracle(int24 halfWidth) external {
        PoolId id = poolKey.toId();
        _poke(id);
        if (msg.sender != _leases[id].manager) revert NotManager();
        if (positionLiquidity == 0) revert NothingToReposition();

        int24 oTick = oracleTick();
        (, int24 currentTick,,) = poolManager.getSlot0(id);
        int24 spacing = poolKey.tickSpacing;

        int24 lo = oTick < currentTick ? oTick : currentTick;
        int24 hi = oTick > currentTick ? oTick : currentTick;
        int24 newLower = _alignFloor(lo - halfWidth, spacing);
        int24 newUpper = _alignCeil(hi + halfWidth, spacing);

        poolManager.unlock(abi.encode(CallbackData(Action.REPOSITION, msg.sender, 0, newLower, newUpper)));
        emit RepositionedToOracle(oTick, newLower, newUpper);
    }

    function _alignFloor(int24 tick, int24 spacing) private pure returns (int24 a) {
        a = (tick / spacing) * spacing;
        if (tick < 0 && a > tick) a -= spacing;
    }

    function _alignCeil(int24 tick, int24 spacing) private pure returns (int24 a) {
        a = (tick / spacing) * spacing;
        if (tick > 0 && a < tick) a += spacing;
    }

    // ──────────────────────────────────────── unlock callback ────────────────────────────────────────

    function unlockCallback(bytes calldata raw) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "only PoolManager");
        CallbackData memory d = abi.decode(raw, (CallbackData));

        if (d.action == Action.DEPOSIT) {
            (BalanceDelta caller, BalanceDelta fees) =
                poolManager.modifyLiquidity(poolKey, _params(tickLower, tickUpper, int256(uint256(d.liquidity))), "");
            BalanceDelta principal = caller - fees;
            _settleOrTake(poolKey.currency0, d.user, principal.amount0());
            _settleOrTake(poolKey.currency1, d.user, principal.amount1());
            // Realized fees on the existing position go to the hook (distribution = future phase).
            _settleOrTake(poolKey.currency0, address(this), fees.amount0());
            _settleOrTake(poolKey.currency1, address(this), fees.amount1());
        } else if (d.action == Action.WITHDRAW) {
            (BalanceDelta caller, BalanceDelta fees) =
                poolManager.modifyLiquidity(poolKey, _params(tickLower, tickUpper, -int256(uint256(d.liquidity))), "");
            BalanceDelta principal = caller - fees;
            _settleOrTake(poolKey.currency0, d.user, principal.amount0());
            _settleOrTake(poolKey.currency1, d.user, principal.amount1());
            _settleOrTake(poolKey.currency0, address(this), fees.amount0());
            _settleOrTake(poolKey.currency1, address(this), fees.amount1());
        } else {
            // REPOSITION: remove all liquidity at the old range, re-add it concentrated at the new range.
            (BalanceDelta removed,) =
                poolManager.modifyLiquidity(poolKey, _params(tickLower, tickUpper, -int256(uint256(positionLiquidity))), "");
            _settleOrTake(poolKey.currency0, address(this), removed.amount0());
            _settleOrTake(poolKey.currency1, address(this), removed.amount1());

            (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolKey.toId());
            uint128 newLiquidity = LiquidityAmounts.getLiquidityForAmounts(
                sqrtPriceX96,
                TickMath.getSqrtPriceAtTick(d.newLower),
                TickMath.getSqrtPriceAtTick(d.newUpper),
                uint256(uint128(removed.amount0())),
                uint256(uint128(removed.amount1()))
            );

            (BalanceDelta added,) =
                poolManager.modifyLiquidity(poolKey, _params(d.newLower, d.newUpper, int256(uint256(newLiquidity))), "");
            _settleOrTake(poolKey.currency0, address(this), added.amount0());
            _settleOrTake(poolKey.currency1, address(this), added.amount1());

            tickLower = d.newLower;
            tickUpper = d.newUpper;
            positionLiquidity = newLiquidity;
        }

        return "";
    }

    // ──────────────────────────────────────── swap hooks ────────────────────────────────────────

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

    /// @dev Distribute accrued rent (currency1) to LP shareholders via the per-share accumulator.
    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        if (totalShares > 0) {
            uint256 rent = _takeAccruedRent(id);
            if (rent > 0) rentPerShare += (rent * ACC_PRECISION) / totalShares;
        }
        return (BaseHook.afterSwap.selector, 0);
    }

    function _beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {
        if (sender != address(this)) revert LiquidityOnlyViaHook();
        return BaseHook.beforeAddLiquidity.selector;
    }

    function _beforeRemoveLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {
        if (sender != address(this)) revert LiquidityOnlyViaHook();
        return BaseHook.beforeRemoveLiquidity.selector;
    }

    // ──────────────────────────────────────── internals ────────────────────────────────────────

    function _harvestRent(address user) internal {
        uint256 accumulated = (sharesOf[user] * rentPerShare) / ACC_PRECISION;
        uint256 pending = accumulated - rentDebt[user];
        if (pending > 0) {
            IERC20(Currency.unwrap(rentCurrency[poolKey.toId()])).safeTransfer(user, pending);
            emit RentClaimed(user, pending);
        }
    }

    function _params(int24 lower, int24 upper, int256 liquidityDelta)
        private
        pure
        returns (ModifyLiquidityParams memory)
    {
        return ModifyLiquidityParams({tickLower: lower, tickUpper: upper, liquidityDelta: liquidityDelta, salt: 0});
    }

    /// @dev Settle a negative delta (pay) or take a positive delta (receive) for `who`.
    function _settleOrTake(Currency currency, address who, int128 amount) private {
        if (amount < 0) {
            currency.settle(poolManager, who, uint256(uint128(-amount)), false);
        } else if (amount > 0) {
            currency.take(poolManager, who, uint256(uint128(amount)), false);
        }
    }

    /// @notice Pending rent (currency1) claimable by `user`.
    function pendingRent(address user) external view returns (uint256) {
        return (sharesOf[user] * rentPerShare) / ACC_PRECISION - rentDebt[user];
    }
}
