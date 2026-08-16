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
import { formatCents, formatPct, formatPriceType } from "@/lib/format";

export type PriceSourceValue = "PRICECHARTING_GUIDE" | "PRICECHARTING_SALE" | "EBAY_SALE" | "MANUAL";

export interface PricePoint {
  capturedAt: string;
  price: number;
  priceType: string;
  source: PriceSourceValue;
}

const SOURCE_META: Record<PriceSourceValue, { label: string; color: string }> = {
  PRICECHARTING_GUIDE: { label: "Guide price", color: "#34d399" },
  PRICECHARTING_SALE: { label: "PriceCharting sale", color: "#38bdf8" },
  EBAY_SALE: { label: "eBay sale", color: "#fbbf24" },
  MANUAL: { label: "Manual", color: "#a1a1aa" },
};

function isSale(source: PriceSourceValue): boolean {
  return source === "PRICECHARTING_SALE" || source === "EBAY_SALE";
}

function CustomDot(props: {
  cx?: number;
  cy?: number;
  payload?: { source: PriceSourceValue };
  isLast?: boolean;
}) {
  const { cx, cy, payload, isLast } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const color = SOURCE_META[payload.source]?.color ?? "#34d399";
  return <circle cx={cx} cy={cy} r={isLast ? 5 : 3} fill={color} stroke="#09090b" strokeWidth={isLast ? 2 : 1} />;
}

export default function PriceHistoryChart({ snapshots }: { snapshots: PricePoint[] }) {
  const priceTypes = useMemo(() => [...new Set(snapshots.map((s) => s.priceType))], [snapshots]);
  const [activeType, setActiveType] = useState(priceTypes[0] ?? "");

  const typeData = snapshots
    .filter((s) => s.priceType === activeType)
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  const data = typeData.map((s, i) => ({
    ...s,
    date: new Date(s.capturedAt).toLocaleDateString(),
    isLast: i === typeData.length - 1,
  }));

  const sourcesPresent = [...new Set(typeData.map((s) => s.source))];

  const latestGuide = [...typeData].reverse().find((s) => s.source === "PRICECHARTING_GUIDE");
  const latestSale = [...typeData].reverse().find((s) => isSale(s.source));

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

      {latestSale && (
        <div className="rounded-lg border border-sky-900/60 bg-sky-500/5 px-4 py-3 text-sm">
          <span className="font-semibold text-zinc-100">{formatCents(latestSale.price)}</span>
          <span className="text-zinc-400">
            {" "}
            — most recent actual sale ({SOURCE_META[latestSale.source].label}), {new Date(latestSale.capturedAt).toLocaleDateString()}
          </span>
          {latestGuide && latestGuide.price > 0 && (
            <span className={latestSale.price >= latestGuide.price ? "text-emerald-400" : "text-rose-400"}>
              {" "}
              — {formatPct((latestSale.price - latestGuide.price) / latestGuide.price)} vs. guide price of{" "}
              {formatCents(latestGuide.price)}
            </span>
          )}
        </div>
      )}

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
              formatter={(value, _name, item) => [
                formatCents(Number(value)),
                SOURCE_META[(item?.payload?.source as PriceSourceValue) ?? "PRICECHARTING_GUIDE"].label,
              ]}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#52525b"
              strokeWidth={2}
              dot={(props) => <CustomDot key={props.payload?.capturedAt ?? props.cx} {...props} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {sourcesPresent.length > 1 && (
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          {sourcesPresent.map((source) => (
            <span key={source} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: SOURCE_META[source].color }}
              />
              {SOURCE_META[source].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
