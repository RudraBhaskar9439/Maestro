"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, decodeEventLog, formatUnits } from "viem";
import { unichainSepolia } from "../lib/chain";
import { MAESTRO, maestroHookAbi } from "../lib/maestro";
import { txUrl } from "../lib/explorer";

const client = createPublicClient({ chain: unichainSepolia, transport: http() });

type Item = { block: bigint; tag: string; label: string; detail: string; tx: string };

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function units(v: bigint) {
  const n = Number(formatUnits(v, 18));
  return n >= 1000 ? n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 }) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function tok(v: bigint) {
  const n = Number(formatUnits(v, 18));
  return n < 0.0001 && n > 0 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function format(name: string, a: any, block: bigint, tx: string): Item | null {
  switch (name) {
    case "Deposit":
      return { block, tx, tag: "LP", label: "Deposit", detail: `${units(a.shares)} shares` };
    case "Withdraw":
      return { block, tx, tag: "LP", label: "Withdraw", detail: `${units(a.shares)} shares` };
    case "RentClaimed":
      return { block, tx, tag: "LP", label: "Claim rent", detail: `${tok(a.amount)}` };
    case "Repositioned":
      return { block, tx, tag: "MGR", label: "Reposition", detail: `[${a.tickLower}, ${a.tickUpper}]` };
    case "RepositionedToOracle":
      return { block, tx, tag: "MGR", label: "Reposition (oracle)", detail: `[${a.tickLower}, ${a.tickUpper}]` };
    case "ManagerChanged":
      return { block, tx, tag: "AUCTION", label: "New manager", detail: short(a.newManager) };
    case "BidPlaced":
      return { block, tx, tag: "AUCTION", label: "Bid placed", detail: `${short(a.bidder)} · rent ${tok(a.rentRate)}` };
    default:
      return null;
  }
}

export function ActivityFeed() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const latest = await client.getBlockNumber();
        const from = latest > BigInt(45000) ? latest - BigInt(45000) : BigInt(0);
        const logs = await client.getLogs({ address: MAESTRO.hook, fromBlock: from, toBlock: "latest" });
        const out: Item[] = [];
        for (const log of logs) {
          try {
            const ev = decodeEventLog({ abi: maestroHookAbi, data: log.data, topics: log.topics });
            const it = format(ev.eventName as string, ev.args, log.blockNumber ?? BigInt(0), log.transactionHash ?? "");
            if (it) out.push(it);
          } catch {
            /* skip non-matching logs */
          }
        }
        out.sort((x, y) => Number(y.block - x.block));
        if (active) setItems(out.slice(0, 8));
      } catch {
        /* RPC range limit / transient — keep prior items */
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 12000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const tagColor: Record<string, string> = {
    LP: "text-[var(--positive)] border-[var(--positive)]/30",
    MGR: "text-[var(--accent)] border-[var(--accent)]/30",
    AUCTION: "text-[#c0a3ff] border-[#c0a3ff]/30",
  };

  return (
    <div className="space-y-1.5">
      {loading && items.length === 0 && <p className="text-sm text-[var(--muted)]">loading activity…</p>}
      {!loading && items.length === 0 && <p className="text-sm text-[var(--muted)]">no recent activity in range</p>}
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm">
          <span className={`mono rounded border px-1.5 py-0.5 text-[10px] ${tagColor[it.tag] ?? "text-[var(--muted)] border-[var(--border)]"}`}>
            {it.tag}
          </span>
          <span className="text-[var(--text)]">{it.label}</span>
          <span className="mono ml-auto text-xs text-[var(--muted)]">{it.detail}</span>
          {it.tx ? (
            <a
              href={txUrl(it.tx)}
              target="_blank"
              rel="noreferrer"
              title="view transaction"
              className="mono w-24 text-right text-[11px] text-[var(--accent)] hover:underline"
            >
              #{it.block.toLocaleString()} ↗
            </a>
          ) : (
            <span className="mono w-24 text-right text-[11px] text-[var(--muted)]">#{it.block.toLocaleString()}</span>
          )}
        </div>
      ))}
    </div>
  );
}
