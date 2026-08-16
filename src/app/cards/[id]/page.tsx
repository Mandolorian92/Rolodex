import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import TrendBadge from "@/components/TrendBadge";

export const dynamic = "force-dynamic";

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      priceSnapshots: { orderBy: { capturedAt: "asc" } },
      ebaySales: { orderBy: { soldAt: "desc" }, take: 10 },
      alerts: { orderBy: { createdAt: "desc" }, take: 10 },
      collectionItems: true,
    },
  });

  if (!card) notFound();

  const totalQuantity = card.collectionItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">{card.name}</h1>
        {card.consoleName && <p className="text-sm text-zinc-500">{card.consoleName}</p>}
        <p className="mt-1 text-xs text-zinc-600">
          {totalQuantity > 0 ? `You own ${totalQuantity} of these` : "Not currently in your collection"}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Price history</h2>
        <PriceHistoryChart
          snapshots={card.priceSnapshots.map((s) => ({
            capturedAt: s.capturedAt.toISOString(),
            price: s.price,
            priceType: s.priceType,
          }))}
        />
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

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Recent eBay sold comps
        </h2>
        {card.ebaySales.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No eBay comps yet — this requires <code className="text-zinc-400">EBAY_CLIENT_ID</code>/
            <code className="text-zinc-400">EBAY_CLIENT_SECRET</code> to be configured and Marketplace Insights
            access to be granted on your eBay developer account.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {card.ebaySales.map((sale) => (
              <li key={sale.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <a href={sale.itemUrl} target="_blank" rel="noreferrer" className="text-zinc-300 hover:underline">
                  {sale.title}
                </a>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-600">{sale.soldAt.toLocaleDateString()}</span>
                  <span className="font-mono text-zinc-100">{formatCents(sale.price)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
