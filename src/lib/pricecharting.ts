/**
 * Client for PriceCharting's API (https://www.pricecharting.com/api-documentation).
 * PriceCharting aggregates completed eBay sales into per-condition market prices for
 * trading cards, video games, and other collectibles — this is our primary price source.
 *
 * All prices returned by the API are in US cents.
 */

const BASE_URL = "https://www.pricecharting.com/api";

export class PriceChartingError extends Error {}

function getApiKey(): string {
  const key = process.env.PRICECHARTING_API_KEY;
  if (!key) {
    throw new PriceChartingError(
      "PRICECHARTING_API_KEY is not set. Copy .env.example to .env and configure it."
    );
  }
  return key;
}

// Raw shape of a product as returned by PriceCharting. Price fields vary by category
// (video games use loose/cib/new; cards use ungraded/grade-N/gem-mint), so every price
// field is optional and we discover whichever ones are present at runtime.
export interface PriceChartingProduct {
  id: string;
  "product-name": string;
  "console-name"?: string;
  "genre"?: string;
  [priceField: string]: string | undefined;
}

export interface PriceChartingSearchResult {
  status: string;
  products: PriceChartingProduct[];
}

async function pcFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("t", getApiKey());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new PriceChartingError(`PriceCharting API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as T & { status?: string; "error-message"?: string };
  if (data.status && data.status !== "success") {
    throw new PriceChartingError(data["error-message"] ?? "Unknown PriceCharting API error");
  }
  return data;
}

/** Search the PriceCharting catalog by free-text query (card name, set, etc). */
export async function searchProducts(query: string): Promise<PriceChartingProduct[]> {
  const data = await pcFetch<PriceChartingSearchResult>("/products", { q: query });
  return data.products ?? [];
}

/** Fetch a single product (with current prices) by its PriceCharting product id. */
export async function getProduct(priceChartingId: string): Promise<PriceChartingProduct> {
  return pcFetch<PriceChartingProduct>("/product", { id: priceChartingId });
}

/**
 * Every "*-price" field on a product is a price point in cents, keyed by condition —
 * e.g. "loose-price", "graded-price", "ungraded-price", "grade-9-price", "gem-mint-price".
 * Pull all of them out into a flat { priceType: cents } map, dropping the "-price" suffix.
 */
export function extractPriceFields(product: PriceChartingProduct): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const [key, value] of Object.entries(product)) {
    if (!key.endsWith("-price") || value === undefined) continue;
    const cents = Number(value);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    prices[key.slice(0, -"-price".length)] = cents;
  }
  return prices;
}
