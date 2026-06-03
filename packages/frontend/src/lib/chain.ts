import { defineChain } from "viem";

/** Unichain Sepolia — where the Maestro pool + hook live. */
export const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  // publicnode first — the official sepolia.unichain.org load-balances to lagging
  // nodes and intermittently returns a zero balance.
  rpcUrls: {
    default: {
      http: ["https://unichain-sepolia-rpc.publicnode.com", "https://sepolia.unichain.org"],
    },
  },
  blockExplorers: {
    default: { name: "Uniscan", url: "https://sepolia.uniscan.xyz" },
  },
  testnet: true,
});
