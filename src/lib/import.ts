import { prisma } from "@/lib/prisma";
import { PriceSource } from "@/generated/prisma/client";
import { getAllOffers, type PriceChartingOffer } from "@/lib/pricecharting";
import { parseConditionString, CONDITION_TO_PRICE_TYPE } from "@/lib/grades";

export interface ImportSummary {
  offersFound: number;
  newCards: number;
  updatedCards: number;
  unchangedCards: number;
  priceSnapshotsCreated: number;
  skipped: Array<{ offer: string; reason: string }>;
}

function getSellerId(explicit?: string): string {
  const sellerId = explicit || process.env.PRICECHARTING_SELLER_ID;
  if (!sellerId) {
    throw new Error(
      "No PriceCharting seller id provided. Pass one explicitly or set PRICECHARTING_SELLER_ID " +
        "— find it in the URL of your collection page: pricecharting.com/offers?...&seller=THIS_PART&status=collection"
    );
  }
  return sellerId;
}

/**
 * Import a user's existing PriceCharting collection (pricecharting.com/offers?...&status=collection),
 * paging through as many /api/offers calls as it takes to get everything (see getAllOffers).
 * This is the source of truth for what's owned going forward: re-running it overwrites
 * quantity/condition from PriceCharting rather than adding to it, so it stays in sync if
 * you edit your collection there.
 *
 * Each offer already includes a current `value`, so we seed an initial PriceSnapshot per
 * card without needing a separate (rate-limited) /api/product call per card.
 */
export async function importPriceChartingCollection(sellerId?: string): Promise<ImportSummary> {
  const seller = getSellerId(sellerId);
  const offers = await getAllOffers({ seller, status: "collection" });

  const summary: ImportSummary = {
    offersFound: offers.length,
    newCards: 0,
    updatedCards: 0,
    unchangedCards: 0,
    priceSnapshotsCreated: 0,
    skipped: [],
  };

  for (const offer of offers) {
    try {
      await importOffer(offer, summary);
    } catch (err) {
      summary.skipped.push({
        offer: offer["product-name"] ?? String(offer.id),
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

async function importOffer(offer: PriceChartingOffer, summary: ImportSummary) {
  if (!offer.id || !offer["product-name"]) {
    summary.skipped.push({ offer: offer["offer-id"] ?? "unknown", reason: "Missing product id/name" });
    return;
  }

  // The Marketplace API (/api/offers) returns `id` as a JSON number, unlike the Prices API
  // (/api/product, /api/products) which returns it as a string — coerce so it matches
  // Card.priceChartingId's string type either way.
  const priceChartingId = String(offer.id);

  const condition = parseConditionString(offer["condition-string"]);
  const quantity = offer.quantity && offer.quantity > 0 ? offer.quantity : 1;
  const name = offer["product-name"];
  const consoleName = offer["console-name"] ?? null;

  // Re-running the import (e.g. after adding more cards on PriceCharting) shouldn't re-write
  // everything that hasn't actually changed — that's wasted DB writes on a 600-card
  // collection, and blind writes to CollectionItem would also stomp local edits. So each
  // step reads first and only writes when something's actually different, then reports
  // new/updated/unchanged separately so it's obvious re-imports are only touching the delta.
  const existingCard = await prisma.card.findUnique({ where: { priceChartingId } });

  let card = existingCard;
  let cardChanged = false;
  if (!card) {
    card = await prisma.card.create({ data: { priceChartingId, name, consoleName } });
  } else if (card.name !== name || card.consoleName !== consoleName) {
    card = await prisma.card.update({ where: { id: card.id }, data: { name, consoleName } });
    cardChanged = true;
  }

  const existingItem = await prisma.collectionItem.findUnique({
    where: { cardId_condition: { cardId: card.id, condition } },
  });

  let itemChanged = false;
  if (!existingItem) {
    await prisma.collectionItem.create({ data: { cardId: card.id, quantity, condition } });
    itemChanged = true;
  } else if (existingItem.quantity !== quantity) {
    await prisma.collectionItem.update({ where: { id: existingItem.id }, data: { quantity } });
    itemChanged = true;
  }

  if (!existingCard) {
    summary.newCards += 1;
  } else if (cardChanged || itemChanged) {
    summary.updatedCards += 1;
  } else {
    summary.unchangedCards += 1;
  }

  if (offer.value && offer.value > 0) {
    const priceType = CONDITION_TO_PRICE_TYPE[condition];
    const latestSnapshot = await prisma.priceSnapshot.findFirst({
      where: { cardId: card.id, source: PriceSource.PRICECHARTING_GUIDE, priceType },
      orderBy: { capturedAt: "desc" },
    });

    // Skip writing a new snapshot if the price hasn't moved since the last one — otherwise
    // every re-import stamps a fresh, identical row for every unchanged card.
    if (!latestSnapshot || latestSnapshot.price !== offer.value) {
      await prisma.priceSnapshot.create({
        data: { cardId: card.id, source: PriceSource.PRICECHARTING_GUIDE, priceType, price: offer.value },
      });
      summary.priceSnapshotsCreated += 1;
    }
  }

  // Variant-mismatch checking happens during the next sync instead of here — it costs
  // several extra rate-limited PriceCharting calls per card, which would make a 30+ card
  // import take minutes if run inline. See shouldRecheckVariant() in variants.ts.
}
