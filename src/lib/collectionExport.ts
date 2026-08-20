/**
 * Build a CSV spreadsheet of the full collection — reuses the same data every other view
 * already computes (pickPrimarySeries for latest price, computeGradingRecommendation for
 * grading calls), just flattened into one row per collection item instead of a live table.
 */
import type { Card, CollectionItem, PriceSnapshot } from "@/generated/prisma/client";
import { pickPrimarySeries } from "@/lib/cardStats";
import { computeGradingRecommendation } from "@/lib/gradingRecs";
import { RAW_CONDITIONS } from "@/lib/grades";
import { CATEGORY_LABELS } from "@/lib/cardMeta";
import { formatPriceType } from "@/lib/format";

export type CollectionItemWithCard = CollectionItem & { card: Card & { priceSnapshots: PriceSnapshot[] } };

const COLUMNS = [
  "Card",
  "Set / Console",
  "Category",
  "Language",
  "Condition",
  "Quantity",
  "Price Type",
  "Latest Price",
  "Purchase Price",
  "Unrealized Gain ($)",
  "Unrealized Gain (%)",
  "Grading Recommendation",
  "Date Added",
];

/** Quote a field only when it needs it (contains a comma, quote, or newline), doubling internal quotes. */
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function centsToDollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export function buildCollectionExportRows(items: CollectionItemWithCard[]): string[][] {
  return items.map((item) => {
    const primary = pickPrimarySeries(item.card.priceSnapshots, item.condition);
    const latestCents = primary ? primary.stats.latest.price : null;
    const gainCents =
      latestCents !== null && item.purchasePrice !== null
        ? latestCents * item.quantity - item.purchasePrice * item.quantity
        : null;
    const gainPct =
      gainCents !== null && item.purchasePrice !== null && item.purchasePrice > 0
        ? gainCents / (item.purchasePrice * item.quantity)
        : null;

    const gradingRec = RAW_CONDITIONS.has(item.condition)
      ? computeGradingRecommendation(item.condition, item.card.priceSnapshots)
      : null;

    return [
      item.card.name,
      item.card.consoleName ?? "",
      item.card.category ? CATEGORY_LABELS[item.card.category] ?? item.card.category : "",
      item.card.language ?? "",
      item.condition.replace(/_/g, " "),
      String(item.quantity),
      primary ? formatPriceType(primary.priceType) : "",
      centsToDollars(latestCents),
      centsToDollars(item.purchasePrice),
      gainCents === null ? "" : (gainCents / 100).toFixed(2),
      gainPct === null ? "" : (gainPct * 100).toFixed(1),
      gradingRec ? `${gradingRec.targetLabel}: ${(gradingRec.premiumPct * 100).toFixed(1)}% premium` : "",
      item.createdAt.toISOString().slice(0, 10),
    ];
  });
}

export function buildCollectionExportCsv(items: CollectionItemWithCard[]): string {
  const rows = [COLUMNS, ...buildCollectionExportRows(items)];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
