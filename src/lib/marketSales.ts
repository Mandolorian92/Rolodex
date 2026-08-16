/**
 * Pulls real sold transactions for a card — from PriceCharting's own marketplace (works
 * with any paid API key, no extra signup) and, if configured, eBay — and records them both
 * as a MarketSale (for display: title/link/image) and as a PriceSnapshot (so the trend
 * engine reacts to an actual sale exactly like it reacts to a guide-price move, at the
 * sale's real date rather than whenever we happened to notice it).
 *
 * Idempotent: re-syncing skips any sale already recorded (by itemUrl), so re-running never
 * double-counts or re-fires trend alerts for the same transaction.
 */
import { prisma } from "@/lib/prisma";
import { PriceSource, type Card } from "@/generated/prisma/client";
import { getSoldOffers } from "@/lib/pricecharting";
import { fetchSoldComps, isEbayConfigured } from "@/lib/ebay";
import { parseConditionString, CONDITION_TO_PRICE_TYPE } from "@/lib/grades";

interface SaleInput {
  source: typeof PriceSource.PRICECHARTING_SALE | typeof PriceSource.EBAY_SALE;
  title: string;
  price: number;
  itemUrl: string;
  imageUrl?: string;
  conditionText?: string;
  soldAt: Date;
}

/** Record one sale if it isn't already known. Returns true if a new sale was recorded. */
async function recordSale(card: Card, sale: SaleInput): Promise<boolean> {
  if (!Number.isFinite(sale.price) || sale.price <= 0) return false;

  const existing = await prisma.marketSale.findUnique({ where: { itemUrl: sale.itemUrl } });
  if (existing) return false;

  await prisma.marketSale.create({
    data: {
      cardId: card.id,
      source: sale.source,
      title: sale.title,
      price: sale.price,
      itemUrl: sale.itemUrl,
      imageUrl: sale.imageUrl,
      condition: sale.conditionText,
      soldAt: sale.soldAt,
    },
  });

  const condition = parseConditionString(sale.conditionText);
  await prisma.priceSnapshot.create({
    data: {
      cardId: card.id,
      source: sale.source,
      priceType: CONDITION_TO_PRICE_TYPE[condition],
      price: sale.price,
      capturedAt: sale.soldAt,
    },
  });

  return true;
}

/** Pull recently sold transactions for this card from PriceCharting's own marketplace. */
export async function syncPriceChartingSoldOffers(card: Card): Promise<number> {
  const offers = await getSoldOffers(card.priceChartingId);
  let recorded = 0;

  for (const offer of offers) {
    if (!offer["is-sold"] || !offer["sale-time"] || !offer.price) continue;
    const itemUrl = offer["offer-url"]
      ? `https://www.pricecharting.com${offer["offer-url"]}`
      : `https://www.pricecharting.com/offer/${offer["offer-id"]}`;

    const wasNew = await recordSale(card, {
      source: PriceSource.PRICECHARTING_SALE,
      title: offer["product-name"] ?? card.name,
      price: offer.price,
      itemUrl,
      conditionText: offer["condition-string"],
      soldAt: new Date(offer["sale-time"]),
    });
    if (wasNew) recorded += 1;
  }

  return recorded;
}

/** Pull recently sold comps for this card from eBay, if configured. No-ops otherwise. */
export async function syncEbaySoldComps(card: Card): Promise<number> {
  if (!isEbayConfigured()) return 0;

  const query = [card.consoleName, card.name].filter(Boolean).join(" ");
  const sales = await fetchSoldComps(query);
  let recorded = 0;

  for (const sale of sales) {
    if (!sale.soldAt) continue;
    // eBay's `condition` field is a generic marketplace condition (New/Used/...), not a
    // card grade — graded-card listing titles usually name the actual grade, so check both.
    const conditionText = [sale.condition, sale.title].filter(Boolean).join(" ");

    const wasNew = await recordSale(card, {
      source: PriceSource.EBAY_SALE,
      title: sale.title,
      price: sale.price,
      itemUrl: sale.itemUrl,
      imageUrl: sale.imageUrl,
      conditionText,
      soldAt: new Date(sale.soldAt),
    });
    if (wasNew) recorded += 1;
  }

  return recorded;
}
