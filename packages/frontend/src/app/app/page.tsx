"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useReadContracts, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";
import { MAESTRO, maestroHookAbi } from "../../lib/maestro";
import { LpActions } from "../../components/LpActions";
import { unichainSepolia } from "../../lib/chain";

const hook = { address: MAESTRO.hook, abi: maestroHookAbi } as const;

function short(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}
function fmt(v: bigint | undefined, decimals = 18, digits = 4) {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
const ZERO = "0x0000000000000000000000000000000000000000";

export default function Dashboard() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const connected = mounted && isConnected;
  const wrongNetwork = connected && chainId !== unichainSepolia.id;

  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...hook, functionName: "currentFee", args: [MAESTRO.poolId] },
      { ...hook, functionName: "positionLiquidity" },
      { ...hook, functionName: "totalShares" },
      { ...hook, functionName: "tickLower" },
      { ...hook, functionName: "tickUpper" },
      { ...hook, functionName: "getLease", args: [MAESTRO.poolId] },
      { ...hook, functionName: "oracleTick" },
      { ...hook, functionName: "pendingRent", args: [(address ?? ZERO) as `0x${string}`] },
      { ...hook, functionName: "sharesOf", args: [(address ?? ZERO) as `0x${string}`] },
    ],
    query: { refetchInterval: 8000 },
  });

  const fee = data?.[0]?.result as number | undefined;
  const liquidity = data?.[1]?.result as bigint | undefined;
  const totalShares = data?.[2]?.result as bigint | undefined;
  const tickLower = data?.[3]?.result as number | undefined;
  const tickUpper = data?.[4]?.result as number | undefined;
  const lease = data?.[5]?.result as
    | { manager: string; rentRate: bigint; deposit: bigint; accruedRent: bigint; totalRentCharged: bigint }
    | undefined;
  const oracleOk = data?.[6]?.status === "success";
  const oracleTick = data?.[6]?.result as number | undefined;
  const myPending = data?.[7]?.result as bigint | undefined;
  const myShares = data?.[8]?.result as bigint | undefined;

  const hasManager = !!lease && lease.manager !== ZERO;
  const feePct = fee !== undefined ? (fee / 10000).toFixed(2) : "—";

  return (
    <div className="relative min-h-screen">
      <div className="grid-bg pointer-events-none absolute inset-0 h-[320px]" />

      <header className="relative z-10 flex items-center justify-between border-b border-[#232329] px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="text-[var(--accent)]">◆</span> MAESTRO
          </Link>
          <nav className="hidden gap-6 text-sm text-[var(--muted)] md:flex">
            <a href="#pool" className="hover:text-[var(--text)]">Pool</a>
            <a href="#auction" className="hover:text-[var(--text)]">Auction</a>
            <Link href="/docs" className="hover:text-[var(--text)]">Docs</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {wrongNetwork ? (
            <button
              onClick={() => switchChain({ chainId: unichainSepolia.id })}
              className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Wrong network · Switch
            </button>
          ) : (
            <span className="hidden items-center gap-2 rounded-full border border-[#232329] bg-[#101013] px-3 py-1.5 text-[var(--muted)] sm:flex">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--positive)]" /> Unichain Sepolia
            </span>
          )}
          {connected ? (
            <button
              onClick={() => disconnect()}
              className="mono rounded-md border border-[#232329] bg-[#16161b] px-3 py-1.5 hover:border-[var(--accent)]"
            >
              {short(address)}
            </button>
          ) : (
            <button
              onClick={() => connect({ connector: connectors[0] })}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-black hover:opacity-90"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10 pb-24">
        <div id="pool" className="mb-3 flex items-center justify-between">
          <h1 className="text-sm uppercase tracking-wider text-[var(--muted)]">Live Pool State</h1>
          <span className="mono text-xs text-[var(--muted)]">{isLoading ? "syncing…" : "● live"}</span>
        </div>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Swap Fee" value={`${feePct}%`} sub={hasManager ? "set by manager" : "default"} />
          <Stat label="Position Liquidity" value={fmt(liquidity, 0, 0)} sub="hook-owned vault" />
          <Stat label="Total LP Shares" value={fmt(totalShares, 0, 0)} />
          <Stat
            label="Active Range"
            value={tickLower !== undefined ? `${tickLower} ↔ ${tickUpper}` : "—"}
            sub="tick band"
            mono
          />
          <Stat label="Manager Rent / blk" value={fmt(lease?.rentRate)} sub="currency1" />
          <Stat label="Rent Charged (total)" value={fmt(lease?.totalRentCharged)} sub="→ to LPs" accent />
          <Stat label="Accrued Rent" value={fmt(lease?.accruedRent)} sub="pending distribution" />
          <Stat
            label="Oracle Tick (Pyth)"
            value={oracleOk ? String(oracleTick) : "stale"}
            sub={oracleOk ? "ETH/USD" : "needs fresh push"}
            mono
          />
        </section>

        <section id="auction" className="mt-6 grid gap-4 md:grid-cols-2">
          <Panel title="Harberger Auction">
            <Row k="Current Manager" v={hasManager ? short(lease!.manager) : "none"} mono />
            <Row k="Rent Rate (R)" v={`${fmt(lease?.rentRate)} /blk`} />
            <Row k="Manager Deposit" v={fmt(lease?.deposit)} />
            <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
              Anyone can outbid the manager by posting a higher per-block rent; the new bid activates
              after a <span className="text-[var(--text)]">K-block delay</span> (censorship resistance).
            </p>
          </Panel>

          <Panel title="Reactive Cross-Chain Manager">
            <Row k="RSC (Lasna)" v={short(MAESTRO.rsc)} mono />
            <Row k="Watches" v="Pyth ETH/USD · Eth Sepolia" />
            <Row k="Acts on" v="Unichain Sepolia" />
            <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
              A price update on Ethereum Sepolia triggers the Reactive Smart Contract, which fires a
              cross-chain callback that{" "}
              <span className="text-[var(--text)]">re-concentrates this pool&apos;s liquidity</span> —
              trustless, no keeper. Current band:{" "}
              <span className="mono text-[var(--text)]">
                {tickLower !== undefined ? `[${tickLower}, ${tickUpper}]` : "—"}
              </span>
              .
            </p>
          </Panel>
        </section>

        <section id="lp" className="mt-6 scroll-mt-6">
          <Panel title="Your LP Position">
            {connected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-x-10 gap-y-2">
                  <Row k="Your Shares" v={fmt(myShares, 0, 0)} />
                  <Row k="Claimable Rent" v={`${fmt(myPending)} currency1`} accent />
                </div>
                <LpActions shares={myShares} />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Connect a wallet to view your position.</p>
            )}
          </Panel>
        </section>

        <footer className="mt-12 border-t border-[#232329] pt-6 text-xs text-[var(--muted)]">
          <div className="mono flex flex-wrap gap-x-8 gap-y-1">
            <span>hook {short(MAESTRO.hook)}</span>
            <span>manager-callback {short(MAESTRO.managerCallback)}</span>
            <span>rsc {short(MAESTRO.rsc)}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-xl ${mono ? "mono" : "font-semibold"} ${accent ? "text-[var(--accent)]" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function Row({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-1.5 text-sm">
      <span className="text-[var(--muted)]">{k}</span>
      <span className={`${mono ? "mono" : ""} ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{v}</span>
    </div>
  );
}
