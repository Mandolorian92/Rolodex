/**
 * Best Buy publishes an official, free Products API (https://developer.bestbuy.com/) that
 * includes real-time online availability — no scraping, no bot-protection cat-and-mouse.
 * This is by far the most reliable checker of the four; prefer Best Buy watch targets when
 * a product is carried there.
 */
import type { ListingResult, StockCheckResult } from "./types";

const BASE_URL = "https://api.bestbuy.com/v1";

interface BestBuyProduct {
  sku: number;
  name: string;
  url?: string;
  onlineAvailability?: boolean;
  salePrice?: number;
}

function apiKey(): string {
  const key = process.env.BESTBUY_API_KEY;
  if (!key) {
    throw new Error("BESTBUY_API_KEY is not set — get a free key at https://developer.bestbuy.com/");
  }
  return key;
}

async function bestBuyGet(path: string): Promise<{ products: BestBuyProduct[] }> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Best Buy API responded ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function checkBestBuyProduct(sku: string): Promise<StockCheckResult> {
  const query = `(sku=${encodeURIComponent(sku)})?apiKey=${apiKey()}&format=json&show=sku,name,onlineAvailability,salePrice`;
  const data = await bestBuyGet(`/products${query}`);
  const product = data.products?.[0];
  if (!product) throw new Error(`No Best Buy product found for SKU ${sku}.`);

  return {
    inStock: Boolean(product.onlineAvailability),
    title: product.name,
    priceCents: product.salePrice != null ? Math.round(product.salePrice * 100) : undefined,
  };
}

export async function searchBestBuyListings(keyword: string): Promise<ListingResult[]> {
  const query = `(search=${encodeURIComponent(keyword)})?apiKey=${apiKey()}&format=json&show=sku,name,url,salePrice&pageSize=50`;
  const data = await bestBuyGet(`/products${query}`);

  return (data.products ?? []).map((p) => ({
    externalId: String(p.sku),
    title: p.name,
    url: p.url ?? `https://www.bestbuy.com/site/${p.sku}.p`,
    priceCents: p.salePrice != null ? Math.round(p.salePrice * 100) : undefined,
  }));
}
