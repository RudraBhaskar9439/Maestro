#!/usr/bin/env bash
# Maestro live health check — verifies every layer is deployed and sane on testnet.
# Usage: bash scripts/healthcheck.sh   (read-only; no private key needed)
set -uo pipefail

UNI=https://unichain-sepolia-rpc.publicnode.com
LASNA=https://lasna-rpc.rnk.dev/
HOOK=0x9d756CfA7a0eb3a83e1b6792037b6F950af5eac0
MGR=0x94535D4EC8c013F6D669ae72ab2683aC7EE820C4
RSC=0x07A577d7cB5De074841e7A47f12Ed3E7dEfde923
POOL=0x86f460d7dec81de8bd87eacd1896fcc8be6319dd82064704237a870ea41145fb
ZERO=0x0000000000000000000000000000000000000000

ok(){ echo "  ✅ $1"; }
no(){ echo "  ❌ $1"; FAILED=1; }
FAILED=0
deployed(){ [ "$(cast code "$1" --rpc-url "$2" 2>/dev/null)" != "0x" ] && [ -n "$(cast code "$1" --rpc-url "$2" 2>/dev/null)" ]; }

echo "════════ Maestro health check ════════"

echo "── Unichain Sepolia (pool + hook) ──"
deployed "$HOOK" "$UNI" && ok "MaestroHook deployed" || no "MaestroHook not deployed"
deployed "$MGR"  "$UNI" && ok "ManagerCallback deployed" || no "ManagerCallback not deployed"

FEE=$(cast call "$HOOK" 'currentFee(bytes32)(uint24)' "$POOL" --rpc-url "$UNI" 2>/dev/null)
LIQ=$(cast call "$HOOK" 'positionLiquidity()(uint128)' --rpc-url "$UNI" 2>/dev/null)
SHARES=$(cast call "$HOOK" 'totalShares()(uint256)' --rpc-url "$UNI" 2>/dev/null)
LO=$(cast call "$HOOK" 'tickLower()(int24)' --rpc-url "$UNI" 2>/dev/null)
HI=$(cast call "$HOOK" 'tickUpper()(int24)' --rpc-url "$UNI" 2>/dev/null)
MANAGER=$(cast call "$HOOK" 'getLease(bytes32)((address,uint128,uint128,uint24,uint64,address,uint128,uint128,uint64,uint256,uint256))' "$POOL" --rpc-url "$UNI" 2>/dev/null | tr -d '() ' | cut -d',' -f1)

[ -n "$LIQ" ] && [ "$LIQ" != "0" ] && ok "pool has liquidity ($LIQ)" || no "no liquidity"
[ -n "$SHARES" ] && [ "$SHARES" != "0" ] && ok "LP shares outstanding ($SHARES)" || no "no shares"
[ "${MANAGER,,}" != "${ZERO,,}" ] && [ -n "$MANAGER" ] && ok "auction manager active ($MANAGER)" || no "no manager"
echo "     fee=$FEE  range=[$LO, $HI]"

echo "── Reactive Lasna (autonomous manager) ──"
deployed "$RSC" "$LASNA" && ok "MaestroManagerRSC deployed" || no "RSC not deployed"

echo "──────────────────────────────────────"
[ "$FAILED" = "0" ] && echo "RESULT: ✅ all systems live on testnet" || echo "RESULT: ❌ something is down (see above)"
