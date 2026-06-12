"use client";

import { useState } from "react";
import { MAESTRO } from "../lib/maestro";
import { addressUrl, type Chain } from "../lib/explorer";

type Entry = {
  name: string;
  role: string;
  address: string;
  chain: Chain;
  chainLabel: string;
  kind: "hook" | "callback" | "rsc" | "token";
};

// Every on-chain piece of Maestro, with a one-click path to verify it on the explorer.
const ENTRIES: Entry[] = [
  {
    name: "MaestroHook",
    role: "v4 hook · auction engine · hook-owned liquidity vault",
    address: MAESTRO.hook,
    chain: "unichain",
    chainLabel: "Unichain Sepolia",
    kind: "hook",
  },
  {
    name: "ManagerCallback",
    role: "cross-chain callback · wins auction · repositions the band",
    address: MAESTRO.managerCallback,
    chain: "unichain",
    chainLabel: "Unichain Sepolia",
    kind: "callback",
  },
  {
    name: "MaestroManagerRSC",
    role: "autonomous brain · watches Pyth · fires reposition",
    address: MAESTRO.rsc,
    chain: "lasna",
    chainLabel: "Reactive Lasna",
    kind: "rsc",
  },
  {
    name: "WETH (currency0)",
    role: "pool token 0",
    address: MAESTRO.currency0,
    chain: "unichain",
    chainLabel: "Unichain Sepolia",
    kind: "token",
  },
  {
    name: "USDC (currency1)",
    role: "pool token 1 · rent + deposits denominated here",
    address: MAESTRO.currency1,
    chain: "unichain",
    chainLabel: "Unichain Sepolia",
    kind: "token",
  },
];

const KIND_COLOR: Record<Entry["kind"], string> = {
  hook: "text-[var(--accent)] border-[var(--accent)]/30",
  callback: "text-[var(--accent)] border-[var(--accent)]/30",
  rsc: "text-[#c0a3ff] border-[#c0a3ff]/30",
  token: "text-[var(--muted)] border-[var(--border)]",
};

function short(a: string) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export function SystemMap() {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(addr: string) {
    navigator.clipboard?.writeText(addr).then(() => {
      setCopied(addr);
      setTimeout(() => setCopied((c) => (c === addr ? null : c)), 1200);
    });
  }

  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
        Every contract below is live on a public testnet. Click any address to verify it on the block
        explorer. This is the entire protocol, deployed and running.
      </p>
      {ENTRIES.map((e) => (
        <div
          key={e.address + e.name}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2.5 text-sm"
        >
          <span className={`mono rounded border px-1.5 py-0.5 text-[10px] uppercase ${KIND_COLOR[e.kind]}`}>
            {e.kind}
          </span>
          <span className="font-medium text-[var(--text)]">{e.name}</span>
          <span className="hidden text-xs text-[var(--muted)] md:inline">· {e.role}</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[10px] text-[var(--muted)] sm:inline">
              {e.chainLabel}
            </span>
            <button
              onClick={() => copy(e.address)}
              title="copy address"
              className="mono text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              {copied === e.address ? "copied ✓" : short(e.address)}
            </button>
            <a
              href={addressUrl(e.address, e.chain)}
              target="_blank"
              rel="noreferrer"
              title="view on explorer"
              className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--accent)] hover:border-[var(--accent)]"
            >
              verify ↗
            </a>
          </span>
        </div>
      ))}
    </div>
  );
}
