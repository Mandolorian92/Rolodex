import { NextRequest, NextResponse } from "next/server";
import { searchProducts, extractPriceFields } from "@/lib/pricecharting";
import { searchScryfallCards } from "@/lib/scryfall";
import { searchPokemonCards } from "@/lib/pokemontcg";

export type CardSearchSource = "pricecharting" | "scryfall" | "pokemontcg";

export interface CardSearchResult {
  source: CardSearchSource;
  externalId: string;
  name: string;
  consoleName: string | null;
  imageUrl: string | null;
  /** Only PriceCharting results carry a price preview — Scryfall/pokemontcg.io are catalog-only. */
  prices?: Record<string, number>;
}

/**
 * Search so the user can find a card to add to their collection — PriceCharting's catalog
 * (every category) plus, for Magic/Pokémon specifically, the free Scryfall/pokemontcg.io
 * catalogs, so those two categories can be identified without ever calling PriceCharting
 * (see the note on the Card model in schema.prisma). All three run in parallel and are each
 * best-effort: one source erroring — or simply having no matches — never blocks the others.
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing ?q= search query" }, { status: 400 });
  }

  const [priceCharting, scryfall, pokemontcg] = await Promise.allSettled([
    searchProducts(query),
    searchScryfallCards(query),
    searchPokemonCards(query),
  ]);

  const results: CardSearchResult[] = [];

  if (priceCharting.status === "fulfilled") {
    results.push(
      ...priceCharting.value.map((p) => ({
        source: "pricecharting" as const,
        externalId: p.id,
        name: p["product-name"],
        consoleName: p["console-name"] ?? null,
        imageUrl: null,
        prices: extractPriceFields(p),
      }))
    );
  }
  if (scryfall.status === "fulfilled") {
    results.push(
      ...scryfall.value.map((c) => ({
        source: "scryfall" as const,
        externalId: c.externalId,
        name: c.name,
        consoleName: c.setName,
        imageUrl: c.imageUrl,
      }))
    );
  }
  if (pokemontcg.status === "fulfilled") {
    results.push(
      ...pokemontcg.value.map((c) => ({
        source: "pokemontcg" as const,
        externalId: c.externalId,
        name: c.name,
        consoleName: c.setName,
        imageUrl: c.imageUrl,
      }))
    );
  }

  // Scryfall/pokemontcg.io erroring is quiet (logged, not surfaced) since they're
  // supplementary — the app still works off PriceCharting alone if they're unreachable.
  if (scryfall.status === "rejected") console.warn("[cards/search] Scryfall search failed:", scryfall.reason);
  if (pokemontcg.status === "rejected") console.warn("[cards/search] pokemontcg.io search failed:", pokemontcg.reason);

  // Nothing came back from any source and PriceCharting specifically errored (e.g. no API
  // key configured) — surface that, since it's the most likely reason a user sees nothing.
  if (results.length === 0 && priceCharting.status === "rejected") {
    return NextResponse.json(
      { error: priceCharting.reason instanceof Error ? priceCharting.reason.message : "Search failed" },
      { status: 502 }
    );
  }

  return NextResponse.json({ results });
}
