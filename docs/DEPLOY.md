# Maestro — Testnet Deploy & Verification Runbook

Maestro spans **two chains**:

- **Unichain (Sepolia)** — the v4 pool, the `MaestroHook` (auction + vault + Pyth), and `ManagerCallback`.
- **Reactive Network (testnet)** — `MaestroManagerRSC`, which watches the pool's `Swap` events and fires
  cross-chain callbacks back to `ManagerCallback` to reposition liquidity. No human/keeper.

```
 Pyth (Unichain) ─┐                         Reactive Network
                  ▼                          ┌────────────────────┐
            ┌───────────┐   Swap event       │ MaestroManagerRSC  │
            │ v4 Pool   │ ─────────────────▶ │  (react → callback)│
            │ +MaestroHook                    └─────────┬──────────┘
            └─────▲─────┘                               │ callback
                  │ reposition()/setFee()               ▼
            ┌─────┴───────────┐   authorized   ┌────────────────────┐
            │ ManagerCallback │ ◀───────────── │ Reactive callback   │
            └─────────────────┘                │ proxy (dest chain)  │
                                               └────────────────────┘
```

> Everything below the broadcast steps requires **your funded keys** — they spend real testnet gas.
> The contract logic is already proven in-EVM by `test/EndToEnd.t.sol`; testnet additionally exercises
> the live Pyth feed and the cross-chain Reactive relay.

---

## 1. Prerequisites

- Foundry installed (`foundryup`).
- A funded EOA on **Unichain Sepolia** (gas) and on **Reactive testnet** (REACT gas).
- Two ERC-20 test tokens on Unichain Sepolia for the pair (or deploy mocks).

## 2. Addresses (current testnet values — verify against the linked sources)

Deploying on **Unichain Sepolia (1301)** with the Reactive **Lasna (5318007)** relay.

| Variable | Value | Source |
| --- | --- | --- |
| `POOL_MANAGER` | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` | Uniswap v4 deployments (Unichain Sepolia) |
| `PYTH` | `0x2880aB155794e7179c9eE2e38200202908C17B43` | Pyth EVM contract addresses (Unichain Sepolia) |
| `PRICE_ID` | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` | Pyth price-feed ids (ETH/USD) |
| `CALLBACK_PROXY` | `0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4` | Reactive Lasna → Unichain Sepolia callback proxy |
| `UNICHAIN_RPC` | `https://sepolia.unichain.org` | Unichain docs |
| `REACTIVE_RPC` | `https://lasna-rpc.rnk.dev/` | dev.reactive.network |
| `ORIGIN_CHAIN_ID` / `DEST_CHAIN_ID` | `1301` / `1301` | callback returns to Unichain Sepolia |

- `PK` — your funded test wallet (`cast wallet new`). Fund Unichain Sepolia ETH (Unichain faucet) and
  Lasna REACT gas (github.com/Reactive-Network/testnet-faucet).
- `TOKEN0` / `TOKEN1` — deploy two mocks (see below); the script sorts them.
- CREATE2 deployer (`0x4e59…4956C`) and Reactive system contract (`0x…fffFfF`) are baked into the code.

### Deploy two test tokens

```bash
forge create solmate/src/test/utils/mocks/MockERC20.sol:MockERC20 \
  --rpc-url $UNICHAIN_RPC --private-key $PK --constructor-args "Maestro0" "MT0" 18
forge create solmate/src/test/utils/mocks/MockERC20.sol:MockERC20 \
  --rpc-url $UNICHAIN_RPC --private-key $PK --constructor-args "Maestro1" "MT1" 18
# mint yourself a balance of each:
cast send <TOKEN> "mint(address,uint256)" <your_addr> 1000000000000000000000 --rpc-url $UNICHAIN_RPC --private-key $PK
```

## 3. Configure `.env`

Create `packages/contracts/.env` (git-ignored), then `source .env`:

```bash
export PK=0xYOUR_PRIVATE_KEY
export UNICHAIN_RPC=https://sepolia.unichain.org
export REACTIVE_RPC=https://lasna-rpc.rnk.dev/

export POOL_MANAGER=0x00B036B58a818B1BC34d502D3fE730Db729e62AC
export TOKEN0=0xYOUR_MOCK_TOKEN_A       # either order; the script sorts them
export TOKEN1=0xYOUR_MOCK_TOKEN_B
export PYTH=0x2880aB155794e7179c9eE2e38200202908C17B43
export PRICE_ID=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
export CALLBACK_PROXY=0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4
export TICK_SPACING=60
export MAX_AGE=120
```

## 4. Step 1 — Deploy the Unichain stack

```bash
cd packages/contracts
forge script script/DeployMaestro.s.sol:DeployMaestro \
  --rpc-url $UNICHAIN_RPC --private-key $PK --broadcast -vvvv
```

Record the logged **MaestroHook**, **ManagerCallback**, **currency0/1**, and **PoolId**.

## 5. Step 2 — Deploy the RSC on Reactive

```bash
cd ../reactive
export ORIGIN_CHAIN_ID=...        # Unichain Sepolia
export DEST_CHAIN_ID=$ORIGIN_CHAIN_ID
export POOL_MANAGER=0x...         # same as step 1
export POOL_ID=0x...              # from step 1 output
export MANAGER_CALLBACK=0x...     # from step 1 output
export HALF_WIDTH=600

forge script script/DeployRSC.s.sol:DeployRSC \
  --rpc-url $REACTIVE_RPC --private-key $PK --broadcast -vvvv
```

## 6. Step 3 — Make ManagerCallback the manager + fund the relay

```bash
HOOK=0x...; MGR=0x...; C1=0x...   # currency1 (the rent token)

# Fund ManagerCallback with currency1 for the auction bond, then win the auction:
cast send $C1 "transfer(address,uint256)" $MGR 1000000000000000000 --rpc-url $UNICHAIN_RPC --private-key $PK
cast send $MGR "enterAuction(uint128,uint256)" 1000000000000 1000000000000000000 --rpc-url $UNICHAIN_RPC --private-key $PK

# Advance past the K-block delay (a few blocks), then settle the auction:
cast send $HOOK "poke(bytes32)" $POOL_ID --rpc-url $UNICHAIN_RPC --private-key $PK
cast call $HOOK "getLease(bytes32)" $POOL_ID --rpc-url $UNICHAIN_RPC   # manager should == ManagerCallback
```

Also **fund `ManagerCallback` with native gas** on the destination chain and the **RSC** on Reactive
so callbacks can pay their debt (see Reactive "funding callbacks" docs — typically `coverDebt()` /
sending REACT to the contracts).

## 7. Step 4 — Walk the workflow

```bash
# A) LP deposits (approve the hook for both tokens, then deposit):
cast send $C0 "approve(address,uint256)" $HOOK <max> --rpc-url $UNICHAIN_RPC --private-key $PK
cast send $C1 "approve(address,uint256)" $HOOK <max> --rpc-url $UNICHAIN_RPC --private-key $PK
cast send $HOOK "deposit(uint256,uint256)" 100000000000000000000 100000000000000000000 \
  --rpc-url $UNICHAIN_RPC --private-key $PK

# B) Swap (use the Uniswap testnet UI, the UniversalRouter, or adapt script/03_Swap.s.sol).
#    Each swap charges rent -> distributed to LP shareholders.

# C) Watch the Reactive relay: a swap moves the price -> the RSC reacts -> a callback
#    repositions liquidity. Track it on the Reactive explorer and by watching events:
cast logs --address $HOOK "Repositioned(address,int24,int24,uint128)" --rpc-url $UNICHAIN_RPC

# D) LP checks + claims rent:
cast call $HOOK "pendingRent(address)" <lp> --rpc-url $UNICHAIN_RPC
cast send $HOOK "claimRent()" --rpc-url $UNICHAIN_RPC --private-key $PK
```

## 8. Verification checklist

- [ ] `DeployMaestro` succeeded and `hook address == mined address`.
- [ ] Pool initialized (dynamic-fee flag), `hook.oracleTick()` returns a sane tick.
- [ ] `ManagerCallback` is the lease manager after `enterAuction` + `poke`.
- [ ] A deposit creates shares / `positionLiquidity`.
- [ ] A swap emits `RentCharged`; `pendingRent(lp)` grows.
- [ ] After a price move, the RSC fires a callback and `Repositioned`/`AutoRepositioned` is emitted on Unichain **with no manual tx** — this is the headline.
- [ ] `claimRent()` pays the LP in currency1.

## 9. Notes / gotchas

- **Pyth freshness:** `setOracle` uses `MAX_AGE`; push a fresh price (`updatePriceFeeds`) before relying on `oracleTick()` / `repositionToOracle`, or the read reverts as stale.
- **Reactive funding:** callbacks fail silently if the callback contract / RSC can't pay their debt to the proxy — fund them.
- **Hook mining:** the hook address must encode the permission flags; `HookMiner` handles this, but the CREATE2 deployer must be the same one Foundry uses on broadcast (it is, by default).
- **Local dry run:** you can rehearse Step 1 against `anvil` (`--rpc-url http://localhost:8545` with an anvil key) before spending testnet gas.
