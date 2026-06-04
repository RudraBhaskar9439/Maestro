"use client";

import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

/** Visualizes where the vault's liquidity sits — the manager-controlled active band. */
export function ConcentrationChart({ lower, upper }: { lower?: number; upper?: number }) {
  const lo = lower ?? -600;
  const hi = upper ?? 600;
  const span = Math.max(2400, Math.abs(lo) * 2, Math.abs(hi) * 2);

  const data: { tick: number; liq: number }[] = [];
  for (let t = -span; t <= span; t += 60) {
    data.push({ tick: t, liq: t >= lo && t <= hi ? 1 : 0.04 });
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
            ticks={[-span, lo, 0, hi, span]}
          />
          <YAxis hide domain={[0, 1.1]} />
          <ReferenceLine x={0} stroke="#6d4bff" strokeDasharray="4 3" label={{ value: "price", fill: "#8b97b8", fontSize: 10, position: "top" }} />
          <Area type="stepAfter" dataKey="liq" stroke="#22d3ee" strokeWidth={2} fill="url(#liqFill)" isAnimationActive />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
