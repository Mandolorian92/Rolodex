/**
 * Client for the Pokémon TCG API (pokemontcg.io) — a free, open catalog of Pokémon cards.
 * Works without a key at a lower rate limit; set POKEMONTCG_API_KEY (free signup at
 * https://pokemontcg.io/) for a higher one. Catalog/identity only, same reasoning as
 * scryfall.ts — pricing comes from TCGPlayer/eBay, not this API's own bundled TCGPlayer
 * price mirror.
 *
 * Untested against the live API from this sandbox (network to api.pokemontcg.io is blocked
 * here) — built from the public docs at https://docs.pokemontcg.io/api-reference/cards/search-cards.
 * Treat the first real search as the live test, same as PriceCharting/eBay/TCGPlayer needed
 * early in this project.
 */

const POKEMONTCG_SEARCH_URL = "https://api.pokemontcg.io/v2/cards";

interface PokemonTcgCardResponse {
  id: string;
  name: string;
  set?: { name?: string };
  images?: { large?: string; small?: string };
}

export interface CatalogResult {
  externalId: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
}

/** Search the Pokémon TCG catalog by name (prefix match on the card's name field). */
export async function searchPokemonCards(query: string, limit = 10): Promise<CatalogResult[]> {
  const sanitized = query.replace(/"/g, "");
  const url = new URL(POKEMONTCG_SEARCH_URL);
  url.searchParams.set("q", `name:"${sanitized}*"`);
  url.searchParams.set("pageSize", String(limit));

  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  const res = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`pokemontcg.io search error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { data: PokemonTcgCardResponse[] };
  return data.data.map((c) => ({
    externalId: c.id,
    name: c.name,
    setName: c.set?.name ?? null,
    imageUrl: c.images?.large ?? c.images?.small ?? null,
  }));
}
