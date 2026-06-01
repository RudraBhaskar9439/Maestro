# Maestro — Build Roadmap

Auction-managed AMM (am-AMM) hook for Uniswap v4. Manager wins a Harberger auction, sets the
fee + captures arbitrage, and pays rent to LPs. Novel contributions: concentrated-liquidity
am-AMM (unsolved in the paper) + an autonomous cross-chain manager via Reactive Network.

## Phases

- [x] **Phase 0 — Scaffold.** Monorepo (contracts/reactive/frontend/bots), v4-template, CI. Build green.
- [x] **Phase 1 — Harberger auction core.**
  - `src/auction/HarbergerAuction.sol`: bid / deposit / per-block rent / K-block displacement / pull-payment refunds.
  - `src/MaestroHook.sol`: applies the manager's fee via `beforeSwap` (dynamic-fee pool); pokes auction on swaps & liquidity changes.
  - `test/MaestroHook.t.sol`: 7 tests — promotion after K, displacement + refund, rent accrual, fee control, guards. ✅ all passing.
- [x] **Phase 2 — Rent distribution to LPs.**
  - Rent/deposits switched from native ETH to the pool's **`currency1`** (ERC-20).
  - Rent distributed to LPs via the PoolManager's native **`donate()`** (pro-rata to in-range liquidity) — no custom share ledger; fully composable with v4 accounting. Settled with `CurrencySettler` from the hook's own balance.
  - Conservation invariant test: `totalRentCharged == totalRentDonated + accruedRent`. ✅ 9/9 tests passing.
- [x] **Phase 3 — Concentrated-liquidity extension (Novel #1).**
  - MaestroHook is now a **hook-owned liquidity vault** (single-pool): LPs `deposit()`/`withdraw()` through the hook and hold shares of one aggregate position; external liquidity is blocked (`LiquidityOnlyViaHook`).
  - The auction **manager** can `reposition(newLower, newUpper)` to concentrate the pool's liquidity around price (tick-aligned, must straddle current tick). Re-add auto-compounds removed tokens+fees into the new range.
  - Rent now distributed to LP shareholders via a per-share accumulator in currency1 (`pendingRent`/`claimRent`), replacing donate().
  - 11/11 tests passing incl. `test_manager_repositionsConcentratesLiquidity`, `test_rentAccruesToShareholders`, deposit/withdraw/swap/external-block.
  - **Honest TODO (3b):** swap fees realized on liquidity modifications currently go to the hook and are not yet distributed to shareholders (rent IS). Concentration is a working approach, not a formal optimality proof (matches the pitch framing).
- [ ] **Phase 4 — Reactive autonomous manager (Novel #2).** `MaestroManagerRSC.sol` + `ManagerCallback.sol`; cross-chain round trip drives the manager with no human.
- [ ] **Phase 5 — Pyth + arbitrage capture.** Oracle feed; `LVRMath`; manager captures arb when pool is stale.
- [ ] **Phase 6 — Frontend dashboard.** AuctionPanel, LPDashboard, ComparisonChart, EventFeed.
- [ ] **Phase 7 — Bots, demo, tests, pitch.** Scripted bidders + evil-arb bot; demo script; video; polish.

## Phase 1 design notes / simplifications to revisit
- Deposits & rent are in the pool's **`currency1`** (ERC-20); rent is donated to LPs via v4 `donate()`. Native-currency pools are rejected (`NativeCurrencyNotSupported`).
- `K = 10`, `F_MAX = 5%`, `DEFAULT_FEE = 0.30%` — constants in `HarbergerAuction.sol`.
- Refunds use **pull payments** (`withdraw()`), avoiding external calls inside the PoolManager swap lock.
- Pools MUST be initialized with `LPFeeLibrary.DYNAMIC_FEE_FLAG`.
