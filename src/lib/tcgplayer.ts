/**
 * Client for TCGPlayer's API (https://docs.tcgplayer.com/) — a second, independent
 * real-market price signal alongside PriceCharting's guide price: TCGPlayer's "Market
 * Price" is itself computed from recent actual sales, not a static list price, which is
 * exactly the kind of data this whole project set out to track (see PriceSource).
 *
 * IMPORTANT — unlike PriceCharting, this integration has never been exercised against the
 * real API: this sandbox's network egress can't reach api.tcgplayer.com at all (same
 * restriction that blocked live testing of the retailer stock-watch scrapers), so nothing
 * here — endpoint paths, query parameter names, the category id mapping — has been
 * confirmed against a live response. It's built from documented/commonly-referenced
 * TCGPlayer API conventions and should be treated as a first draft that needs the same kind
 * of live debugging PriceCharting's collection import needed early in this project (the
 * cursor-pagination bug, the id type mismatch) — expect to iterate once real credentials
 * are in place. Compare against https://docs.tcgplayer.com/reference if something 404s or
 * comes back empty.
 *
 * Only relevant for categories TCGPlayer actually carries — Magic, Pokemon, Yu-Gi-Oh. It
 * has no sports-card marketplace, so cards in that category are skipped entirely (see
 * TCGPLAYER_CATEGORY_ID).
 */
import { throttleTcgplayer } from "@/lib/rateLimit";

const BASE_URL = "https://api.tcgplayer.com";

export class TcgplayerError extends Error {}

/**
 * TCGPlayer category ids, keyed by the same `category` string Card.category already stores
 * (see src/lib/cardMeta.ts) — these three values are commonly cited in TCGPlayer API
 * community references but NOT verified live from this sandbox. If pricing comes back empty
 * for a category that should have data, confirm the real id via `GET /catalog/categories`
 * (requires an access token) and correct this map.
 */
export const TCGPLAYER_CATEGORY_ID: Record<string, number> = {
  "magic-card": 1,
  "yugioh-card": 2,
  "pokemon-card": 3,
};

export function isTcgplayerConfigured(): boolean {
  return Boolean(process.env.TCGPLAYER_CLIENT_ID && process.env.TCGPLAYER_CLIENT_SECRET);
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

/**
 * OAuth2 client-credentials token — TCGPlayer's own docs describe tokens as valid roughly
 * two weeks; cached in-memory per server process and refreshed a few minutes early to avoid
 * a request racing right past expiry.
 */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.TCGPLAYER_CLIENT_ID;
  const clientSecret = process.env.TCGPLAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new TcgplayerError("TCGPLAYER_CLIENT_ID/TCGPLAYER_CLIENT_SECRET are not set.");
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new TcgplayerError(`TCGPlayer token request failed ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number; [k: string]: unknown };
  if (!data.access_token) {
    throw new TcgplayerError(`TCGPlayer token response missing access_token: ${JSON.stringify(data)}`);
  }

  // expires_in isn't always present in every documented response shape; fall back to a
  // conservative 24h if missing rather than assuming the ~14-day figure some docs cite.
  const ttlMs = (data.expires_in ?? 24 * 60 * 60) * 1000;
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + ttlMs };
  return cachedToken.accessToken;
}

async function tcgplayerFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken();
  return throttleTcgplayer(async () => {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new TcgplayerError(`TCGPlayer API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  });
}

interface TcgplayerCatalogProduct {
  productId: number;
  name: string;
  cleanName?: string;
}

interface TcgplayerCatalogSearchResult {
  success: boolean;
  results: TcgplayerCatalogProduct[];
}

/** Search TCGPlayer's catalog for a product by name within one game category. */
export async function searchTcgplayerProducts(
  name: string,
  categoryId: number
): Promise<TcgplayerCatalogProduct[]> {
  const data = await tcgplayerFetch<TcgplayerCatalogSearchResult>("/catalog/products", {
    categoryId: String(categoryId),
    productName: name,
    limit: "10",
  });
  return data.results ?? [];
}

interface TcgplayerPricingRow {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string; // "Normal", "Foil", "1st Edition", etc.
}

interface TcgplayerPricingResult {
  success: boolean;
  results: TcgplayerPricingRow[];
}

/**
 * Aggregate market price for a product, in cents. Prefers the "Normal" (non-foil) row when
 * a product has more than one printing variant, since that's the closest analog to
 * PriceCharting's ungraded/"loose" tier — falls back to whatever row comes first otherwise.
 */
export async function getTcgplayerMarketPriceCents(productId: number): Promise<number | null> {
  const data = await tcgplayerFetch<TcgplayerPricingResult>(`/pricing/product/${productId}`);
  const rows = data.results ?? [];
  if (rows.length === 0) return null;

  const row = rows.find((r) => r.subTypeName === "Normal") ?? rows[0];
  if (row.marketPrice == null || row.marketPrice <= 0) return null;
  return Math.round(row.marketPrice * 100);
}
