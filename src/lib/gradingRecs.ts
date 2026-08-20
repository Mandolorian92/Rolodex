/**
 * Grading recommendations — like PriceCharting's own "grade recs" sort, but weighted by
 * trend/momentum rather than a static price gap: a raw card priced well above its graded
 * value is only a good grading candidate if that gap is holding or growing, not one that
 * happened to spike and is already fading.
 *
 * Uses price data we already have. Every sync pulls every grade tier's guide price for a
 * card (not just the one you own — see extractPriceFields in pricecharting.ts), so this
 * needs no extra API calls: it's pure computation over PriceSnapshot rows already on file.
 */
import { AlertType, Condition, type Alert, type PriceSnapshot } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { computeChangeStats } from "@/lib/trends";
import { formatCents, formatPct } from "@/lib/format";

/** Raw/ungraded conditions — grading recs only make sense starting from one of these. */
const RAW_CONDITIONS: Condition[] = [
  Condition.UNGRADED,
  Condition.NEAR_MINT,
  Condition.LIGHTLY_PLAYED,
  Condition.MODERATELY_PLAYED,
  Condition.HEAVILY_PLAYED,
  Condition.DAMAGED,
];

/**
 * Compares raw value against the "graded" (Grade 9) tier specifically — the realistic bulk
 * grading outcome most submissions land on — rather than PSA 10, which is a lower-odds
 * best case. PSA 10 upside is still worth showing as a stat, just not the basis for the
 * recommendation itself.
 */
const TARGET_PRICE_TYPE = "graded";
const TARGET_LABEL = "Grade 9";

/** Minimum dollar premium (graded value minus raw value) to bother recommending — a rough
 * floor for typical grading + shipping cost, below which the premium likely doesn't cover it. */
const MIN_PREMIUM_CENTS = Math.round(Number(process.env.GRADING_MIN_PREMIUM_USD ?? "20") * 100);
/** Minimum percentage premium on top of the dollar floor, so a marginal gap doesn't qualify. */
const MIN_PREMIUM_PCT = 0.25;

export interface GradingRecommendation {
  targetLabel: string;
  ownedPriceCents: number;
  targetPriceCents: number;
  premiumCents: number;
  premiumPct: number;
  trendChangePct30d: number | null;
  summary: string;
}

/**
 * Evaluate whether an owned raw card is a solid grading candidate. Returns null if the
 * condition isn't raw, there's no data for either tier, the premium doesn't clear the
 * dollar/percentage floors, or the graded tier's price is actively trending down (the
 * "solid trend" gate — a fading premium isn't worth acting on by the time grading returns).
 */
export function computeGradingRecommendation(
  ownedCondition: Condition,
  snapshots: PriceSnapshot[]
): GradingRecommendation | null {
  if (!RAW_CONDITIONS.includes(ownedCondition)) return null;

  const byType = new Map<string, PriceSnapshot[]>();
  for (const snap of snapshots) {
    const list = byType.get(snap.priceType) ?? [];
    list.push(snap);
    byType.set(snap.priceType, list);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }

  const rawSeries = byType.get("loose");
  const gradedSeries = byType.get(TARGET_PRICE_TYPE);
  if (!rawSeries?.length || !gradedSeries?.length) return null;

  const ownedPriceCents = rawSeries[rawSeries.length - 1].price;
  const targetPriceCents = gradedSeries[gradedSeries.length - 1].price;
  if (ownedPriceCents <= 0) return null;

  const premiumCents = targetPriceCents - ownedPriceCents;
  const premiumPct = premiumCents / ownedPriceCents;
  if (premiumCents < MIN_PREMIUM_CENTS || premiumPct < MIN_PREMIUM_PCT) return null;

  const gradedStats = computeChangeStats(gradedSeries);
  const trendChangePct30d = gradedStats?.changePct30d ?? null;
  // Missing trend data (too new to judge) doesn't block a recommendation; an actively
  // declining graded price does.
  const trendOk = trendChangePct30d === null || trendChangePct30d >= 0;
  if (!trendOk) return null;

  const trendNote =
    trendChangePct30d !== null
      ? ` ${TARGET_LABEL} pricing is ${formatPct(trendChangePct30d)} over 30 days, so the premium is holding.`
      : "";

  return {
    targetLabel: TARGET_LABEL,
    ownedPriceCents,
    targetPriceCents,
    premiumCents,
    premiumPct,
    trendChangePct30d,
    summary: `Worth ${formatCents(targetPriceCents)} at ${TARGET_LABEL} vs. ${formatCents(ownedPriceCents)} raw — a ${formatPct(premiumPct)} premium.${trendNote}`,
  };
}

/** Don't re-flag the same card/condition more than once per this many days. */
const ALERT_COOLDOWN_DAYS = 14;

/**
 * Evaluate and, if warranted, persist a GRADING_OPPORTUNITY alert for one owned raw card.
 * Pure local computation — no PriceCharting calls — so unlike variant-checking this is
 * cheap enough to run on every sync for every raw-condition item, not gated by staleness.
 */
export async function evaluateGradingOpportunity(
  cardId: string,
  ownedCondition: Condition,
  userId: string | null
): Promise<Alert | null> {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: { cardId },
    orderBy: { capturedAt: "asc" },
  });

  const rec = computeGradingRecommendation(ownedCondition, snapshots);
  if (!rec) return null;

  const cooldownCutoff = new Date(Date.now() - ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const existing = await prisma.alert.findFirst({
    where: {
      userId,
      cardId,
      type: AlertType.GRADING_OPPORTUNITY,
      priceType: "loose",
      createdAt: { gte: cooldownCutoff },
    },
  });
  if (existing) return null;

  return prisma.alert.create({
    data: {
      userId,
      cardId,
      type: AlertType.GRADING_OPPORTUNITY,
      priceType: "loose",
      message: rec.summary,
      changePct: rec.premiumPct,
      fromPrice: rec.ownedPriceCents,
      toPrice: rec.targetPriceCents,
      windowDays: 30,
    },
  });
}
