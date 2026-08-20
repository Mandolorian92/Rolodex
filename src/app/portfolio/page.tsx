import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { computePortfolioSummary, computePortfolioHistory, computeHypotheticalValue } from "@/lib/portfolio";
import { formatCents, formatPct, formatPriceType } from "@/lib/format";
import StatCard from "@/components/StatCard";
import PortfolioValueChart from "@/components/PortfolioValueChart";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const userId = await requireUserId();
  const items = await prisma.collectionItem.findMany({
    where: { userId },
    include: {
      card: { include: { priceSnapshots: { orderBy: { capturedAt: "asc" } } } },
    },
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-zinc-100">Portfolio</h1>
        <p className="text-sm text-zinc-500">
          Nothing to analyze yet.{" "}
          <Link href="/collection/add" className="text-emerald-400 hover:underline">
            Add a card
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  const { rows, totals } = computePortfolioSummary(items);
  const history = computePortfolioHistory(items);
  const rawValue = computeHypotheticalValue(items, "loose");
  const psa10Value = computeHypotheticalValue(items, "manual-only");

  const ranked = rows
    .filter((r) => r.gainPct !== null)
    .sort((a, b) => (b.gainPct as number) - (a.gainPct as number));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-100">Portfolio</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Current value" value={formatCents(totals.value)} />
        <StatCard label="Cost basis" value={formatCents(totals.costBasis)} />
        <StatCard
          label="Unrealized gain"
          value={formatCents(totals.gain)}
          tone={totals.gain >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Gain %"
          value={totals.gainPct !== null ? formatPct(totals.gainPct) : "—"}
          tone={totals.gainPct === null ? undefined : totals.gainPct >= 0 ? "up" : "down"}
        />
      </div>

      {(totals.itemsMissingCostBasis > 0 || totals.itemsMissingPrice > 0) && (
        <p className="text-xs text-zinc-600">
          {totals.itemsMissingCostBasis > 0 &&
            `${totals.itemsMissingCostBasis} card(s) have no purchase price on file, so they're excluded from gain totals. `}
          {totals.itemsMissingPrice > 0 &&
            `${totals.itemsMissingPrice} card(s) have no price data yet — sync to pull one.`}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Collection value at a single grade
        </h2>
        <p className="mb-3 text-xs text-zinc-600">
          What the whole collection would be worth if every copy were priced at that tier —
          not what you actually own it as. Useful for sizing up how much is on the table
          between raw and graded.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="If everything were Raw" value={formatCents(rawValue.value)} />
          <StatCard label="If everything were PSA 10" value={formatCents(psa10Value.value)} />
        </div>
        {(rawValue.itemsWithData < rawValue.totalItems || psa10Value.itemsWithData < psa10Value.totalItems) && (
          <p className="mt-2 text-xs text-zinc-600">
            Raw pricing available for {rawValue.itemsWithData} of {rawValue.totalItems} card(s); PSA 10 pricing
            available for {psa10Value.itemsWithData} of {psa10Value.totalItems}. Cards without that tier&apos;s data
            are excluded from the corresponding total rather than counted as zero.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Value over time</h2>
        <PortfolioValueChart points={history} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Performers, best to worst
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Card</th>
                <th className="px-4 py-3 font-medium">Cost basis</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Gain</th>
                <th className="px-4 py-3 font-medium">Gain %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {ranked.map((row) => (
                <tr key={row.item.id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/cards/${row.item.card.id}`}
                      className="font-medium text-zinc-100 hover:underline"
                    >
                      {row.item.card.name}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {row.item.quantity}× {row.priceType ? formatPriceType(row.priceType) : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-400">
                    {row.costBasis !== null ? formatCents(row.costBasis) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-100">
                    {row.value !== null ? formatCents(row.value) : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      row.gain === null ? "text-zinc-600" : row.gain >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {row.gain !== null ? formatCents(row.gain) : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      row.gainPct === null ? "text-zinc-600" : row.gainPct >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {row.gainPct !== null ? formatPct(row.gainPct) : "—"}
                  </td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-600">
                    No cards have both a purchase price and a current value yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
