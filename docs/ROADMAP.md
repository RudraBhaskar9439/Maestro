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
- [x] **Phase 4 — Reactive autonomous manager (Novel #2).**
  - `packages/contracts/src/reactive/ManagerCallback.sol` (Unichain): an `AbstractCallback` that wins the auction (becomes manager) and exposes `repositionTo`/`updateFee`, callable only by the authorized Reactive callback proxy + bound RVM id. Drives `hook.reposition()` / `hook.setFee()`.
  - `packages/reactive/src/MaestroManagerRSC.sol` (Reactive Network): `AbstractReactive` that subscribes to the PoolManager `Swap` event for the pool and, on each price move, emits a cross-chain `Callback` computing a fresh concentration band around the new tick. The trustless, sequencer-independent manager — not a keeper.
  - 4/4 callback tests passing (callback-contract-is-manager, authorized-reposition, authorized-fee-update, unauthorized-reverts). 15/15 contract tests total.
  - **Note:** the live cross-chain relay (RSC react → proxy → ManagerCallback) is exercised on Reactive testnet at deploy time (Phase 7); the Unichain-side wiring is unit-tested.
- [x] **Phase 5 — Pyth oracle + LVR-aware concentration.**
  - `src/libraries/OracleMath.sol`: converts a Pyth price → Uniswap sqrtPriceX96 / tick.
  - Hook reads Pyth (`setOracle`, `oracleTick()`); manager-gated `repositionToOracle(halfWidth)` concentrates liquidity around the TRUE (oracle) price — band spans current tick → oracle tick so it stays active and covers the arbitrage path. This neutralizes LVR by placing liquidity where the price actually is, instead of the stale pool tick.
  - `test/Oracle.t.sol` with MockPyth: 5/5 (price→tick at parity & moved, tracks-true-price reposition, manager-only, set-once). Full suite: 26/26.
  - **Framing/TODO:** Phase 5 implements LVR *mitigation* via oracle-aware placement (the functional, real approach). Explicit arb-swap profit capture by the manager is a documented alternative, not built.
- [ ] **Phase 6 — Frontend dashboard.** AuctionPanel, LPDashboard, ComparisonChart, EventFeed.
- [~] **Phase 7 — Deploy + verify workflow (in progress).**
  - `test/EndToEnd.t.sol` — full product lifecycle in one test (deposit → auction → autonomous manager → swap → rent→LP → Pyth move → autonomous reposition → swap → claim → withdraw → conservation). ✅ passing. **Full suite: 27/27.**
  - **CRITICAL fix:** `MaestroHook` was 37,555 B (over the 24,576 EIP-170 limit) — would have failed on real testnet. Enabled `optimizer + optimizer_runs=100 + via_ir` in foundry.toml → **15,985 B** (deployable).
  - Deployed the hook to a local anvil node successfully (deploy flow validated). Fixed `00_DeployHook.s.sol` (added BEFORE_INITIALIZE flag).
  - **via_ir gotcha (tests):** the compiler caches `block.number` within a function frame; chained `vm.roll(block.number+N)` in one test fn uses a stale base. Use absolute roll targets (done in EndToEnd).
  - TODO: consolidated `DeployMaestro` script (hook+pool+oracle+ManagerCallback), RSC deploy on Reactive testnet, `docs/DEPLOY.md` runbook, actual testnet broadcast (needs funded key/RPC — user runs), demo video.

## Phase 1 design notes / simplifications to revisit
- Deposits & rent are in the pool's **`currency1`** (ERC-20); rent is donated to LPs via v4 `donate()`. Native-currency pools are rejected (`NativeCurrencyNotSupported`).
- `K = 10`, `F_MAX = 5%`, `DEFAULT_FEE = 0.30%` — constants in `HarbergerAuction.sol`.
- Refunds use **pull payments** (`withdraw()`), avoiding external calls inside the PoolManager swap lock.
- Pools MUST be initialized with `LPFeeLibrary.DYNAMIC_FEE_FLAG`.
