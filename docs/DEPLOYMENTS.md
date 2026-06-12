# Maestro — Live Testnet Deployment

## Unichain Sepolia (chain id 1301) — deployed ✅

**Oracle-driven deployment (band follows the live ETH/USD price). Pool initialized at $1,754.20.**

| Contract | Address |
| --- | --- |
| MaestroHook | `0xcdb58D67f4aD38705652f21407490df49Cd2eAc0` |
| ManagerCallback | `0x01462516c7B4E42d7a91807375459B3eb29807EC` |
| currency0 (WETH / MT0) | `0x4d10aEc03a166d24b214eEDBa7B75c5B4Af3e6aD` |
| currency1 (USDC / MT1) | `0x83981Eb34e5e68B7E406bc2a5CE0d47495406fc2` |
| PoolId | `0x7b120a4043ace23580655dd1cecadcde205b20f431b69a19da2c987e77f66f63` |
| Pyth | `0x2880aB155794e7179c9eE2e38200202908C17B43` |
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` |
| V4 Swap Router (arbitrage) | `0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba` |

Deployer: `0xd1DcAAFf9356d5a42f2eE6F90179C4509386a83f`

### 🎯 Autonomous oracle-driven reposition — VERIFIED LIVE (2026-06-04)
Pushed a live Pyth ETH/USD update on Ethereum Sepolia → the RSC reacted on Lasna → cross-chain
callback → the hook **re-concentrated liquidity from full-range to `[74100, 75420]`** (tick ~74,700 ≈
**$1,754**) on Unichain — autonomously, no keeper. The band now tracks the live ETH price on every update.

_Previous parity-band deployment (1:1 mock pool): hook `0x9d756…eac0`, callback `0x94535…20C4`, rsc `0x07A5…d923`._

### Verified live on Unichain Sepolia ✅
- Full stack deployed (hook + dynamic-fee pool + Pyth wired + ManagerCallback).
- LP deposit through the hook → `positionLiquidity = 1e20`.
- Auction: `ManagerCallback` bid (rent 1e12, bond 1e18) and was promoted to **manager** after the K-block delay.
- **Rent accrues per block**: after ~46 blocks, `accruedRent = totalRentCharged = 4.6e13` and the manager deposit decreased by exactly that — the am-AMM economics running on a real chain.

### Not yet exercised live
- Swap → rent *distribution* to LP shareholders (needs a v4 swap router on testnet; rent is currently accrued, distributes on a swap's afterSwap).
- Autonomous Reactive reposition (needs the RSC deployed on Lasna → blocked on REACT gas).

## Reactive Lasna (chain id 5318007) — deployed ✅

| Contract | Address |
| --- | --- |
| MaestroManagerRSC | `0x07A577d7cB5De074841e7A47f12Ed3E7dEfde923` |

Watches **Pyth `PriceFeedUpdate` (ETH/USD `0xff6149…0ace`) on Ethereum Sepolia (11155111)** and
fires a cross-chain callback to `ManagerCallback` on Unichain Sepolia (1301).

### 🎉 Autonomous cross-chain relay — VERIFIED LIVE
Pushed an ETH/USD price update on Ethereum Sepolia → the RSC reacted on Lasna → cross-chain
callback to Unichain → **the pool repositioned to [-600, 600] with no human transaction.**
Full path proven: origin event (Sepolia) → Reactive (Lasna) → destination action (Unichain).

### Cross-chain architecture note (live finding)
Unichain Sepolia (1301) **cannot be a Reactive *origin*** (subscribe reverts) — only a *destination*.
So the RSC observes the price signal on **Ethereum Sepolia** (a supported origin) and acts on
Unichain. Genuinely cross-chain. Deploy the RSC with **`forge create`** (not `forge script` — the
subscription precompile only exists on the real node), funded with `--value` REACT, payable constructor.

```bash
forge create --broadcast --rpc-url $REACTIVE_RPC --private-key $PK --legacy --value 2ether \
  src/MaestroManagerRSC.sol:MaestroManagerRSC --constructor-args \
  11155111 1301 0xDd24F84d36BF92C65F92307595335bdFab5Bbd21 \
  0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace \
  0x94535D4EC8c013F6D669ae72ab2683aC7EE820C4
```

To trigger: push a Pyth ETH/USD update on Sepolia (fetch from Hermes, call `updatePriceFeeds`).
