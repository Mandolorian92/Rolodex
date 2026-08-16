import { prisma } from "@/lib/prisma";
import { PriceSource } from "@/generated/prisma/client";
import { getProduct, extractPriceFields } from "@/lib/pricecharting";
import { fetchSoldComps, isEbayConfigured } from "@/lib/ebay";
import { evaluateCardTrends } from "@/lib/trends";

export interface CardSyncResult {
  cardId: string;
  cardName: string;
  snapshotsCreated: number;
  ebaySalesCreated: number;
  alertsCreated: number;
  error?: string;
}

/** Refresh PriceCharting prices (and eBay sold comps, if configured) for a single card. */
export async function syncCard(cardId: string): Promise<CardSyncResult> {
  const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
  const result: CardSyncResult = {
    cardId: card.id,
    cardName: card.name,
    snapshotsCreated: 0,
    ebaySalesCreated: 0,
    alertsCreated: 0,
  };

  try {
    const product = await getProduct(card.priceChartingId);
    const prices = extractPriceFields(product);

    for (const [priceType, cents] of Object.entries(prices)) {
      await prisma.priceSnapshot.create({
        data: { cardId: card.id, source: PriceSource.PRICECHARTING, priceType, price: cents },
      });
      result.snapshotsCreated += 1;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }

  if (isEbayConfigured()) {
    try {
      const query = [card.consoleName, card.name].filter(Boolean).join(" ");
      const sales = await fetchSoldComps(query);
      for (const sale of sales) {
        if (!sale.soldAt) continue;
        await prisma.ebaySale.upsert({
          where: { itemUrl: sale.itemUrl },
          create: {
            cardId: card.id,
            title: sale.title,
            price: sale.price,
            itemUrl: sale.itemUrl,
            imageUrl: sale.imageUrl,
            condition: sale.condition,
            soldAt: new Date(sale.soldAt),
          },
          update: {},
        });
        result.ebaySalesCreated += 1;
      }
    } catch (err) {
      // eBay comps are a nice-to-have; don't fail the whole sync over them.
      console.warn(`[sync] eBay comps failed for card ${card.id}:`, err);
    }
  }

  const alerts = await evaluateCardTrends(card.id);
  result.alertsCreated = alerts.length;

  return result;
}

/** Refresh prices for every distinct card currently in the collection. */
export async function syncCollection(): Promise<CardSyncResult[]> {
  const items = await prisma.collectionItem.findMany({
    select: { cardId: true },
    distinct: ["cardId"],
  });

  const results: CardSyncResult[] = [];
  for (const { cardId } of items) {
    // Sequential on purpose: stay well under PriceCharting/eBay rate limits.
    results.push(await syncCard(cardId));
  }
  return results;
}
