import { prisma } from "@/lib/prisma";
import { PriceSource } from "@/generated/prisma/client";
import { getProduct, extractPriceFields } from "@/lib/pricecharting";
import { syncPriceChartingSoldOffers, syncEbaySoldComps } from "@/lib/marketSales";
import { evaluateCardTrends } from "@/lib/trends";
import { notifyNewAlerts, type AlertWithCard } from "@/lib/notify";
import { checkForHigherValueVariants, shouldRecheckVariant } from "@/lib/variants";
import { evaluateGradingOpportunity } from "@/lib/gradingRecs";

export interface CardSyncResult {
  cardId: string;
  cardName: string;
  guideSnapshotsCreated: number;
  salesRecorded: number;
  alerts: AlertWithCard[];
  error?: string;
}

/**
 * Refresh a single card's data: the guide price (per condition, from PriceCharting's
 * Prices API), then real recent sold transactions (PriceCharting's own marketplace, and
 * eBay if configured) — both feed the same PriceSnapshot timeline, so the trend engine
 * treats an actual sale exactly like a guide-price move, at its real sale date.
 */
export async function syncCard(cardId: string): Promise<CardSyncResult> {
  const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
  const result: CardSyncResult = {
    cardId: card.id,
    cardName: card.name,
    guideSnapshotsCreated: 0,
    salesRecorded: 0,
    alerts: [],
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
  // only runs here (never during bulk import) and only when this card hasn't been checked
  // recently — see shouldRecheckVariant(). A fresh check always runs via the manual
  // "Check for higher-value variants" button instead.
  if (shouldRecheckVariant(card)) {
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
    select: { cardId: true },
    distinct: ["cardId"],
  });

  const results: CardSyncResult[] = [];
  for (const { cardId } of items) {
    // Sequential on purpose: stay well under PriceCharting/eBay rate limits (two
    // PriceCharting calls per card now — guide price, then sold offers).
    results.push(await syncCard(cardId));
  }

  const allAlerts = results.flatMap((r) => r.alerts);
  try {
    await notifyNewAlerts(allAlerts);
  } catch (err) {
    console.error("[sync] Failed to send alert notification email:", err);
  }

  return results;
}
