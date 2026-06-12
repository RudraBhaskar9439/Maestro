"use client";

import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

/** Visualizes where the vault's liquidity sits — the manager-controlled active band. */
export function ConcentrationChart({ lower, upper }: { lower?: number; upper?: number }) {
  const lo = lower ?? -600;
  const hi = upper ?? 600;
  // Center the view on the active band — it can sit at any tick (e.g. ~74,700 for ETH ≈ $1,754).
  const center = Math.round((lo + hi) / 2);
  const half = Math.max(1200, (hi - lo) * 2);
  const start = center - half;
  const end = center + half;
  const step = Math.max(60, Math.round((end - start) / 80 / 60) * 60);

  const data: { tick: number; liq: number }[] = [];
  for (let t = start; t <= end; t += step) {
    data.push({ tick: t, liq: t >= lo && t <= hi ? 1 : 0.04 });
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 12 }}>
          <defs>
            <linearGradient id="liqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="tick"
            tick={{ fill: "#8b97b8", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#1e2840" }}
            ticks={[start, lo, center, hi, end]}
          />
          <YAxis hide domain={[0, 1.1]} />
          <ReferenceLine
            x={center}
            stroke="#6d4bff"
            strokeDasharray="4 3"
            label={{ value: "price", fill: "#a9b2cf", fontSize: 10, position: "insideTopRight" }}
          />
          <Area type="stepAfter" dataKey="liq" stroke="#22d3ee" strokeWidth={2} fill="url(#liqFill)" isAnimationActive />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
