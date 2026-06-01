// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title HarbergerAuction
/// @notice Continuous Harberger-lease auction for the "pool manager" role (am-AMM).
///         The manager sets the pool fee (and, in later phases, captures arbitrage); in
///         exchange they pay rent every block, which accrues for distribution to LPs.
///         A higher bidder only displaces the manager after `K` blocks — the censorship
///         resistance delay from the am-AMM paper.
/// @dev    Rent & deposits are denominated in the pool's `currency1` (an ERC-20). Accounting
///         lives here; the hook flushes `accruedRent` and donates it to LPs (see MaestroHook).
abstract contract HarbergerAuction {
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;

    /// @notice Blocks a winning bid must wait before it can be promoted (censorship resistance).
    uint64 public constant K = 10;
    /// @notice Maximum fee a manager may set, in hundredths of a bip (50_000 = 5%).
    uint24 public constant F_MAX = 50_000;
    /// @notice Fee applied when the pool has no manager, in hundredths of a bip (3000 = 0.30%).
    uint24 public constant DEFAULT_FEE = 3000;

    struct Lease {
        // ── active manager ──
        address manager; // current pool manager (address(0) == none)
        uint128 rentRate; // manager's rent per block (currency1 units)
        uint128 deposit; // manager's remaining deposit (currency1 units)
        uint24 fee; // fee currently set by the manager
        uint64 lastChargeBlock; // last block at which rent was charged
        // ── pending (highest) bid, not yet active ──
        address pendingBidder;
        uint128 pendingRent;
        uint128 pendingDeposit;
        uint64 pendingActiveBlock; // block at which the pending bid may be promoted
        // ── accounting ──
        uint256 accruedRent; // rent charged but not yet distributed to LPs
        uint256 totalRentCharged; // lifetime rent charged (for the conservation invariant)
    }

    /// @notice Per-pool lease state. A single hook serves many pools.
    mapping(PoolId => Lease) internal _leases;
    /// @notice Rent currency per pool (the pool's currency1). Set on the first bid.
    mapping(PoolId => Currency) public rentCurrency;
    /// @notice Pull-payment refunds for displaced/outbid bidders: poolId => bidder => amount.
    mapping(PoolId => mapping(address => uint256)) public withdrawable;

    event BidPlaced(PoolId indexed id, address indexed bidder, uint128 rentRate, uint64 activeBlock);
    event ManagerChanged(PoolId indexed id, address indexed oldManager, address indexed newManager, uint128 rentRate);
    event FeeSet(PoolId indexed id, uint24 fee);
    event RentCharged(PoolId indexed id, uint256 amount);
    event ManagerEvicted(PoolId indexed id, address indexed manager);

    error RentTooLow();
    error DepositTooSmall();
    error NotManager();
    error FeeTooHigh();
    error NativeCurrencyNotSupported();

    // ─────────────────────────────────────────── views ───────────────────────────────────────────

    function getLease(PoolId id) external view returns (Lease memory) {
        return _leases[id];
    }

    /// @notice The fee that will be applied to swaps right now.
    function currentFee(PoolId id) public view returns (uint24) {
        return _leases[id].manager == address(0) ? DEFAULT_FEE : _leases[id].fee;
    }

    // ────────────────────────────────────────── bidding ──────────────────────────────────────────

    /// @notice Bid to become (or replace) the pool manager. `deposit` (currency1) is pulled via transferFrom.
    /// @dev    Must strictly beat both the active manager's rent and any standing pending bid.
    function bid(PoolKey calldata key, uint128 rentRate, uint256 deposit) external {
        PoolId id = key.toId();
        Lease storage L = _leases[id];
        _poke(id);

        if (Currency.unwrap(key.currency1) == address(0)) revert NativeCurrencyNotSupported();
        if (Currency.unwrap(rentCurrency[id]) == address(0)) rentCurrency[id] = key.currency1;

        if (rentRate <= L.rentRate || rentRate <= L.pendingRent) revert RentTooLow();
        if (deposit < uint256(rentRate) * K) revert DepositTooSmall();

        IERC20(Currency.unwrap(key.currency1)).safeTransferFrom(msg.sender, address(this), deposit);

        // Refund the bidder we are outbidding (pull payment).
        if (L.pendingBidder != address(0)) {
            withdrawable[id][L.pendingBidder] += L.pendingDeposit;
        }

        L.pendingBidder = msg.sender;
        L.pendingRent = rentRate;
        L.pendingDeposit = uint128(deposit);
        L.pendingActiveBlock = uint64(block.number) + K;

        emit BidPlaced(id, msg.sender, rentRate, L.pendingActiveBlock);
    }

    /// @notice Manager sets the swap fee (<= F_MAX).
    function setFee(PoolId id, uint24 fee) external {
        Lease storage L = _leases[id];
        _poke(id);
        if (msg.sender != L.manager) revert NotManager();
        if (fee > F_MAX) revert FeeTooHigh();
        L.fee = fee;
        emit FeeSet(id, fee);
    }

    /// @notice Manager tops up their deposit (currency1) to avoid eviction.
    function topUp(PoolId id, uint256 amount) external {
        Lease storage L = _leases[id];
        _poke(id);
        if (msg.sender != L.manager) revert NotManager();
        IERC20(Currency.unwrap(rentCurrency[id])).safeTransferFrom(msg.sender, address(this), amount);
        L.deposit += uint128(amount);
    }

    /// @notice Permissionlessly settle the auction (charge rent, promote pending). Anyone may call.
    function poke(PoolId id) external {
        _poke(id);
    }

    /// @notice Withdraw refunded deposits (pull payment), denominated in the pool's rent currency.
    function withdraw(PoolId id) external {
        uint256 amount = withdrawable[id][msg.sender];
        withdrawable[id][msg.sender] = 0;
        IERC20(Currency.unwrap(rentCurrency[id])).safeTransfer(msg.sender, amount);
    }

    // ─────────────────────────────────────── state machine ───────────────────────────────────────

    /// @notice Charge rent owed for elapsed blocks, then promote a pending bid if its delay elapsed.
    /// @dev    Called at the start of every swap and liquidity change so state is always current.
    function _poke(PoolId id) internal {
        Lease storage L = _leases[id];

        // 1) Charge rent for blocks elapsed since the last charge.
        if (L.manager != address(0)) {
            uint64 elapsed = uint64(block.number) - L.lastChargeBlock;
            if (elapsed > 0) {
                uint256 owed = uint256(L.rentRate) * elapsed;
                if (owed >= L.deposit) {
                    // Deposit exhausted: bank what's left and evict the manager.
                    uint256 banked = L.deposit;
                    L.accruedRent += banked;
                    L.totalRentCharged += banked;
                    L.deposit = 0;
                    emit RentCharged(id, banked);

                    address evicted = L.manager;
                    L.manager = address(0);
                    L.rentRate = 0;
                    L.fee = 0;
                    emit ManagerEvicted(id, evicted);
                } else {
                    L.deposit -= uint128(owed);
                    L.accruedRent += owed;
                    L.totalRentCharged += owed;
                    emit RentCharged(id, owed);
                }
                L.lastChargeBlock = uint64(block.number);
            }
        }

        // 2) Promote the pending bid once its censorship-resistance delay has passed.
        if (L.pendingBidder != address(0) && block.number >= L.pendingActiveBlock) {
            if (L.pendingRent > L.rentRate) {
                if (L.manager != address(0)) withdrawable[id][L.manager] += L.deposit; // refund old manager
                address old = L.manager;
                L.manager = L.pendingBidder;
                L.rentRate = L.pendingRent;
                L.deposit = L.pendingDeposit;
                L.fee = DEFAULT_FEE;
                L.lastChargeBlock = uint64(block.number);
                emit ManagerChanged(id, old, L.manager, L.rentRate);
            } else {
                // Pending no longer beats the manager: refund it.
                withdrawable[id][L.pendingBidder] += L.pendingDeposit;
            }
            L.pendingBidder = address(0);
            L.pendingRent = 0;
            L.pendingDeposit = 0;
            L.pendingActiveBlock = 0;
        }
    }

    /// @notice Hook-facing: pull all accrued rent for distribution, zeroing the running balance.
    function _takeAccruedRent(PoolId id) internal returns (uint256 amount) {
        amount = _leases[id].accruedRent;
        _leases[id].accruedRent = 0;
    }
}
