import { prisma } from "@/lib/prisma";
import { PriceSource } from "@/generated/prisma/client";
import { getProduct, extractPriceFields } from "@/lib/pricecharting";
import { syncPriceChartingSoldOffers, syncEbaySoldComps } from "@/lib/marketSales";
import { evaluateCardTrends } from "@/lib/trends";
import { notifyNewAlerts, type AlertWithCard } from "@/lib/notify";
import { checkForHigherValueVariants, shouldRecheckVariant } from "@/lib/variants";
import { evaluateGradingOpportunity } from "@/lib/gradingRecs";
import { deriveCategory, detectLanguage } from "@/lib/cardMeta";
import { startSyncProgress, reportSyncCard, completeSyncCard, finishSyncProgress } from "@/lib/syncProgress";

/**
 * How many cards' variant check a single syncCollection() run will actually perform, even
 * if more are due. Each check costs up to 6 extra rate-limited PriceCharting calls, so with
 * no cap a big batch of newly-added cards (variantCheckedAt starts null) could balloon one
 * sync run by tens of minutes. Capping it means the backlog drains gradually across several
 * sync runs instead of blocking one — see the ordering in syncCollection(), which processes
 * the most-overdue cards first so the backlog actually moves forward each run rather than
 * the same handful of cards perpetually winning an arbitrary DB order.
 */
const MAX_VARIANT_CHECKS_PER_SYNC = Number(process.env.MAX_VARIANT_CHECKS_PER_SYNC ?? "25");

export interface CardSyncResult {
  cardId: string;
  cardName: string;
  guideSnapshotsCreated: number;
  salesRecorded: number;
  alerts: AlertWithCard[];
  variantChecked: boolean;
  error?: string;
}

/**
 * Refresh a single card's data: the guide price (per condition, from PriceCharting's
 * Prices API), then real recent sold transactions (PriceCharting's own marketplace, and
 * eBay if configured) — both feed the same PriceSnapshot timeline, so the trend engine
 * treats an actual sale exactly like a guide-price move, at its real sale date.
 */
export async function syncCard(cardId: string, opts?: { allowVariantCheck?: boolean }): Promise<CardSyncResult> {
  const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
  reportSyncCard(card.name);
  const result: CardSyncResult = {
    cardId: card.id,
    cardName: card.name,
    guideSnapshotsCreated: 0,
    salesRecorded: 0,
    alerts: [],
    variantChecked: false,
  };

  try {
    const product = await getProduct(card.priceChartingId);
    const prices = extractPriceFields(product);

    for (const [priceType, cents] of Object.entries(prices)) {
      await prisma.priceSnapshot.create({
        data: { cardId: card.id, source: PriceSource.PRICECHARTING_GUIDE, priceType, price: cents },
      });
      result.guideSnapshotsCreated += 1;
    }

    // Category/language are derived from data this call already returned — no extra API
    // cost — so every sync also backfills them for cards imported before this existed,
    // without needing a separate one-off migration script. Only fills in a currently-null
    // value, never overwrites one — the heuristic misses real cases (e.g. a Japanese set
    // whose name doesn't literally contain "Japanese"), so once a value is set — by this
    // heuristic or by a manual correction on the card page — a later sync won't stomp it.
    const consoleName = product["console-name"] ?? card.consoleName;
    const data: { category?: string | null; language?: string | null } = {};
    if (card.category === null) data.category = deriveCategory(consoleName);
    if (card.language === null) data.language = detectLanguage(product["product-name"] ?? card.name, consoleName);
    if (Object.keys(data).length > 0) {
      await prisma.card.update({ where: { id: card.id }, data });
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }

  try {
    result.salesRecorded += await syncPriceChartingSoldOffers(card);
  } catch (err) {
    // Sold-offer data is a bonus on top of the guide price; don't fail the whole sync over it.
    console.warn(`[sync] PriceCharting sold offers failed for card ${card.id}:`, err);
  }

  try {
    result.salesRecorded += await syncEbaySoldComps(card);
  } catch (err) {
    console.warn(`[sync] eBay sold comps failed for card ${card.id}:`, err);
  }

  const alerts = await evaluateCardTrends(card.id);
  result.alerts = alerts.map((alert) => ({ ...alert, card }));

  // Variant-mismatch checking costs several extra rate-limited PriceCharting calls, so it
  // only runs here (never during bulk import), only when this card hasn't been checked
  // recently (see shouldRecheckVariant()), and only while this sync run still has budget
  // left (see MAX_VARIANT_CHECKS_PER_SYNC / opts.allowVariantCheck). A fresh check always
  // runs via the manual "Check for higher-value variants" button instead, ignoring both.
  if ((opts?.allowVariantCheck ?? true) && shouldRecheckVariant(card)) {
    result.variantChecked = true;
    try {
      const { alert: variantAlert } = await checkForHigherValueVariants(card);
      if (variantAlert) result.alerts.push({ ...variantAlert, card });
    } catch (err) {
      console.warn(`[sync] variant check failed for card ${card.id}:`, err);
    }
  }

  // Pure local computation (no API calls) — safe to run every sync, unlike variant checks.
  try {
    const collectionItems = await prisma.collectionItem.findMany({ where: { cardId: card.id } });
    for (const item of collectionItems) {
      const gradingAlert = await evaluateGradingOpportunity(card.id, item.condition);
      if (gradingAlert) result.alerts.push({ ...gradingAlert, card });
    }
  } catch (err) {
    console.warn(`[sync] grading recommendation check failed for card ${card.id}:`, err);
  }

  return result;
}

/**
 * Refresh prices for every distinct card currently in the collection, then send one
 * summary email for everything that fired across the whole run (rather than one email
 * per card) if notifications are configured.
 */
export async function syncCollection(): Promise<CardSyncResult[]> {
  const items = await prisma.collectionItem.findMany({
    select: { cardId: true, card: { select: { variantCheckedAt: true } } },
    distinct: ["cardId"],
  });

  // Most-overdue-for-a-variant-check cards first (nulls — never checked — sort first), so
  // the MAX_VARIANT_CHECKS_PER_SYNC budget actually drains the backlog over successive
  // syncs instead of always landing on the same cards.
  items.sort((a, b) => (a.card.variantCheckedAt?.getTime() ?? 0) - (b.card.variantCheckedAt?.getTime() ?? 0));

  startSyncProgress(items.length);
  let variantChecksUsed = 0;
  const results: CardSyncResult[] = [];
  try {
    for (const { cardId } of items) {
      // Sequential on purpose: stay well under PriceCharting/eBay rate limits (two
      // PriceCharting calls per card now — guide price, then sold offers).
      const result = await syncCard(cardId, { allowVariantCheck: variantChecksUsed < MAX_VARIANT_CHECKS_PER_SYNC });
      if (result.variantChecked) variantChecksUsed += 1;
      results.push(result);
      completeSyncCard();
    }
  } finally {
    finishSyncProgress(
      results.filter((r): r is CardSyncResult & { error: string } => !!r.error).map((r) => ({ cardName: r.cardName, error: r.error }))
    );
  }

  const allAlerts = results.flatMap((r) => r.alerts);
  try {
    await notifyNewAlerts(allAlerts);
  } catch (err) {
    console.error("[sync] Failed to send alert notification email:", err);
  }

  return results;
}
