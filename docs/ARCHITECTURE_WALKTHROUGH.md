# Maestro — Architecture Walkthrough (point-by-point narration)

Read this while pointing at each block of `maestro-architecture.drawio.xml`.
Go in this order — it follows the flow of value through the system. ≈ 2–2.5 min.
`[POINT]` = where to point/highlight. Everything else is spoken.

---

### 0 · The big picture
`[POINT: sweep across all three big blocks]`
"At a high level, Maestro lives in three domains. On the left, the **frontend**. In the middle, **Unichain Sepolia**, where the hook and the pool live. And on the right, the **Reactive Network**, which runs our autonomous manager — fed by a price feed on **Ethereum Sepolia**. Let me walk through each piece."

### 1 · The frontend
`[POINT: FRONTEND block — top to bottom]`
"The frontend is a Next.js app. It has the landing page and the dashboard, which **reads the live pool state every block.** It lets a user act as an LP — deposit, withdraw, and claim rent — and it shows a live activity feed with explorer links to verify everything on-chain."

### 2 · Frontend → the hook
`[POINT: the 'deposit · read state' arrow]`
"When a user deposits or reads state, those calls go straight to our hook on Unichain Sepolia. So everything you see in the UI is backed by a real on-chain call."

### 3 · Unichain Sepolia — the hook
`[POINT: the big 'MAESTRO HOOK' yellow box]`
"This is the core: the **MaestroHook**, built on top of a **HarbergerAuction** base contract. It's a Uniswap v4 hook, so the pool calls into it at specific moments — these four hook points up top: **beforeSwap, afterSwap, beforeAddLiquidity, and beforeRemoveLiquidity.**"

### 4 · The hook-owned vault
`[POINT: green 'Hook-owned liquidity vault' box]`
"First, all the liquidity is **owned by the hook itself.** LPs deposit through the hook and receive shares; the hook accrues rent to those shares through a per-share accumulator. And inside the same contract is the **Harberger auction** — anyone can bid a per-block rent to become the manager; the winner takes over after a ten-block delay and then pays rent every block."

### 5 · Hook Point 1 — beforeSwap
`[POINT: orange 'beforeSwap — Hook Point 1' box]`
"Now the hook points. **Before every swap,** the hook does two things: it runs `_poke`, which **charges the manager's rent and promotes any pending auction winner,** and it **overrides the swap fee** with the fee the manager has chosen — capped at five percent."

### 6 · Hook Point 2 — before add / remove liquidity
`[POINT: red 'beforeAddLiquidity / beforeRemoveLiquidity — Hook Point 2' box]`
"**Before anyone adds or removes liquidity,** the hook reverts. This is what enforces hook-owned liquidity — you can't bypass the hook and add liquidity directly. That's what gives the manager full control of the position."

### 7 · Hook Point 3 — afterSwap
`[POINT: orange 'afterSwap — Hook Point 3' box]`
"And **after every swap,** the hook takes the rent it just charged and **distributes it across the LP shares,** updating the accounting. So trading is what pays the LPs."

### 8 · Events → the frontend
`[POINT: top 'MaestroHook events' box, then the 'emits event' arrow, then 'events → activity feed']`
"Every action emits an event — deposits, bids, manager changes, repositions, rent claims. The frontend reads those events to power that live activity feed I showed earlier."

### 9 · ManagerCallback — the manager on Unichain
`[POINT: bottom green 'ManagerCallback' box, then the 'bid · repositionTo' arrow up into the hook]`
"So who actually becomes the manager? This contract — **ManagerCallback.** It wins the auction and repositions the pool. But it doesn't act on its own — it only accepts instructions from our Reactive contract, enforced by these auth checks. So let's follow where those instructions come from."

### 10 · Ethereum Sepolia — the price origin
`[POINT: 'Ethereum Sepolia (origin)' block — Pyth]`
"It starts here, on Ethereum Sepolia. A **Pyth** oracle publishes an ETH/USD price update — a `PriceFeedUpdate` event."

### 11 · Reactive — the autonomous brain
`[POINT: 'Reactive' block — MaestroManagerRSC]`
"Our **Reactive Smart Contract** is subscribed to that event. When the price updates, its `react` function runs **automatically** — it decodes the new price, picks the new tick band, and emits a cross-chain callback. No keeper, no bot."

### 12 · The cross-chain hop
`[POINT: 'Callback proxy [SYSTEM]', then the 'cross-chain callback → repositionTo' arrow back into Unichain]`
"That callback goes through the Reactive system contract, crosses chains, and lands back on Unichain — calling **ManagerCallback**, which repositions the pool to follow the price."

### 13 · The full loop
`[POINT: trace the arrows — Pyth → RSC → callback → ManagerCallback → hook → vault]`
"So that's the complete loop: a price moves on Ethereum, the Reactive contract reacts on its own, and the liquidity on Unichain re-concentrates around the new price — fully autonomous, across three chains. The frontend on the left just watches it all happen, live and verifiable."

---

### Optional one-liner to close the architecture section
"Two halves: the **hook** turns the pool into an auction that pays LPs, and the **Reactive manager** runs that auction's winner autonomously across chains. That's Maestro."
