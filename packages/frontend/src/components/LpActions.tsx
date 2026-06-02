"use client";

import { useState } from "react";
import { useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import { MAESTRO, maestroHookAbi, erc20Abi } from "../lib/maestro";
import { unichainSepolia } from "../lib/chain";

/** Wired LP actions: deposit (with approvals), withdraw, claim rent. Enforces Unichain Sepolia. */
export function LpActions({ shares }: { shares?: bigint }) {
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, data: hash } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const wrongNetwork = chainId !== unichainSepolia.id;

  async function ensureChain() {
    if (chainId !== unichainSepolia.id) {
      await switchChainAsync({ chainId: unichainSepolia.id });
    }
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await ensureChain();
      setBusy(label);
      await fn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.split("\n")[0]);
    } finally {
      setBusy(null);
    }
  }

  const write = (args: Parameters<typeof writeContractAsync>[0]) =>
    writeContractAsync({ chainId: unichainSepolia.id, ...args });

  function deposit() {
    return run("depositing…", async () => {
      const amt = parseUnits(amount || "0", 18);
      setBusy("approving currency0…");
      await write({ address: MAESTRO.currency0, abi: erc20Abi, functionName: "approve", args: [MAESTRO.hook, maxUint256] });
      setBusy("approving currency1…");
      await write({ address: MAESTRO.currency1, abi: erc20Abi, functionName: "approve", args: [MAESTRO.hook, maxUint256] });
      setBusy("depositing…");
      await write({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "deposit", args: [amt, amt] });
    });
  }

  function withdrawAll() {
    if (!shares) return;
    return run("withdrawing…", () =>
      write({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "withdraw", args: [shares] }),
    );
  }

  function claim() {
    return run("claiming…", () =>
      write({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "claimRent", args: [] }),
    );
  }

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChainAsync({ chainId: unichainSepolia.id }).catch(() => {})}
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20"
      >
        Wrong network — switch to Unichain Sepolia
      </button>
    );
  }

  const status = busy ?? (confirming ? "confirming…" : isSuccess ? "confirmed ✓" : null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="mono w-28 rounded-md border border-[#232329] bg-[#0c0c0f] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="amount"
        />
        <button
          onClick={deposit}
          disabled={!!busy}
          className="rounded-md border border-[#232329] bg-[#16161b] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50"
        >
          Deposit
        </button>
      </div>
      <button
        onClick={withdrawAll}
        disabled={!!busy}
        className="rounded-md border border-[#232329] bg-[#16161b] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50"
      >
        Withdraw all
      </button>
      <button
        onClick={claim}
        disabled={!!busy}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
      >
        Claim Rent
      </button>
      {status && <span className="mono text-xs text-[var(--muted)]">{status}</span>}
      {err && <span className="mono text-xs text-red-400">{err}</span>}
    </div>
  );
}
