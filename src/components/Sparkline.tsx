"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

export interface SparklinePoint {
  capturedAt: string;
  price: number;
}

export default function Sparkline({
  data,
  positive,
}: {
  data: SparklinePoint[];
  positive: boolean;
}) {
  if (data.length < 2) {
    return <div className="h-10 w-28 text-xs text-zinc-600">Not enough data</div>;
  }

  const color = positive ? "#34d399" : "#fb7185";

  return (
    <div className="h-10 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Line
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
