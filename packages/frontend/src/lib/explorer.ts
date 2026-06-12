// Block-explorer links so judges can verify every contract + transaction on-chain.
// Maestro spans three chains, each with its own explorer.

export const EXPLORER = {
  // Unichain Sepolia — the hook, pool, ManagerCallback, and tokens live here.
  unichain: "https://sepolia.uniscan.xyz",
  // Reactive Lasna — the autonomous RSC "brain" lives here.
  lasna: "https://lasna.reactscan.net",
  // Ethereum Sepolia — the Pyth price feed the RSC subscribes to.
  sepolia: "https://sepolia.etherscan.io",
} as const;

export type Chain = keyof typeof EXPLORER;

export function addressUrl(addr: string, chain: Chain = "unichain") {
  return `${EXPLORER[chain]}/address/${addr}`;
}
export function txUrl(hash: string, chain: Chain = "unichain") {
  return `${EXPLORER[chain]}/tx/${hash}`;
}
export function blockUrl(n: bigint | number, chain: Chain = "unichain") {
  return `${EXPLORER[chain]}/block/${n}`;
}
