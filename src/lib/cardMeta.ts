/**
 * Best-effort category/language classification, derived from text PriceCharting already
 * gives us (console/set name, product name) rather than a separate API call. Both the
 * Marketplace API (used for collection import) and the Prices API don't expose a clean
 * "this is a Pokemon card" / "this card is in French" field, so this is necessarily a
 * heuristic — same spirit as the variant-token extraction in variants.ts, and just as
 * incomplete: extend the token lists below as new sets/languages come up.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  "pokemon-card": "Pokémon",
  "sports-card": "Sports",
  "magic-card": "Magic: The Gathering",
  "yugioh-card": "Yu-Gi-Oh!",
  "other-card": "Other",
};

const SPORTS_TOKENS = [
  "baseball",
  "basketball",
  "football",
  "hockey",
  "soccer",
  "golf",
  "boxing",
  "wrestling",
  "wwe",
  "ufc",
  "racing",
  "nascar",
  "formula 1",
  "topps",
  "panini",
  "fleer",
  "upper deck",
  "bowman",
  "donruss",
  "score",
  "leaf",
  "stadium club",
];

/**
 * Guess a card's category from its console/set name (e.g. "Pokemon Base Set",
 * "1986 Fleer Basketball", "Magic: The Gathering Alpha"). Returns null only when there's no
 * console name to go on at all — an unrecognized-but-present set name still buckets as
 * "other-card" rather than null, so category filtering doesn't just lump those in with
 * "unknown".
 */
export function deriveCategory(consoleName?: string | null): string | null {
  if (!consoleName) return null;
  const s = consoleName.toLowerCase();
  if (s.includes("pokemon") || s.includes("pokémon")) return "pokemon-card";
  if (s.includes("magic")) return "magic-card";
  if (s.includes("yu-gi-oh") || s.includes("yugioh")) return "yugioh-card";
  if (SPORTS_TOKENS.some((token) => s.includes(token))) return "sports-card";
  return "other-card";
}

/**
 * Language tokens as they tend to show up in either the product name ("Pikachu (French)")
 * or the console/set name ("Pokemon Japanese Base Set") — checked as whole words against
 * both. Null means English/unspecified: most catalogs don't bother marking English cards
 * explicitly, so absence here isn't a confirmed "this is English," just "no foreign-language
 * marker was found."
 */
export const LANGUAGE_TOKENS = [
  "Japanese",
  "Korean",
  "Chinese",
  "French",
  "German",
  "Italian",
  "Spanish",
  "Portuguese",
  "Dutch",
  "Polish",
  "Russian",
  "Indonesian",
  "Thai",
];

export function detectLanguage(name: string, consoleName?: string | null): string | null {
  const haystack = `${name} ${consoleName ?? ""}`;
  for (const token of LANGUAGE_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, "i").test(haystack)) return token;
  }
  return null;
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** Build a "Category" filter's options from whatever cards are actually present, most-common first. */
export function buildCategoryOptions(cards: Array<{ category: string | null }>): FilterOption[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = card.category ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return [
    { value: "all", label: "All categories", count: cards.length },
    ...sorted.map(([key, count]) => ({
      value: key,
      label: key === "unknown" ? "Unknown" : CATEGORY_LABELS[key] ?? key,
      count,
    })),
  ];
}

/** Shared predicate for the category/language filter dropdowns — "all" always matches. */
export function matchesCardMetaFilter(
  card: { category: string | null; language: string | null },
  category: string,
  language: string
): boolean {
  if (category !== "all" && (card.category ?? "unknown") !== category) return false;
  if (language !== "all" && (card.language ?? "unspecified") !== language) return false;
  return true;
}

/** Build a "Language" filter's options from whatever cards are actually present, most-common first. */
export function buildLanguageOptions(cards: Array<{ language: string | null }>): FilterOption[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = card.language ?? "unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return [
    { value: "all", label: "All languages", count: cards.length },
    ...sorted.map(([key, count]) => ({
      value: key,
      label: key === "unspecified" ? "English / unspecified" : key,
      count,
    })),
  ];
}
