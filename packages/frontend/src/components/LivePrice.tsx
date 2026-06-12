"use client";

import { useEffect, useState } from "react";

// Pyth ETH/USD feed — the exact price the Reactive manager reacts to.
const ETH_USD_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

/** Live ETH/USD from Pyth Hermes (refreshes every 5s). null until first load. */
export function useEthUsd() {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${ETH_USD_ID}`,
        );
        const d = await r.json();
        const p = d?.parsed?.[0]?.price;
        if (p && active) setPrice(Number(p.price) * Math.pow(10, Number(p.expo)));
      } catch {
        /* keep prior value on transient failure */
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  return price;
}
