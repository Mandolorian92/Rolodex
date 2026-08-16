import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import TrendBadge from "@/components/TrendBadge";
import CheckVariantsButton from "@/components/CheckVariantsButton";

export const dynamic = "force-dynamic";

const SALE_SOURCE_LABEL: Record<string, string> = {
  PRICECHARTING_SALE: "PriceCharting",
  EBAY_SALE: "eBay",
};

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      priceSnapshots: { orderBy: { capturedAt: "asc" } },
      marketSales: { orderBy: { soldAt: "desc" }, take: 15 },
      alerts: { orderBy: { createdAt: "desc" }, take: 10 },
      collectionItems: true,
    },
  });

  if (!card) notFound();

  const totalQuantity = card.collectionItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">{card.name}</h1>
          {card.consoleName && <p className="text-sm text-zinc-500">{card.consoleName}</p>}
          <p className="mt-1 text-xs text-zinc-600">
            {totalQuantity > 0 ? `You own ${totalQuantity} of these` : "Not currently in your collection"}
            {card.variantLabel && ` · Variant on file: ${card.variantLabel}`}
          </p>
        </div>
        <CheckVariantsButton cardId={card.id} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Price history</h2>
        <PriceHistoryChart
          snapshots={card.priceSnapshots.map((s) => ({
            capturedAt: s.capturedAt.toISOString(),
            price: s.price,
            priceType: s.priceType,
            source: s.source,
          }))}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent sales</h2>
        {card.marketSales.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No recent sales found yet — run a sync to check PriceCharting&apos;s marketplace, or configure{" "}
            <code className="text-zinc-400">EBAY_CLIENT_ID</code>/
            <code className="text-zinc-400">EBAY_CLIENT_SECRET</code> for eBay comps too.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {card.marketSales.map((sale) => (
              <li key={sale.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex-none rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    {SALE_SOURCE_LABEL[sale.source] ?? sale.source}
                  </span>
                  <a
                    href={sale.itemUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-zinc-300 hover:underline"
                  >
                    {sale.title}
                  </a>
                </div>
                <div className="flex flex-none items-center gap-4">
                  {sale.condition && <span className="text-xs text-zinc-600">{sale.condition}</span>}
                  <span className="text-xs text-zinc-600">{sale.soldAt.toLocaleDateString()}</span>
                  <span className="font-mono text-zinc-100">{formatCents(sale.price)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Signals</h2>
        {card.alerts.length === 0 ? (
          <p className="text-sm text-zinc-500">No signals yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {card.alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <TrendBadge type={alert.type} />
                  <span className="text-zinc-300">{alert.message}</span>
                </div>
                <span className="text-xs text-zinc-600">{alert.createdAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
