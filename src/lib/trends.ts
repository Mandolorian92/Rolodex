import { prisma } from "@/lib/prisma";
import { AlertType, PriceSource, type PriceSnapshot } from "@/generated/prisma/client";
import { formatCents, formatPriceType } from "@/lib/format";

/** Minimum move (as a fraction, e.g. 0.10 = 10%) over 7 days to call something "trending". */
const TRENDING_THRESHOLD = 0.1;
/** Pullback from a recent peak (within PEAK_LOOKBACK_DAYS) that triggers a sell signal. */
const PULLBACK_THRESHOLD = 0.08;
/** A run-up this large over 30 days is a take-profit signal on its own. */
const BIG_RUN_THRESHOLD = 0.35;
/** How far back to look for a "recent peak" when checking for a pullback/sell signal. */
const PEAK_LOOKBACK_DAYS = 30;
/** Don't fire the same (card, priceType, alert type) more than once per cooldown window. */
const ALERT_COOLDOWN_HOURS = 24;
/**
 * Skip price-trend alerts entirely for a series currently worth less than this — a 140%
 * move on a card worth $1.60 isn't actionable. Percentage thresholds alone don't catch this
 * since cheap cards swing wildly in percentage terms on tiny dollar moves. Configurable via
 * ALERT_MIN_VALUE_USD since "worth bothering about" is a personal call.
 */
const MIN_ALERT_VALUE_CENTS = Math.round(Number(process.env.ALERT_MIN_VALUE_USD ?? "5") * 100);

export interface ChangeStats {
  latest: PriceSnapshot;
  changePct1d: number | null;
  changePct7d: number | null;
  changePct30d: number | null;
  isNewHigh: boolean;
  peak: PriceSnapshot;
  pullbackFromPeakPct: number;
}

function nearestOnOrBefore(
  snapshots: PriceSnapshot[],
  cutoff: Date
): PriceSnapshot | undefined {
  // snapshots must be sorted ascending by capturedAt
  let candidate: PriceSnapshot | undefined;
  for (const snap of snapshots) {
    if (snap.capturedAt.getTime() <= cutoff.getTime()) {
      candidate = snap;
    } else {
      break;
    }
  }
  return candidate;
}

function pctChange(from: number, to: number): number {
  if (from <= 0) return 0;
  return (to - from) / from;
}

/** Compute momentum stats for one (card, priceType) series. `snapshots` must be sorted ascending. */
export function computeChangeStats(snapshots: PriceSnapshot[]): ChangeStats | null {
  if (snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const now = latest.capturedAt;

  const day = 24 * 60 * 60 * 1000;
  const snap1d = nearestOnOrBefore(snapshots, new Date(now.getTime() - 1 * day));
  const snap7d = nearestOnOrBefore(snapshots, new Date(now.getTime() - 7 * day));
  const snap30d = nearestOnOrBefore(snapshots, new Date(now.getTime() - 30 * day));

  const peakLookbackCutoff = new Date(now.getTime() - PEAK_LOOKBACK_DAYS * day);
  const recentWindow = snapshots.filter((s) => s.capturedAt.getTime() >= peakLookbackCutoff.getTime());
  const peak = recentWindow.reduce((max, s) => (s.price > max.price ? s : max), recentWindow[0]);

  const allTimeMax = snapshots.reduce((max, s) => (s.price > max.price ? s : max), snapshots[0]);
  const isNewHigh = latest.id === allTimeMax.id && snapshots.length > 1;

  return {
    latest,
    changePct1d: snap1d && snap1d.id !== latest.id ? pctChange(snap1d.price, latest.price) : null,
    changePct7d: snap7d && snap7d.id !== latest.id ? pctChange(snap7d.price, latest.price) : null,
    changePct30d: snap30d && snap30d.id !== latest.id ? pctChange(snap30d.price, latest.price) : null,
    isNewHigh,
    peak,
    pullbackFromPeakPct: pctChange(peak.price, latest.price),
  };
}

/**
 * A short clause noting when a price point came from an actual sale rather than
 * PriceCharting's aggregate guide price — the concrete evidence behind a signal.
 */
function saleProvenance(snapshot: PriceSnapshot): string {
  if (snapshot.source === PriceSource.EBAY_SALE) return " — based on a recent eBay sale";
  if (snapshot.source === PriceSource.PRICECHARTING_SALE) return " — based on a recent marketplace sale";
  return "";
}

async function recentlyAlerted(
  userId: string | null,
  cardId: string,
  priceType: string,
  type: AlertType
): Promise<boolean> {
  const cutoff = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await prisma.alert.findFirst({
    where: { userId, cardId, priceType, type, createdAt: { gte: cutoff } },
  });
  return existing !== null;
}

/**
 * Every user who owns at least one copy of this card, so a generated alert can be created
 * once per owner (Alert.acknowledged is inherently per-user — see the schema comment on
 * Alert). Includes `null` for pre-auth collection items that haven't been claimed by an
 * account yet, so those don't silently stop generating alerts. Always returns at least one
 * entry for any card this gets called on, since callers only evaluate cards that are
 * actually in someone's collection.
 */
async function ownerUserIds(cardId: string): Promise<Array<string | null>> {
  const owners = await prisma.collectionItem.findMany({
    where: { cardId },
    select: { userId: true },
    distinct: ["userId"],
  });
  return owners.map((o) => o.userId);
}

/**
 * Evaluate every priceType series for a card and persist any new alerts (trending up/down,
 * new high, sell signal). Returns the alerts actually created (skips ones already fired
 * within the cooldown window).
 */
export async function evaluateCardTrends(cardId: string) {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: { cardId },
    orderBy: { capturedAt: "asc" },
  });

  const byPriceType = new Map<string, PriceSnapshot[]>();
  for (const snap of snapshots) {
    const list = byPriceType.get(snap.priceType) ?? [];
    list.push(snap);
    byPriceType.set(snap.priceType, list);
  }

  const owners = await ownerUserIds(cardId);
  const created = [];

  for (const [priceType, series] of byPriceType) {
    const stats = computeChangeStats(series);
    if (!stats) continue;
    if (stats.latest.price < MIN_ALERT_VALUE_CENTS) continue;

    const candidates: Array<{
      type: AlertType;
      message: string;
      changePct: number;
      fromPrice: number;
      toPrice: number;
      windowDays: number;
    }> = [];

    const label = formatPriceType(priceType);

    if (stats.changePct7d !== null && stats.changePct7d >= TRENDING_THRESHOLD) {
      candidates.push({
        type: AlertType.TRENDING_UP,
        message: `${label} is up ${(stats.changePct7d * 100).toFixed(1)}% over the last 7 days, now ${formatCents(stats.latest.price)}${saleProvenance(stats.latest)}`,
        changePct: stats.changePct7d,
        fromPrice: Math.round(stats.latest.price / (1 + stats.changePct7d)),
        toPrice: stats.latest.price,
        windowDays: 7,
      });
    }

    if (stats.changePct7d !== null && stats.changePct7d <= -TRENDING_THRESHOLD) {
      candidates.push({
        type: AlertType.TRENDING_DOWN,
        message: `${label} is down ${(Math.abs(stats.changePct7d) * 100).toFixed(1)}% over the last 7 days, now ${formatCents(stats.latest.price)}${saleProvenance(stats.latest)}`,
        changePct: stats.changePct7d,
        fromPrice: Math.round(stats.latest.price / (1 + stats.changePct7d)),
        toPrice: stats.latest.price,
        windowDays: 7,
      });
    }

    if (stats.isNewHigh && series.length > 1) {
      candidates.push({
        type: AlertType.NEW_HIGH,
        message: `${label} just hit a new high of ${formatCents(stats.latest.price)}${saleProvenance(stats.latest)}`,
        changePct: stats.changePct30d ?? 0,
        fromPrice: series[series.length - 2].price,
        toPrice: stats.latest.price,
        windowDays: 30,
      });
    }

    const bigRun = stats.changePct30d !== null && stats.changePct30d >= BIG_RUN_THRESHOLD;
    const pulledBackFromPeak =
      stats.peak.id !== stats.latest.id && stats.pullbackFromPeakPct <= -PULLBACK_THRESHOLD;

    if (bigRun || pulledBackFromPeak) {
      const reason = pulledBackFromPeak
        ? `pulled back ${(Math.abs(stats.pullbackFromPeakPct) * 100).toFixed(1)}% from its recent high of ${formatCents(stats.peak.price)} — momentum may be turning`
        : `up ${((stats.changePct30d ?? 0) * 100).toFixed(1)}% over 30 days to ${formatCents(stats.latest.price)} — consider taking profit`;
      candidates.push({
        type: AlertType.SELL_SIGNAL,
        message: `${label} ${reason}${saleProvenance(stats.latest)}`,
        changePct: pulledBackFromPeak ? stats.pullbackFromPeakPct : stats.changePct30d ?? 0,
        fromPrice: stats.peak.price,
        toPrice: stats.latest.price,
        windowDays: 30,
      });
    }

    for (const candidate of candidates) {
      for (const ownerId of owners) {
        if (await recentlyAlerted(ownerId, cardId, priceType, candidate.type)) continue;
        const alert = await prisma.alert.create({
          data: { userId: ownerId, cardId, priceType, ...candidate },
        });
        created.push(alert);
      }
    }
  }

  return created;
}
