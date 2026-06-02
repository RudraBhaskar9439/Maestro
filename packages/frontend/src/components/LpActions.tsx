"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import { MAESTRO, maestroHookAbi, erc20Abi } from "../lib/maestro";

/** Wired LP actions: deposit (with approvals), withdraw, claim rent. */
export function LpActions({ shares }: { shares?: bigint }) {
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState<string | null>(null);
  const { writeContract, writeContractAsync, data: hash } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  async function deposit() {
    try {
      setBusy("approving currency0…");
      await writeContractAsync({
        address: MAESTRO.currency0,
        abi: erc20Abi,
        functionName: "approve",
        args: [MAESTRO.hook, maxUint256],
      });
      setBusy("approving currency1…");
      await writeContractAsync({
        address: MAESTRO.currency1,
        abi: erc20Abi,
        functionName: "approve",
        args: [MAESTRO.hook, maxUint256],
      });
      setBusy("depositing…");
      const amt = parseUnits(amount || "0", 18);
      await writeContractAsync({
        address: MAESTRO.hook,
        abi: maestroHookAbi,
        functionName: "deposit",
        args: [amt, amt],
      });
    } finally {
      setBusy(null);
    }
  }

  function withdrawAll() {
    if (!shares) return;
    writeContract({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "withdraw", args: [shares] });
  }

  function claim() {
    writeContract({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "claimRent", args: [] });
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
        className="rounded-md border border-[#232329] bg-[#16161b] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
      >
        Withdraw all
      </button>
      <button
        onClick={claim}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90"
      >
        Claim Rent
      </button>
      {status && <span className="mono text-xs text-[var(--muted)]">{status}</span>}
    </div>
  );
}
