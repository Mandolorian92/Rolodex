import { prisma } from "@/lib/prisma";
import { PriceSource } from "@/generated/prisma/client";
import { getOffers, type PriceChartingOffer } from "@/lib/pricecharting";
import { parseConditionString, CONDITION_TO_PRICE_TYPE } from "@/lib/grades";
import { checkForHigherValueVariants } from "@/lib/variants";

export interface ImportSummary {
  offersFound: number;
  cardsImported: number;
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
 * Import a user's existing PriceCharting collection (pricecharting.com/offers?...&status=collection)
 * in one Marketplace API call. This is the source of truth for what's owned going forward:
 * re-running it overwrites quantity/condition from PriceCharting rather than adding to it,
 * so it stays in sync if you edit your collection there.
 *
 * Each offer already includes a current `value`, so we seed an initial PriceSnapshot per
 * card without needing a separate (rate-limited) /api/product call per card.
 */
export async function importPriceChartingCollection(sellerId?: string): Promise<ImportSummary> {
  const seller = getSellerId(sellerId);
  const offers = await getOffers({ seller, status: "collection" });

  const summary: ImportSummary = {
    offersFound: offers.length,
    cardsImported: 0,
    priceSnapshotsCreated: 0,
    skipped: [],
  };

  for (const offer of offers) {
    try {
      await importOffer(offer, summary);
    } catch (err) {
      summary.skipped.push({
        offer: offer["product-name"] ?? offer.id,
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

  const condition = parseConditionString(offer["condition-string"]);
  const quantity = offer.quantity && offer.quantity > 0 ? offer.quantity : 1;

  const card = await prisma.card.upsert({
    where: { priceChartingId: offer.id },
    create: {
      priceChartingId: offer.id,
      name: offer["product-name"],
      consoleName: offer["console-name"] ?? null,
    },
    update: {
      name: offer["product-name"],
      consoleName: offer["console-name"] ?? null,
    },
  });

  await prisma.collectionItem.upsert({
    where: { cardId_condition: { cardId: card.id, condition } },
    create: { cardId: card.id, quantity, condition },
    update: { quantity },
  });
  summary.cardsImported += 1;

  if (offer.value && offer.value > 0) {
    await prisma.priceSnapshot.create({
      data: {
        cardId: card.id,
        source: PriceSource.PRICECHARTING_GUIDE,
        priceType: CONDITION_TO_PRICE_TYPE[condition],
        price: offer.value,
      },
    });
    summary.priceSnapshotsCreated += 1;
  }

  try {
    await checkForHigherValueVariants(card);
  } catch (err) {
    // Nice-to-have on top of the import; don't fail the import over it.
    console.warn(`[import] variant check failed for card ${card.id}:`, err);
  }
}
