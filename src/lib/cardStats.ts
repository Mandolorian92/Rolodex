import type { PriceSnapshot } from "@/generated/prisma/client";
import { computeChangeStats, type ChangeStats } from "@/lib/trends";

/** Preferred priceType order when picking which series to headline on the ticker. */
const PRIORITY = ["gem-mint", "grade-10", "grade-9", "ungraded", "graded", "loose", "cib", "new"];

export interface PrimarySeries {
  priceType: string;
  stats: ChangeStats;
}

/**
 * Pick one representative priceType series per card for ticker/summary display —
 * whichever series in PRIORITY has data, falling back to whichever has the most history.
 */
export function pickPrimarySeries(snapshots: PriceSnapshot[]): PrimarySeries | null {
  if (snapshots.length === 0) return null;

  const byType = new Map<string, PriceSnapshot[]>();
  for (const snap of snapshots) {
    const list = byType.get(snap.priceType) ?? [];
    list.push(snap);
    byType.set(snap.priceType, list);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }

  let chosenType: string | null = null;
  for (const candidate of PRIORITY) {
    if (byType.has(candidate)) {
      chosenType = candidate;
      break;
    }
  }
  if (!chosenType) {
    chosenType = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  }

  const series = byType.get(chosenType)!;
  const stats = computeChangeStats(series);
  if (!stats) return null;
  return { priceType: chosenType, stats };
}
