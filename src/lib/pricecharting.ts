/**
 * Client for PriceCharting's API (https://www.pricecharting.com/api-documentation).
 *
 * Two APIs live under the same base URL/token:
 *  - Prices API (`/api/product`, `/api/products`) — current market prices for a product,
 *    across whatever condition/grade fields apply to its category. No historical data;
 *    we build our own time series by snapshotting these on a schedule (see `sync.ts`).
 *  - Marketplace API (`/api/offers`, ...) — `status=collection` returns everything in a
 *    PriceCharting user's collection (used to import a collection in one call), and
 *    `status=sold` returns actual sold transactions for a product (used to get real recent
 *    sale prices, not just the aggregate guide price).
 *
 * Hard limit: 1 request/second, enforced with `throttlePriceCharting` — PriceCharting
 * will revoke API access for accounts that exceed it.
 */
import { throttlePriceCharting } from "@/lib/rateLimit";

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

/**
 * Card price-type field -> human label. PriceCharting reuses its video-game column names
 * for card grades (see the "Condition Table" in their docs), so the raw keys are
 * unintuitive out of context:
 *   loose = ungraded, cib = grade 7, new = grade 8, graded = grade 9, box-only = grade 9.5,
 *   manual-only = PSA 10, bgs-10 = BGS 10, condition-17 = CGC 10, condition-18 = SGC 10.
 */
export const CARD_PRICE_TYPE_LABELS: Record<string, string> = {
  loose: "Ungraded",
  cib: "Grade 7",
  new: "Grade 8",
  graded: "Grade 9",
  "box-only": "Grade 9.5",
  "manual-only": "PSA 10",
  "bgs-10": "BGS 10",
  "condition-17": "CGC 10",
  "condition-18": "SGC 10",
};

// Raw shape of a product as returned by PriceCharting. Price fields vary by category
// (video games use loose/cib/new; cards use the grade mapping above), so every price
// field is optional and we discover whichever ones are present at runtime.
export interface PriceChartingProduct {
  id: string;
  "product-name": string;
  "console-name"?: string;
  genre?: string;
  [priceField: string]: string | undefined;
}

export interface PriceChartingSearchResult {
  status: string;
  products: PriceChartingProduct[];
}

export interface PriceChartingOffer {
  id: string;
  "product-name": string;
  "console-name"?: string;
  "condition-string"?: string;
  "include-string"?: string;
  "offer-id": string;
  "offer-status": string;
  "offer-url"?: string;
  price?: number; // cents — current price, or sale price if the offer has sold
  value?: number; // cents — current value; present for status=collection offers
  quantity?: number;
  "is-available"?: boolean;
  "is-sold"?: boolean;
  "is-ended"?: boolean;
  "sale-time"?: string; // YYYY-MM-DD, present when is-sold
  "ended-time"?: string; // YYYY-MM-DD
}

export interface PriceChartingOffersResult {
  status: string;
  offers: PriceChartingOffer[];
}

async function pcFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  return throttlePriceCharting(async () => {
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
  });
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
 * Marketplace API — list offers matching the given filters. We use this with
 * `status: "collection"` to pull everything in a user's PriceCharting collection.
 * `seller` is the PriceCharting user id, visible in the URL of a user's collection page
 * (pricecharting.com/offers?...&seller=THIS_PART&status=collection).
 */
export async function getOffers(params: {
  seller?: string;
  buyer?: string;
  status: "available" | "sold" | "ended" | "collection";
  id?: string;
  console?: string;
  "condition-id"?: string;
  genre?: string;
  sort?: "name" | "starts" | "lowest-price";
}): Promise<PriceChartingOffer[]> {
  const query: Record<string, string> = { status: params.status };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && key !== "status") query[key] = String(value);
  }
  const data = await pcFetch<PriceChartingOffersResult>("/offers", query);
  return data.offers ?? [];
}

/**
 * Recently sold transactions on PriceCharting's own marketplace for a specific product —
 * real individual sales, not the aggregate guide price. Works with any paid subscription's
 * API key, no separate signup (unlike eBay's Marketplace Insights API).
 */
export async function getSoldOffers(priceChartingId: string): Promise<PriceChartingOffer[]> {
  return getOffers({ id: priceChartingId, status: "sold" });
}

/**
 * Every "*-price" field on a product is a price point in cents, keyed by condition —
 * see CARD_PRICE_TYPE_LABELS for what each key means for trading cards specifically.
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
