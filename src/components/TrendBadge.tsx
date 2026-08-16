import { AlertType } from "@/generated/prisma/client";

const STYLES: Record<AlertType, { label: string; className: string }> = {
  [AlertType.TRENDING_UP]: { label: "Trending up", className: "bg-emerald-500/15 text-emerald-400" },
  [AlertType.TRENDING_DOWN]: { label: "Trending down", className: "bg-rose-500/15 text-rose-400" },
  [AlertType.SELL_SIGNAL]: { label: "Sell signal", className: "bg-amber-500/15 text-amber-400" },
  [AlertType.NEW_HIGH]: { label: "New high", className: "bg-sky-500/15 text-sky-400" },
};

export default function TrendBadge({ type }: { type: AlertType }) {
  const style = STYLES[type];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}
