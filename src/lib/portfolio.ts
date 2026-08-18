import type { Card, CollectionItem, PriceSnapshot } from "@/generated/prisma/client";
import { pickPrimarySeries } from "@/lib/cardStats";

export type CollectionItemWithCard = CollectionItem & {
  card: Card & { priceSnapshots: PriceSnapshot[] };
};

export interface PortfolioRow {
  item: CollectionItemWithCard;
  priceType: string | null;
  costBasis: number | null; // cents
  value: number | null; // cents
  gain: number | null; // cents
  gainPct: number | null;
}

export interface PortfolioSummary {
  rows: PortfolioRow[];
  totals: {
    costBasis: number; // sum of rows with known cost basis
    value: number; // sum of rows with known value
    gain: number; // value - costBasis, over rows where both are known
    gainPct: number | null; // gain / costBasis, over rows where both are known
    itemsMissingCostBasis: number;
    itemsMissingPrice: number;
  };
}

export function computePortfolioSummary(items: CollectionItemWithCard[]): PortfolioSummary {
  const rows: PortfolioRow[] = items.map((item) => {
    const primary = pickPrimarySeries(item.card.priceSnapshots, item.condition);
    const value = primary ? primary.stats.latest.price * item.quantity : null;
    const costBasis = item.purchasePrice !== null ? item.purchasePrice * item.quantity : null;
    const gain = value !== null && costBasis !== null ? value - costBasis : null;
    const gainPct = gain !== null && costBasis !== null && costBasis > 0 ? gain / costBasis : null;
    return { item, priceType: primary?.priceType ?? null, costBasis, value, gain, gainPct };
  });

  let costBasisSum = 0;
  let valueSum = 0;
  let gainBasisSum = 0; // cost basis, restricted to rows where gain is known — the denominator for total gain%
  let gainSum = 0;
  let itemsMissingCostBasis = 0;
  let itemsMissingPrice = 0;

  for (const row of rows) {
    if (row.costBasis !== null) costBasisSum += row.costBasis;
    else itemsMissingCostBasis += 1;

    if (row.value !== null) valueSum += row.value;
    else itemsMissingPrice += 1;

    if (row.gain !== null && row.costBasis !== null) {
      gainSum += row.gain;
      gainBasisSum += row.costBasis;
    }
  }

  return {
    rows,
    totals: {
      costBasis: costBasisSum,
      value: valueSum,
      gain: gainSum,
      gainPct: gainBasisSum > 0 ? gainSum / gainBasisSum : null,
      itemsMissingCostBasis,
      itemsMissingPrice,
    },
  };
}

export interface HypotheticalValue {
  priceType: string;
  value: number; // cents — sum of (latest price at this tier * quantity), over items that have it
  itemsWithData: number;
  totalItems: number;
}

/**
 * "What would my whole collection be worth if every copy were at this grade tier" — e.g.
 * everything Raw, or everything PSA 10. Unlike the owned-condition value in
 * computePortfolioSummary, this always prices every collection item at the same tier,
 * regardless of what condition it's actually owned in, using whatever guide-price data that
 * card already has for that tier (no extra API calls). Items whose card has never seen a
 * price at this tier are excluded and counted in itemsWithData/totalItems, so partial
 * coverage is visible rather than silently understating the total.
 */
export function computeHypotheticalValue(items: CollectionItemWithCard[], priceType: string): HypotheticalValue {
  let value = 0;
  let itemsWithData = 0;

  for (const item of items) {
    const series = item.card.priceSnapshots.filter((s) => s.priceType === priceType);
    if (series.length === 0) continue;
    const latest = series.reduce((a, b) => (a.capturedAt > b.capturedAt ? a : b));
    value += latest.price * item.quantity;
    itemsWithData += 1;
  }

  return { priceType, value, itemsWithData, totalItems: items.length };
}

export interface PortfolioHistoryPoint {
  date: string; // ISO
  value: number; // cents
}

function nearestPriceOnOrBefore(series: PriceSnapshot[], cutoff: number): number | null {
  let price: number | null = null;
  for (const snap of series) {
    if (snap.capturedAt.getTime() <= cutoff) price = snap.price;
    else break;
  }
  return price;
}

/**
 * Reconstruct total portfolio value at every date any card in it has a price snapshot,
 * carrying forward each card's last known price on dates it didn't get a fresh snapshot.
 * This assumes quantity owned today applied at every past date too — a simplification,
 * since we don't track a history of quantity changes, only current holdings.
 */
export function computePortfolioHistory(items: CollectionItemWithCard[]): PortfolioHistoryPoint[] {
  const perItemSeries = items.map((item) => {
    const primary = pickPrimarySeries(item.card.priceSnapshots, item.condition);
    if (!primary) return null;
    const series = item.card.priceSnapshots
      .filter((s) => s.priceType === primary.priceType)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    return { quantity: item.quantity, series };
  });

  // Bucket by calendar day (UTC) rather than exact timestamp: a single sync run creates
  // snapshots for many cards/price-types a few seconds apart (rate-limited), which would
  // otherwise show up as several near-duplicate points on the same day.
  const dayMs = 24 * 60 * 60 * 1000;
  const dayBuckets = new Set<number>();
  for (const entry of perItemSeries) {
    if (!entry) continue;
    for (const snap of entry.series) {
      dayBuckets.add(Math.floor(snap.capturedAt.getTime() / dayMs) * dayMs);
    }
  }

  const sortedDays = [...dayBuckets].sort((a, b) => a - b);

  return sortedDays.map((dayStart) => {
    const cutoff = dayStart + dayMs - 1; // end of that UTC day
    let total = 0;
    for (const entry of perItemSeries) {
      if (!entry) continue;
      const price = nearestPriceOnOrBefore(entry.series, cutoff);
      if (price !== null) total += price * entry.quantity;
    }
    return { date: new Date(dayStart).toISOString(), value: total };
  });
}
