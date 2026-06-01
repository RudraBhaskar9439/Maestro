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
- [ ] **Phase 2 — Rent distribution to LPs.** `RentDistributor.sol` (rewardPerShare accumulator); track LP shares; invariant: rent charged == rent claimable.
- [ ] **Phase 3 — Concentrated-liquidity extension (Novel #1).** `ConcentratedManager.sol`: manager-controlled active-tick concentration.
- [ ] **Phase 4 — Reactive autonomous manager (Novel #2).** `MaestroManagerRSC.sol` + `ManagerCallback.sol`; cross-chain round trip drives the manager with no human.
- [ ] **Phase 5 — Pyth + arbitrage capture.** Oracle feed; `LVRMath`; manager captures arb when pool is stale.
- [ ] **Phase 6 — Frontend dashboard.** AuctionPanel, LPDashboard, ComparisonChart, EventFeed.
- [ ] **Phase 7 — Bots, demo, tests, pitch.** Scripted bidders + evil-arb bot; demo script; video; polish.

## Phase 1 design notes / simplifications to revisit
- Deposits & rent are in **native ETH** for now; Phase 2 decides the LP payout currency.
- `K = 10`, `F_MAX = 5%`, `DEFAULT_FEE = 0.30%` — constants in `HarbergerAuction.sol`.
- Refunds use **pull payments** (`withdraw()`), avoiding external calls inside the PoolManager swap lock.
- Pools MUST be initialized with `LPFeeLibrary.DYNAMIC_FEE_FLAG`.
