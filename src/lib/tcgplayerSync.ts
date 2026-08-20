/**
 * Matches a card to its TCGPlayer catalog product (cached once found) and pulls its Market
 * Price into the same merged PriceSnapshot timeline as PriceCharting/eBay — see
 * src/lib/tcgplayer.ts for the important caveat that none of this has been exercised
 * against the real API from this sandbox yet.
 */
import { prisma } from "@/lib/prisma";
import { PriceSource, type Card } from "@/generated/prisma/client";
import {
  TCGPLAYER_CATEGORY_ID,
  isTcgplayerConfigured,
  searchTcgplayerProducts,
  getTcgplayerMarketPriceCents,
} from "@/lib/tcgplayer";
import { extractVariant } from "@/lib/variants";

/** How often to retry the catalog search for a card that hasn't matched yet (or never tried). */
const RECHECK_STALENESS_DAYS = 14;

function shouldRecheckMatch(card: Card): boolean {
  if (!card.tcgplayerCheckedAt) return true;
  const cutoff = Date.now() - RECHECK_STALENESS_DAYS * 24 * 60 * 60 * 1000;
  return card.tcgplayerCheckedAt.getTime() < cutoff;
}

/**
 * Best-effort pick from search results: prefer an exact name match, then a match on the
 * variant-stripped base name (reusing the same Holo/Reverse-Holo-style token stripping the
 * PriceCharting variant checker uses — harmless no-op for games where those tokens don't
 * apply), otherwise fall back to the top search result.
 */
function pickBestMatch(cardName: string, results: Array<{ productId: number; name: string }>): number | null {
  if (results.length === 0) return null;
  const lowerName = cardName.toLowerCase();
  const exact = results.find((r) => r.name.toLowerCase() === lowerName);
  if (exact) return exact.productId;

  const targetBase = extractVariant(cardName).baseName.toLowerCase();
  const baseMatch = results.find((r) => extractVariant(r.name).baseName.toLowerCase() === targetBase);
  if (baseMatch) return baseMatch.productId;

  return results[0].productId;
}

/**
 * Match (if needed) and price a card via TCGPlayer. No-ops (returns 0) when TCGPlayer isn't
 * configured, the card's category isn't one TCGPlayer carries, or no product/price is found.
 * Returns the number of PriceSnapshot rows created (0 or 1).
 */
export async function syncTcgplayerPrice(card: Card): Promise<number> {
  if (!isTcgplayerConfigured()) return 0;

  const categoryId = card.category ? TCGPLAYER_CATEGORY_ID[card.category] : undefined;
  if (!categoryId) return 0; // e.g. sports-card, other-card, or category not yet known

  let productId = card.tcgplayerProductId ? Number(card.tcgplayerProductId) : null;

  if (!productId && shouldRecheckMatch(card)) {
    const results = await searchTcgplayerProducts(card.name, categoryId);
    productId = pickBestMatch(card.name, results);
    await prisma.card.update({
      where: { id: card.id },
      data: { tcgplayerProductId: productId ? String(productId) : null, tcgplayerCheckedAt: new Date() },
    });
  }

  if (!productId) return 0;

  const priceCents = await getTcgplayerMarketPriceCents(productId);
  if (priceCents == null) return 0;

  await prisma.priceSnapshot.create({
    data: { cardId: card.id, source: PriceSource.TCGPLAYER_MARKET, priceType: "loose", price: priceCents },
  });
  return 1;
}
