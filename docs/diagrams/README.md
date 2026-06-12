# Maestro architecture diagrams

Hand-editable Excalidraw diagrams for the docs, pitch deck, and demo.

| File | Shows |
|------|-------|
| `05-internals.excalidraw` | **Internal hook architecture** — UML-style: callers → public API (LP / auction / manager) → engine (`_poke`, `unlockCallback`) → state (vault + `leases`) → Uniswap v4 PoolManager + Pyth. Shows how the contracts work *inside* |
| `04-story.excalidraw` | **Narration storyboard** — 7 numbered scenes (problem → am-AMM → auction → manager's job → autonomous twist → cross-chain brain → result). Walk through 1→7 on camera; each card has a one-line story beat to read aloud |
| `00-overview.excalidraw` | **Master board** — the whole system on one canvas: three chain swimlanes (Eth Sepolia · Reactive Lasna · Unichain), every contract, and the participants (LPs / swappers / bidders) with all flows |
| `01-architecture.excalidraw` | Cross-chain flow: Pyth (Eth Sepolia) → RSC (Reactive Lasna) → ManagerCallback → MaestroHook → Pool (Unichain) |
| `02-auction-lifecycle.excalidraw` | Harberger auction: bid → K-block delay → manager → fee/reposition → rent to LPs → outbid loop |
| `03-lp-swap-flow.excalidraw` | LP deposit → hook-owned vault → shares; swapper → dynamic fee → rent/fees claimable by LPs |

## draw.io version

`maestro-architecture.drawio.xml` — the swimlane architecture (FRONTEND · Unichain Sepolia · Reactive
+ Ethereum Sepolia origin), ready to import into [draw.io / diagrams.net](https://app.diagrams.net):
*File ▸ Open* (or *Import*) → pick the file. Big colored role-blocks with nested component boxes and
labeled cross-chain arrows — fully editable.

## View

Each diagram is emitted in **two** formats:

- **`.svg`** — open in any browser, VS Code's built-in preview, or drop straight into slides/README. No editor needed. **Use these if the VS Code Excalidraw extension hangs on "loading".**
- **`.excalidraw`** — the editable source. Open at **excalidraw.com** → *File ▸ Open*, or in the VS Code *Excalidraw* extension, to rearrange/restyle, then re-export.

## Regenerate

Both `.excalidraw` and `.svg` are produced by one script so layout/labels stay in sync with the code:

```bash
node docs/diagrams/generate.mjs
```

## Excalidraw MCP server

This repo is wired with the `excalidraw-mcp` server (see `.mcp.json`). After you
**restart Claude Code** (so it picks up `.mcp.json`), Claude can create and edit
Excalidraw elements programmatically — ask it to draw or revise a diagram and it
will use the MCP tools directly.
