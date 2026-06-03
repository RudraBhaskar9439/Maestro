"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import { MAESTRO, maestroHookAbi, erc20Abi } from "../lib/maestro";
import { unichainSepolia } from "../lib/chain";

/** Wired LP actions: deposit (only approves tokens that need it), withdraw, claim rent. */
export function LpActions({ shares }: { shares?: bigint }) {
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, data: hash } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const wrongNetwork = !!chainId && chainId !== unichainSepolia.id;

  const { data: allowances, refetch } = useReadContracts({
    contracts: [
      { address: MAESTRO.currency0, abi: erc20Abi, functionName: "allowance", args: [(address ?? "0x0") as `0x${string}`, MAESTRO.hook] },
      { address: MAESTRO.currency1, abi: erc20Abi, functionName: "allowance", args: [(address ?? "0x0") as `0x${string}`, MAESTRO.hook] },
    ],
    query: { enabled: !!address },
  });
  const a0 = allowances?.[0]?.result as bigint | undefined;
  const a1 = allowances?.[1]?.result as bigint | undefined;

  const write = (args: Parameters<typeof writeContractAsync>[0]) =>
    writeContractAsync({ chainId: unichainSepolia.id, ...args });

  async function run(label: string, fn: () => Promise<unknown>) {
    setErr(null);
    try {
      if (wrongNetwork) await switchChainAsync({ chainId: unichainSepolia.id });
      setBusy(label);
      await fn();
    } catch (e: unknown) {
      setErr((e instanceof Error ? e.message : String(e)).split("\n")[0]);
    } finally {
      setBusy(null);
    }
  }

  function deposit() {
    return run("depositing…", async () => {
      const amt = parseUnits(amount || "0", 18);
      if (a0 === undefined || a0 < amt) {
        setBusy("approving MT0…");
        await write({ address: MAESTRO.currency0, abi: erc20Abi, functionName: "approve", args: [MAESTRO.hook, maxUint256] });
      }
      if (a1 === undefined || a1 < amt) {
        setBusy("approving MT1…");
        await write({ address: MAESTRO.currency1, abi: erc20Abi, functionName: "approve", args: [MAESTRO.hook, maxUint256] });
      }
      setBusy("depositing…");
      await write({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "deposit", args: [amt, amt] });
      refetch();
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
      {err && <span className="mono max-w-md truncate text-xs text-red-400">{err}</span>}
    </div>
  );
}
