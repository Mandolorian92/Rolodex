/**
 * Client for eBay's official APIs, used to supplement PriceCharting's aggregate prices
 * with concrete recent listings/comps.
 *
 * Two eBay APIs are relevant here, with very different access levels:
 *  - Browse API (`/buy/browse/v1`): general availability, only ACTIVE listings.
 *  - Marketplace Insights API (`/buy/marketplace_insights/v1_beta`): SOLD listings, but
 *    restricted — eBay grants it only to approved partners on request. Until that access
 *    is granted for this app's keys, `fetchSoldComps` degrades to an empty result instead
 *    of throwing, so the rest of the app keeps working off PriceCharting data alone.
 *
 * Auth: OAuth2 client-credentials ("application token"), scoped to public read-only data.
 */

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SOLD_SEARCH_URL = "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search";

export class EbayError extends Error {}

let cachedToken: { value: string; expiresAt: number } | null = null;

function credentialsConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

async function getAppToken(): Promise<string> {
  if (!credentialsConfigured()) {
    throw new EbayError(
      "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set. Copy .env.example to .env and configure them."
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const basicAuth = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new EbayError(`eBay OAuth error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

export interface EbayListing {
  itemId: string;
  title: string;
  price: number; // cents
  itemUrl: string;
  imageUrl?: string;
  condition?: string;
  soldAt?: string; // ISO date, only present for sold comps
}

/** Search currently-active eBay listings for a query (Browse API, generally available). */
export async function searchActiveListings(
  query: string,
  limit = 20
): Promise<EbayListing[]> {
  const token = await getAppToken();
  const url = new URL(BROWSE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new EbayError(`eBay Browse API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    itemSummaries?: Array<{
      itemId: string;
      title: string;
      price?: { value: string };
      itemWebUrl: string;
      image?: { imageUrl: string };
      condition?: string;
    }>;
  };

  return (data.itemSummaries ?? []).map((item) => ({
    itemId: item.itemId,
    title: item.title,
    price: Math.round(Number(item.price?.value ?? 0) * 100),
    itemUrl: item.itemWebUrl,
    imageUrl: item.image?.imageUrl,
    condition: item.condition,
  }));
}

/**
 * Fetch recently SOLD comps for a query via the Marketplace Insights API. This requires
 * eBay to have granted this app's keys access to that restricted API; if not, we log a
 * warning once and return an empty list rather than failing the whole sync.
 */
export async function fetchSoldComps(query: string, limit = 20): Promise<EbayListing[]> {
  const token = await getAppToken();
  const url = new URL(SOLD_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    cache: "no-store",
  });

  if (res.status === 403 || res.status === 404) {
    console.warn(
      "[ebay] Marketplace Insights API not accessible with current keys (sold comps skipped). " +
        "Request access at https://developer.ebay.com/api-docs/buy/marketplace-insights/overview.html"
    );
    return [];
  }
  if (!res.ok) {
    throw new EbayError(`eBay Marketplace Insights error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    itemSales?: Array<{
      itemId: string;
      title: string;
      lastSoldPrice?: { value: string };
      itemWebUrl: string;
      image?: { imageUrl: string };
      condition?: string;
      lastSoldDate?: string;
    }>;
  };

  return (data.itemSales ?? []).map((item) => ({
    itemId: item.itemId,
    title: item.title,
    price: Math.round(Number(item.lastSoldPrice?.value ?? 0) * 100),
    itemUrl: item.itemWebUrl,
    imageUrl: item.image?.imageUrl,
    condition: item.condition,
    soldAt: item.lastSoldDate,
  }));
}

export function isEbayConfigured(): boolean {
  return credentialsConfigured();
}
