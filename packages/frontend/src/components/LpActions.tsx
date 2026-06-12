"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import { MAESTRO, maestroHookAbi, erc20Abi, TOKEN0, TOKEN1 } from "../lib/maestro";
import { unichainSepolia } from "../lib/chain";
import { txUrl } from "../lib/explorer";

/** Wired LP actions: deposit (only approves tokens that need it), partial/max withdraw, claim rent. */
export function LpActions({ shares }: { shares?: bigint }) {
  const [amount, setAmount] = useState("10");
  const [wAmount, setWAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

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

  const write = async (args: Parameters<typeof writeContractAsync>[0]) => {
    const h = await writeContractAsync({ chainId: unichainSepolia.id, ...args });
    setLastTx(h);
    return h;
  };

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
        setBusy(`approving ${TOKEN0.symbol}…`);
        await write({ address: MAESTRO.currency0, abi: erc20Abi, functionName: "approve", args: [MAESTRO.hook, maxUint256] });
      }
      if (a1 === undefined || a1 < amt) {
        setBusy(`approving ${TOKEN1.symbol}…`);
        await write({ address: MAESTRO.currency1, abi: erc20Abi, functionName: "approve", args: [MAESTRO.hook, maxUint256] });
      }
      setBusy("depositing…");
      await write({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "deposit", args: [amt, amt] });
      refetch();
    });
  }

  function withdraw() {
    if (!shares) return;
    return run("withdrawing…", async () => {
      // Parse the requested share amount; clamp to the held balance so "Max" (or any
      // over-entry) withdraws the exact held shares without reverting.
      let req = parseUnits(wAmount || "0", 18);
      if (req <= BigInt(0)) {
        setErr("Enter a share amount to withdraw");
        return;
      }
      if (req > shares) req = shares;
      await write({ address: MAESTRO.hook, abi: maestroHookAbi, functionName: "withdraw", args: [req] });
    });
  }

  function setMax() {
    if (shares) setWAmount(formatUnits(shares, 18));
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
        Wrong network, switch to Unichain Sepolia
      </button>
    );
  }

  const status = busy ?? (confirming ? "confirming…" : isSuccess ? "confirmed ✓" : null);
  const avail = shares ? Number(formatUnits(shares, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0";
  const inputCls =
    "mono w-32 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]";
  const btnCls =
    "rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* Deposit + Claim */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className={inputCls}
          placeholder="amount"
        />
        <button onClick={deposit} disabled={!!busy} className={btnCls}>
          Deposit
        </button>
        <button
          onClick={claim}
          disabled={!!busy}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
        >
          Claim Rent
        </button>
      </div>

      {/* Withdraw with Max */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={wAmount}
            onChange={(e) => setWAmount(e.target.value)}
            inputMode="decimal"
            className={inputCls}
            placeholder="shares"
          />
          <button onClick={withdraw} disabled={!!busy || !shares} className={btnCls}>
            Withdraw
          </button>
        </div>
        <div className="flex items-center gap-2 pl-1 text-xs text-[var(--muted)]">
          <span>{avail} shares available</span>
          <button onClick={setMax} disabled={!shares} className="font-medium text-[var(--accent)] hover:underline disabled:opacity-40">
            Max
          </button>
        </div>
      </div>

      {(status || err || lastTx) && (
        <div className="flex flex-wrap items-center gap-3">
          {status && <span className="mono text-xs text-[var(--muted)]">{status}</span>}
          {err && <span className="mono max-w-md truncate text-xs text-red-400">{err}</span>}
          {lastTx && (
            <a
              href={txUrl(lastTx)}
              target="_blank"
              rel="noreferrer"
              className="mono text-xs text-[var(--accent)] underline-offset-2 hover:underline"
            >
              tx {lastTx.slice(0, 10)}… ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
