import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Condition, type Card, type PriceSnapshot } from "@/generated/prisma/client";
import { latestPriceByType, PRICE_TYPE_LADDER } from "@/lib/cardStats";
import { computeGradingRecommendation } from "@/lib/gradingRecs";
import { RAW_CONDITIONS } from "@/lib/grades";
import { buildCategoryOptions, buildLanguageOptions, matchesCardMetaFilter } from "@/lib/cardMeta";
import { formatCents, formatPriceType, formatPct } from "@/lib/format";
import CollectionFilters from "@/components/CollectionFilters";
import ValuesViewControls from "@/components/ValuesViewControls";

export const dynamic = "force-dynamic";

// The specific columns asked for: ungraded plus PSA 7 through 10. (PriceCharting's PSA-10
// field is "manual-only" — see CARD_PRICE_TYPE_LABELS in pricecharting.ts.)
const MATRIX_COLUMNS = ["loose", "cib", "new", "graded", "manual-only"];

type ViewMode = "list" | "matrix";

function isViewMode(v: string | undefined): v is ViewMode {
  return v === "list" || v === "matrix";
}

type CardWithSnapshots = Card & { priceSnapshots: PriceSnapshot[] };

interface CardRow {
  card: CardWithSnapshots;
  quantity: number;
  priceByType: Map<string, number>;
  gradingRec: ReturnType<typeof computeGradingRecommendation>;
}

export default async function CollectionValuesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tier?: string; category?: string; language?: string }>;
}) {
  const params = await searchParams;
  const view: ViewMode = isViewMode(params.view) ? params.view : "list";
  const tier = params.tier && PRICE_TYPE_LADDER.includes(params.tier) ? params.tier : "loose";
  const category = params.category ?? "all";
  const language = params.language ?? "all";

  const items = await prisma.collectionItem.findMany({
    include: { card: { include: { priceSnapshots: { orderBy: { capturedAt: "asc" } } } } },
  });

  const categoryOptions = buildCategoryOptions(items.map((i) => i.card));
  const languageOptions = buildLanguageOptions(items.map((i) => i.card));
  const filtered = items.filter((item) => matchesCardMetaFilter(item.card, category, language));

  // One row per card, not per collection line item — "top valued cards" ranks the card
  // itself. Quantity is summed across every condition owned of that card.
  const byCard = new Map<string, { card: CardWithSnapshots; quantity: number; rawCondition: Condition | null }>();
  for (const item of filtered) {
    const isRaw = RAW_CONDITIONS.has(item.condition);
    const existing = byCard.get(item.card.id);
    if (existing) {
      existing.quantity += item.quantity;
      if (isRaw && existing.rawCondition === null) existing.rawCondition = item.condition;
    } else {
      byCard.set(item.card.id, { card: item.card, quantity: item.quantity, rawCondition: isRaw ? item.condition : null });
    }
  }

  const rows: CardRow[] = [...byCard.values()].map(({ card, quantity, rawCondition }) => {
    const priceByType = new Map(latestPriceByType(card.priceSnapshots).map((l) => [l.priceType, l.snapshot.price]));
    const gradingRec = rawCondition ? computeGradingRecommendation(rawCondition, card.priceSnapshots) : null;
    return { card, quantity, priceByType, gradingRec };
  });

  const sorted = [...rows].sort((a, b) => (b.priceByType.get(tier) ?? -1) - (a.priceByType.get(tier) ?? -1));

  const tierOptions = PRICE_TYPE_LADDER.map((t) => ({ value: t, label: formatPriceType(t) }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Card values</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Rank your collection by value at any grade tier, or see every grade side by side.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ValuesViewControls view={view} tier={tier} tierOptions={tierOptions} category={category} language={language} />
        <CollectionFilters
          basePath="/collection/values"
          category={category}
          language={language}
          categoryOptions={categoryOptions}
          languageOptions={languageOptions}
          extraParams={{ view, tier }}
        />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-500">No cards match this filter.</p>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Card</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">{formatPriceType(tier)} value</th>
                <th className="px-4 py-3 font-medium">Grading rec</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sorted.map((row, i) => {
                const price = row.priceByType.get(tier);
                return (
                  <tr key={row.card.id} className="hover:bg-zinc-900/60">
                    <td className="px-4 py-3 text-zinc-600">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/cards/${row.card.id}`} className="font-medium text-zinc-100 hover:underline">
                        {row.card.name}
                      </Link>
                      {row.card.consoleName && <div className="text-xs text-zinc-500">{row.card.consoleName}</div>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{row.quantity}</td>
                    <td className="px-4 py-3 font-mono text-zinc-100">
                      {price !== undefined ? formatCents(price) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.gradingRec ? (
                        <span
                          title={row.gradingRec.summary}
                          className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-400"
                        >
                          {formatPct(row.gradingRec.premiumPct)} at {row.gradingRec.targetLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-700">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Card</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                {MATRIX_COLUMNS.map((col) => (
                  <th key={col} className="px-4 py-3 font-medium">
                    {formatPriceType(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sorted.map((row) => (
                <tr key={row.card.id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-3">
                    <Link href={`/cards/${row.card.id}`} className="font-medium text-zinc-100 hover:underline">
                      {row.card.name}
                    </Link>
                    {row.card.consoleName && <div className="text-xs text-zinc-500">{row.card.consoleName}</div>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{row.quantity}</td>
                  {MATRIX_COLUMNS.map((col) => {
                    const price = row.priceByType.get(col);
                    return (
                      <td key={col} className="px-4 py-3 font-mono text-zinc-100">
                        {price !== undefined ? formatCents(price) : <span className="text-zinc-600">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
