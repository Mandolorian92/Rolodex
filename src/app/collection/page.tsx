import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { pickPrimarySeries } from "@/lib/cardStats";
import { computeGradingRecommendation } from "@/lib/gradingRecs";
import { buildCategoryOptions, buildLanguageOptions, matchesCardMetaFilter, CATEGORY_LABELS } from "@/lib/cardMeta";
import { formatCents, formatPriceType, formatPct } from "@/lib/format";
import CollectionRowActions from "@/components/CollectionRowActions";
import ImportCollectionForm from "@/components/ImportCollectionForm";
import ManaboxImportForm from "@/components/ManaboxImportForm";
import CollectionFilters from "@/components/CollectionFilters";

export const dynamic = "force-dynamic";

type SortKey = "name" | "price" | "dateAdded" | "condition" | "gradeRec";
type SortDir = "asc" | "desc";

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  price: "desc",
  dateAdded: "desc",
  condition: "asc",
  gradeRec: "desc",
};

const SORT_LABELS: Record<SortKey, string> = {
  name: "Card",
  condition: "Condition",
  price: "Latest price",
  gradeRec: "Grade rec",
  dateAdded: "Date added",
};

function isSortKey(value: string | undefined): value is SortKey {
  return !!value && value in DEFAULT_DIR;
}

function sortHref(
  key: SortKey,
  currentSort: SortKey,
  currentDir: SortDir,
  category: string,
  language: string
) {
  const nextDir: SortDir =
    currentSort === key && currentDir === DEFAULT_DIR[key]
      ? DEFAULT_DIR[key] === "asc"
        ? "desc"
        : "asc"
      : DEFAULT_DIR[key];
  const params = new URLSearchParams({ sort: key, dir: nextDir });
  if (category !== "all") params.set("category", category);
  if (language !== "all") params.set("language", language);
  return `/collection?${params.toString()}`;
}

function SortHeader({
  sortKey,
  currentSort,
  currentDir,
  category,
  language,
}: {
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  category: string;
  language: string;
}) {
  const active = currentSort === sortKey;
  return (
    <th className="px-4 py-3 font-medium">
      <Link
        href={sortHref(sortKey, currentSort, currentDir, category, language)}
        className={`inline-flex items-center gap-1 hover:text-zinc-200 ${active ? "text-zinc-200" : ""}`}
      >
        {SORT_LABELS[sortKey]}
        {active && <span className="text-[10px]">{currentDir === "asc" ? "▲" : "▼"}</span>}
      </Link>
    </th>
  );
}

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; category?: string; language?: string }>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;
  const sort: SortKey = isSortKey(params.sort) ? params.sort : "dateAdded";
  const dir: SortDir = params.dir === "asc" || params.dir === "desc" ? params.dir : DEFAULT_DIR[sort];
  const category = params.category ?? "all";
  const language = params.language ?? "all";

  const items = await prisma.collectionItem.findMany({
    where: { userId },
    include: {
      card: { include: { priceSnapshots: { orderBy: { capturedAt: "asc" } } } },
    },
  });

  const categoryOptions = buildCategoryOptions(items.map((i) => i.card));
  const languageOptions = buildLanguageOptions(items.map((i) => i.card));

  const filteredItems = items.filter((item) => matchesCardMetaFilter(item.card, category, language));

  const rows = filteredItems.map((item) => ({
    item,
    primary: pickPrimarySeries(item.card.priceSnapshots, item.condition),
    gradingRec: computeGradingRecommendation(item.condition, item.card.priceSnapshots),
  }));

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "name":
        cmp = a.item.card.name.localeCompare(b.item.card.name);
        break;
      case "condition":
        cmp = a.item.condition.localeCompare(b.item.condition);
        break;
      case "price":
        cmp = (a.primary?.stats.latest.price ?? -1) - (b.primary?.stats.latest.price ?? -1);
        break;
      case "gradeRec":
        cmp = (a.gradingRec?.premiumCents ?? -1) - (b.gradingRec?.premiumCents ?? -1);
        break;
      case "dateAdded":
      default:
        cmp = a.item.createdAt.getTime() - b.item.createdAt.getTime();
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  const gradeRecCount = rows.filter((r) => r.gradingRec).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Your collection</h1>
        <div className="flex items-center gap-2">
          {/* Plain <a>, not <Link> — this triggers a file download (Content-Disposition), not a page navigation. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/collection/export"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
          >
            Download spreadsheet
          </a>
          <Link
            href="/collection/add"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            + Add card
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <ImportCollectionForm />
        <ManaboxImportForm />
      </div>

      <CollectionFilters
        category={category}
        language={language}
        categoryOptions={categoryOptions}
        languageOptions={languageOptions}
        extraParams={{ sort, dir }}
      />

      {gradeRecCount > 0 && (
        <Link
          href={sortHref("gradeRec", sort, dir, category, language)}
          className="rounded-lg border border-teal-900/60 bg-teal-500/5 px-4 py-3 text-sm text-teal-300 hover:bg-teal-500/10"
        >
          {gradeRecCount} card{gradeRecCount === 1 ? "" : "s"} with a solid grading opportunity — sort by Grade rec
          to see them first →
        </Link>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing here yet. Add a card to get started.</p>
      ) : filteredItems.length === 0 ? (
        <p className="text-sm text-zinc-500">No cards match this filter.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <SortHeader sortKey="name" currentSort={sort} currentDir={dir} category={category} language={language} />
                <SortHeader sortKey="condition" currentSort={sort} currentDir={dir} category={category} language={language} />
                <SortHeader sortKey="price" currentSort={sort} currentDir={dir} category={category} language={language} />
                <th className="px-4 py-3 font-medium">Purchase price</th>
                <SortHeader sortKey="gradeRec" currentSort={sort} currentDir={dir} category={category} language={language} />
                <SortHeader sortKey="dateAdded" currentSort={sort} currentDir={dir} category={category} language={language} />
                <th className="px-4 py-3 font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sorted.map(({ item, primary, gradingRec }) => (
                <tr key={item.id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/cards/${item.card.id}`}
                      className="font-medium text-zinc-100 hover:underline"
                    >
                      {item.card.name}
                    </Link>
                    {item.card.consoleName && (
                      <div className="text-xs text-zinc-500">{item.card.consoleName}</div>
                    )}
                    <div className="mt-0.5 flex gap-1.5 text-[11px] text-zinc-600">
                      <span>{item.card.category ? CATEGORY_LABELS[item.card.category] ?? item.card.category : "Unknown category"}</span>
                      {item.card.language && <span>· {item.card.language}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{item.condition.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 font-mono text-zinc-100">
                    {primary ? (
                      <>
                        {formatCents(primary.stats.latest.price)}{" "}
                        <span className="text-xs text-zinc-500">({formatPriceType(primary.priceType)})</span>
                      </>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-400">
                    {item.purchasePrice !== null ? formatCents(item.purchasePrice) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {gradingRec ? (
                      <span
                        title={gradingRec.summary}
                        className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-400"
                      >
                        {formatPct(gradingRec.premiumPct)} at {gradingRec.targetLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-700">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{item.createdAt.toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <CollectionRowActions itemId={item.id} initialQuantity={item.quantity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
