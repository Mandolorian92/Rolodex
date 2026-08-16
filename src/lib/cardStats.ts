import type { Condition, PriceSnapshot } from "@/generated/prisma/client";
import { computeChangeStats, type ChangeStats } from "@/lib/trends";
import { CONDITION_TO_PRICE_TYPE } from "@/lib/grades";

/** Fallback priceType order (highest grade first) when we don't know which condition is owned. */
const PRIORITY = [
  "manual-only",
  "bgs-10",
  "condition-17",
  "condition-18",
  "box-only",
  "graded",
  "new",
  "cib",
  "loose",
];

export interface PrimarySeries {
  priceType: string;
  stats: ChangeStats;
}

function groupByPriceType(snapshots: PriceSnapshot[]): Map<string, PriceSnapshot[]> {
  const byType = new Map<string, PriceSnapshot[]>();
  for (const snap of snapshots) {
    const list = byType.get(snap.priceType) ?? [];
    list.push(snap);
    byType.set(snap.priceType, list);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }
  return byType;
}

/**
 * Pick the priceType series to headline for a card. When `ownedCondition` is given (i.e.
 * we know which grade the user actually owns), prefer the series for that exact grade —
 * that's the price that actually matters to them. Otherwise fall back to PRIORITY, then to
 * whichever series has the most history.
 */
export function pickPrimarySeries(
  snapshots: PriceSnapshot[],
  ownedCondition?: Condition
): PrimarySeries | null {
  if (snapshots.length === 0) return null;
  const byType = groupByPriceType(snapshots);

  const ownedPriceType = ownedCondition ? CONDITION_TO_PRICE_TYPE[ownedCondition] : undefined;

  let chosenType: string | null =
    ownedPriceType && byType.has(ownedPriceType) ? ownedPriceType : null;

  if (!chosenType) {
    chosenType = PRIORITY.find((candidate) => byType.has(candidate)) ?? null;
  }
  if (!chosenType) {
    chosenType = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  }

  const series = byType.get(chosenType)!;
  const stats = computeChangeStats(series);
  if (!stats) return null;
  return { priceType: chosenType, stats };
}
