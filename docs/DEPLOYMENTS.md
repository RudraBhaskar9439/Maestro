# Maestro — Live Testnet Deployment

## Unichain Sepolia (chain id 1301) — deployed ✅

| Contract | Address |
| --- | --- |
| MaestroHook | `0x9d756CfA7a0eb3a83e1b6792037b6F950af5eac0` |
| ManagerCallback | `0x94535D4EC8c013F6D669ae72ab2683aC7EE820C4` |
| currency0 (MT0) | `0x4d10aEc03a166d24b214eEDBa7B75c5B4Af3e6aD` |
| currency1 (MT1) | `0x83981Eb34e5e68B7E406bc2a5CE0d47495406fc2` |
| PoolId | `0x86f460d7dec81de8bd87eacd1896fcc8be6319dd82064704237a870ea41145fb` |
| Pyth | `0x2880aB155794e7179c9eE2e38200202908C17B43` |
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` |

Deployer: `0xd1DcAAFf9356d5a42f2eE6F90179C4509386a83f`

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
