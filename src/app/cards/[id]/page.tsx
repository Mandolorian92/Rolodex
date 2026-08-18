import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents, formatPriceType } from "@/lib/format";
import { latestPriceByType } from "@/lib/cardStats";
import { computeGradingRecommendation } from "@/lib/gradingRecs";
import { CONDITION_TO_PRICE_TYPE } from "@/lib/grades";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import TrendBadge from "@/components/TrendBadge";
import CheckVariantsButton from "@/components/CheckVariantsButton";
import CardMetaEditor from "@/components/CardMetaEditor";

const RAW_CONDITIONS = new Set([
  "UNGRADED",
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
]);

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
  const priceLadder = latestPriceByType(card.priceSnapshots);
  const ownedPriceTypes = new Set(card.collectionItems.map((i) => CONDITION_TO_PRICE_TYPE[i.condition]));
  const rawItem = card.collectionItems.find((i) => RAW_CONDITIONS.has(i.condition));
  const gradingRec = rawItem ? computeGradingRecommendation(rawItem.condition, card.priceSnapshots) : null;

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
          <div className="mt-2">
            <CardMetaEditor cardId={card.id} category={card.category} language={card.language} />
          </div>
        </div>
        <CheckVariantsButton cardId={card.id} />
      </div>

      {priceLadder.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Price by grade</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {priceLadder.map(({ priceType, snapshot }) => {
              const owned = ownedPriceTypes.has(priceType);
              return (
                <div
                  key={priceType}
                  className={`rounded-lg border px-3 py-2 ${
                    owned ? "border-emerald-700 bg-emerald-500/5" : "border-zinc-800"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    {formatPriceType(priceType)}
                    {owned && <span className="ml-1 text-emerald-400">· owned</span>}
                  </div>
                  <div className="mt-0.5 font-mono text-sm text-zinc-100">{formatCents(snapshot.price)}</div>
                </div>
              );
            })}
          </div>
          {gradingRec && (
            <div className="mt-3 rounded-lg border border-teal-900/60 bg-teal-500/5 px-4 py-3 text-sm text-teal-300">
              <span className="font-semibold">Grading recommended.</span> {gradingRec.summary}
            </div>
          )}
        </section>
      )}

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
