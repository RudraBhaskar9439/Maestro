// Live Maestro deployment (see docs/DEPLOYMENTS.md).
export const MAESTRO = {
  hook: "0x9d756CfA7a0eb3a83e1b6792037b6F950af5eac0" as `0x${string}`,
  managerCallback: "0x94535D4EC8c013F6D669ae72ab2683aC7EE820C4" as `0x${string}`,
  rsc: "0x07A577d7cB5De074841e7A47f12Ed3E7dEfde923" as `0x${string}`, // on Reactive Lasna
  currency0: "0x4d10aEc03a166d24b214eEDBa7B75c5B4Af3e6aD" as `0x${string}`,
  currency1: "0x83981Eb34e5e68B7E406bc2a5CE0d47495406fc2" as `0x${string}`,
  poolId: "0x86f460d7dec81de8bd87eacd1896fcc8be6319dd82064704237a870ea41145fb" as `0x${string}`,
} as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Minimal ABI: the reads/writes/events the dashboard uses.
export const maestroHookAbi = [
  { type: "function", name: "positionLiquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "totalShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rentPerShare", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tickLower", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
  { type: "function", name: "tickUpper", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
  { type: "function", name: "oracleTick", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
  { type: "function", name: "K", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "F_MAX", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  {
    type: "function",
    name: "currentFee",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ type: "uint24" }],
  },
  {
    type: "function",
    name: "pendingRent",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sharesOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getLease",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "manager", type: "address" },
          { name: "rentRate", type: "uint128" },
          { name: "deposit", type: "uint128" },
          { name: "fee", type: "uint24" },
          { name: "lastChargeBlock", type: "uint64" },
          { name: "pendingBidder", type: "address" },
          { name: "pendingRent", type: "uint128" },
          { name: "pendingDeposit", type: "uint128" },
          { name: "pendingActiveBlock", type: "uint64" },
          { name: "accruedRent", type: "uint256" },
          { name: "totalRentCharged", type: "uint256" },
        ],
      },
    ],
  },
  // writes
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "claimRent", stateMutability: "nonpayable", inputs: [], outputs: [] },
  // events
  {
    type: "event",
    name: "Repositioned",
    inputs: [
      { name: "manager", type: "address", indexed: true },
      { name: "tickLower", type: "int24", indexed: false },
      { name: "tickUpper", type: "int24", indexed: false },
      { name: "liquidity", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BidPlaced",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "bidder", type: "address", indexed: true },
      { name: "rentRate", type: "uint128", indexed: false },
      { name: "activeBlock", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ManagerChanged",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "oldManager", type: "address", indexed: true },
      { name: "newManager", type: "address", indexed: true },
      { name: "rentRate", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RentClaimed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
