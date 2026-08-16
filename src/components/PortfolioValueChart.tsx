"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "@/lib/format";

export interface PortfolioPoint {
  date: string;
  value: number;
}

export default function PortfolioValueChart({ points }: { points: PortfolioPoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-zinc-500">Not enough price history yet to chart portfolio value over time.</p>;
  }

  const data = points.map((p) => ({ ...p, date: new Date(p.date).toLocaleDateString() }));

  return (
    <div className="h-64 w-full rounded-lg border border-zinc-800 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
          <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => formatCents(v)} domain={["dataMin", "dataMax"]} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12 }}
            formatter={(value) => formatCents(Number(value))}
          />
          <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#portfolioFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
