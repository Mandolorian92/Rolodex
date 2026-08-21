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
 * Fallback order, highest-trust first, for when a card has no real sale on file. TCGPlayer's
 * Market Price is itself computed from recent live-marketplace activity, so it tracks actual
 * demand more closely than PriceCharting's guide price — a real side-by-side comparison
 * during development (see README) found PriceCharting running as much as 10x hot on
 * low-value commons from recent sets, so "prefer whichever synced most recently" was letting
 * that noise drive the headline number and read as a price move. MANUAL is unused today
 * (reserved for a future manual price-entry feature) but ranks last regardless — an
 * unverified typed-in number shouldn't outrank either real catalog source.
 */
const FALLBACK_SOURCE_PRIORITY: PriceSource[] = [
  PriceSource.TCGPLAYER_MARKET,
  PriceSource.PRICECHARTING_GUIDE,
  PriceSource.MANUAL,
];

/**
 * The series that should drive the ticker for one (card, priceType): real sold transactions
 * when there are any; otherwise the single highest-priority source's own series (never a mix
 * of sources) so "latest" and the 1d/7d/30d trend reflect an actual price move within one
 * source's history, not two disagreeing sources' guesses taking turns being "latest" as each
 * one happens to resync. `snapshots` should already be filtered to one priceType.
 */
export function tickerSeries(snapshots: PriceSnapshot[]): PriceSnapshot[] {
  const sales = snapshots.filter((s) => REAL_SALE_SOURCES.has(s.source));
  if (sales.length > 0) return sales;

  for (const source of FALLBACK_SOURCE_PRIORITY) {
    const bySource = snapshots.filter((s) => s.source === source);
    if (bySource.length > 0) return bySource;
  }
  return snapshots;
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
