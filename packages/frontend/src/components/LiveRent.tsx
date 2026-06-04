"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";

/**
 * Smoothly counts rent up every animation frame, so LP earnings visibly tick in
 * real time. `base` is the on-chain-derived value (resets the baseline whenever it
 * updates); `ratePerBlock` is the manager's rent; blocks are ~1s on Unichain Sepolia.
 */
export function LiveRent({
  base,
  ratePerBlock,
  blockTimeMs = 1000,
}: {
  base?: bigint;
  ratePerBlock?: bigint;
  blockTimeMs?: number;
}) {
  const [display, setDisplay] = useState<number | null>(null);
  const ref = useRef<{ baseNum: number; ratePerMs: number; start: number } | null>(null);

  useEffect(() => {
    if (base === undefined) return;
    const baseNum = Number(formatUnits(base, 18));
    const ratePerMs = ratePerBlock ? Number(formatUnits(ratePerBlock, 18)) / blockTimeMs : 0;
    ref.current = { baseNum, ratePerMs, start: performance.now() };
    setDisplay(baseNum);
  }, [base, ratePerBlock, blockTimeMs]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const r = ref.current;
      if (r) setDisplay(r.baseNum + r.ratePerMs * (performance.now() - r.start));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (display === null) return <>—</>;
  return <>{display.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}</>;
}
