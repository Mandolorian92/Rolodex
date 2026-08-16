import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { pickPrimarySeries } from "@/lib/cardStats";
import { formatCents, formatPct, formatPriceType } from "@/lib/format";
import Sparkline from "@/components/Sparkline";
import TrendBadge from "@/components/TrendBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const items = await prisma.collectionItem.findMany({
    include: {
      card: {
        include: {
          priceSnapshots: { orderBy: { capturedAt: "asc" } },
          alerts: { where: { acknowledged: false }, orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = items.map((item) => ({
    item,
    primary: pickPrimarySeries(item.card.priceSnapshots),
  }));

  const totalValue = rows.reduce((sum, { item, primary }) => {
    if (!primary) return sum;
    return sum + primary.stats.latest.price * item.quantity;
  }, 0);

  const weighted7dChanges = rows.filter(
    ({ primary }) => primary && primary.stats.changePct7d !== null
  );
  const avg7dChange =
    weighted7dChanges.length > 0
      ? weighted7dChanges.reduce((sum, { primary }) => sum + (primary!.stats.changePct7d ?? 0), 0) /
        weighted7dChanges.length
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Portfolio value" value={formatCents(totalValue)} />
        <StatCard
          label="Avg. 7d change"
          value={avg7dChange !== null ? formatPct(avg7dChange) : "—"}
          tone={avg7dChange === null ? undefined : avg7dChange >= 0 ? "up" : "down"}
        />
        <StatCard label="Cards tracked" value={String(items.length)} />
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Card</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Price type</th>
                <th className="px-4 py-3 font-medium">Latest price</th>
                <th className="px-4 py-3 font-medium">7d change</th>
                <th className="px-4 py-3 font-medium">Trend</th>
                <th className="px-4 py-3 font-medium">Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map(({ item, primary }) => (
                <tr key={item.id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-3">
                    <Link href={`/cards/${item.card.id}`} className="font-medium text-zinc-100 hover:underline">
                      {item.card.name}
                    </Link>
                    {item.card.consoleName && (
                      <div className="text-xs text-zinc-500">{item.card.consoleName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{item.quantity}</td>
                  {primary ? (
                    <>
                      <td className="px-4 py-3 text-zinc-400">{formatPriceType(primary.priceType)}</td>
                      <td className="px-4 py-3 font-mono text-zinc-100">
                        {formatCents(primary.stats.latest.price)}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono ${
                          primary.stats.changePct7d === null
                            ? "text-zinc-600"
                            : primary.stats.changePct7d >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {primary.stats.changePct7d !== null ? formatPct(primary.stats.changePct7d) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Sparkline
                          data={item.card.priceSnapshots
                            .filter((s) => s.priceType === primary.priceType)
                            .map((s) => ({ capturedAt: s.capturedAt.toISOString(), price: s.price }))}
                          positive={(primary.stats.changePct7d ?? 0) >= 0}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.card.alerts.length === 0 ? (
                            <span className="text-xs text-zinc-600">—</span>
                          ) : (
                            item.card.alerts.map((alert) => <TrendBadge key={alert.id} type={alert.type} />)
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-4 py-3 text-zinc-600">
                      No price data yet — hit &ldquo;Sync now&rdquo;
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  const toneClass = tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 p-12 text-center">
      <h2 className="text-lg font-semibold text-zinc-100">No cards in your collection yet</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Add cards from the PriceCharting catalog to start tracking their price history and signals.
      </p>
      <Link
        href="/collection/add"
        className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Add your first card
      </Link>
    </div>
  );
}
