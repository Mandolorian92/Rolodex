"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents, formatPriceType } from "@/lib/format";

export interface PricePoint {
  capturedAt: string;
  price: number;
  priceType: string;
}

export default function PriceHistoryChart({ snapshots }: { snapshots: PricePoint[] }) {
  const priceTypes = useMemo(() => [...new Set(snapshots.map((s) => s.priceType))], [snapshots]);
  const [activeType, setActiveType] = useState(priceTypes[0] ?? "");

  const data = snapshots
    .filter((s) => s.priceType === activeType)
    .map((s) => ({ ...s, date: new Date(s.capturedAt).toLocaleDateString() }));

  if (priceTypes.length === 0) {
    return <p className="text-sm text-zinc-500">No price history yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {priceTypes.map((type) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              type === activeType ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {formatPriceType(type)}
          </button>
        ))}
      </div>
      <div className="h-64 w-full rounded-lg border border-zinc-800 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
            <YAxis
              stroke="#71717a"
              fontSize={12}
              tickFormatter={(v) => formatCents(v)}
              domain={["dataMin", "dataMax"]}
            />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12 }}
              formatter={(value) => formatCents(Number(value))}
            />
            <Line type="monotone" dataKey="price" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
