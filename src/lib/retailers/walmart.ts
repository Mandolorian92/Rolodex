import { fetchHtml } from "./http";
import { parseProductJsonLd } from "./jsonld";
import type { StockCheckResult } from "./types";

const OUT_OF_STOCK_PATTERNS = [/out of stock/i, /currently unavailable/i, /sold out/i];
const IN_STOCK_PATTERNS = [/add to cart/i];

export async function checkWalmartProduct(url: string): Promise<StockCheckResult> {
  const html = await fetchHtml(url);
  const jsonLd = parseProductJsonLd(html);
  if (jsonLd?.inStock !== undefined) {
    return { inStock: jsonLd.inStock, title: jsonLd.title, priceCents: jsonLd.priceCents };
  }

  // Walmart runs aggressive bot protection (PerimeterX) — a blocked/challenge response
  // usually shows up as a very short HTML body with no JSON-LD and no matching text below,
  // which surfaces as this same error.
  if (OUT_OF_STOCK_PATTERNS.some((p) => p.test(html))) return { inStock: false, title: jsonLd?.title };
  if (IN_STOCK_PATTERNS.some((p) => p.test(html))) return { inStock: true, title: jsonLd?.title };

  throw new Error(
    "Could not determine stock status from Walmart's page — either the markup changed, or the request got blocked by bot protection."
  );
}
