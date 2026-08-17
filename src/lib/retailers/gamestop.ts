import { fetchHtml } from "./http";
import { parseProductJsonLd } from "./jsonld";
import type { StockCheckResult } from "./types";

const OUT_OF_STOCK_PATTERNS = [/sold out/i, /out of stock/i, /notify me when available/i];
const IN_STOCK_PATTERNS = [/add to cart/i];

export async function checkGameStopProduct(url: string): Promise<StockCheckResult> {
  const html = await fetchHtml(url);
  const jsonLd = parseProductJsonLd(html);
  if (jsonLd?.inStock !== undefined) {
    return { inStock: jsonLd.inStock, title: jsonLd.title, priceCents: jsonLd.priceCents };
  }

  // No structured data found — fall back to page text. GameStop redesigns their storefront
  // periodically, so these patterns may need updating; if this starts throwing, check the
  // page source for the current sold-out/add-to-cart wording.
  if (OUT_OF_STOCK_PATTERNS.some((p) => p.test(html))) return { inStock: false, title: jsonLd?.title };
  if (IN_STOCK_PATTERNS.some((p) => p.test(html))) return { inStock: true, title: jsonLd?.title };

  throw new Error(
    "Could not determine stock status from GameStop's page — either the markup changed, or the request got blocked by bot protection."
  );
}
