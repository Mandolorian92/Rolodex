/**
 * Client for Scryfall's public Magic: The Gathering catalog — free, open, no API key,
 * generous rate limits (Scryfall asks for ~50-100ms between requests as a courtesy; not a
 * concern for occasional on-demand searches like this one). Catalog/identity only: name,
 * set, image. Pricing comes from TCGPlayer (src/lib/tcgplayerSync.ts) or eBay, not from
 * here — Scryfall's own `prices` field is itself sourced from TCGPlayer, so pulling it here
 * would just be a slower, redundant path to the same number.
 *
 * Untested against the live API from this sandbox (network to api.scryfall.com is blocked
 * here) — built from Scryfall's public docs at https://scryfall.com/docs/api/cards/search.
 * Treat the first real search as the live test, same as PriceCharting/eBay/TCGPlayer needed
 * early in this project.
 */

const SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search";

interface ScryfallCardResponse {
  id: string;
  name: string;
  set_name: string;
  image_uris?: { normal?: string; small?: string };
  // Double-faced cards carry images per face instead of at the top level.
  card_faces?: Array<{ image_uris?: { normal?: string; small?: string } }>;
}

export interface CatalogResult {
  externalId: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
}

/**
 * Search Scryfall's Magic catalog by name. A query that matches nothing is Scryfall's normal
 * 404 response ("no cards found"), not a failure, so that case returns an empty list rather
 * than throwing.
 */
export async function searchScryfallCards(query: string, limit = 10): Promise<CatalogResult[]> {
  const url = new URL(SCRYFALL_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("unique", "prints");

  // Scryfall requires a descriptive User-Agent and Accept header on every request — see
  // https://scryfall.com/docs/api (Rate Limits & Good Citizenship).
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Rolodex/1.0 (card price tracker)", Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Scryfall search error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { data: ScryfallCardResponse[] };
  return data.data.slice(0, limit).map((c) => ({
    externalId: c.id,
    name: c.name,
    setName: c.set_name,
    imageUrl: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
  }));
}
