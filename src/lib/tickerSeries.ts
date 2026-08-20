/**
 * Which series of snapshots should actually drive the ticker — the "latest price," trend %,
 * and alerts — for one (card, priceType). A real sold transaction is stronger evidence of
 * value than any guide/aggregate estimate, so when recent sales exist they're what moves the
 * number; guide-price and other aggregate sources still get recorded and shown side by side
 * (see latestBySource below) but don't drive it.
 *
 * Lives in its own module rather than cardStats.ts because trends.ts needs it too, and
 * cardStats.ts already imports from trends.ts — putting it there would create a cycle.
 */
import { PriceSource, type PriceSnapshot } from "@/generated/prisma/client";

/** Sources that represent an actual individual transaction, not an aggregate/estimate. */
export const REAL_SALE_SOURCES: ReadonlySet<PriceSource> = new Set([
  PriceSource.PRICECHARTING_SALE,
  PriceSource.EBAY_SALE,
]);

/**
 * The series that should drive the ticker for one (card, priceType): real sold transactions
 * when there are any, the full series on file (guide price, TCGPlayer Market Price, manual —
 * whatever's there) otherwise. `snapshots` should already be filtered to one priceType.
 */
export function tickerSeries(snapshots: PriceSnapshot[]): PriceSnapshot[] {
  const sales = snapshots.filter((s) => REAL_SALE_SOURCES.has(s.source));
  return sales.length > 0 ? sales : snapshots;
}

export interface SourceQuote {
  source: PriceSource;
  price: number;
  capturedAt: Date;
}

/**
 * The latest price on file from each distinct source, for one (card, priceType) — the raw
 * material for showing "PriceCharting says $5, TCGPlayer says $80" side by side instead of
 * silently collapsing conflicting sources into one number. Newest-quoted source first.
 */
export function latestBySource(snapshots: PriceSnapshot[]): SourceQuote[] {
  const bySource = new Map<PriceSource, PriceSnapshot>();
  for (const snap of snapshots) {
    const existing = bySource.get(snap.source);
    if (!existing || snap.capturedAt.getTime() > existing.capturedAt.getTime()) {
      bySource.set(snap.source, snap);
    }
  }
  return [...bySource.entries()]
    .map(([source, snap]) => ({ source, price: snap.price, capturedAt: snap.capturedAt }))
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
}
