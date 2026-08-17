import { fetchHtml } from "./http";
import { parseProductJsonLd } from "./jsonld";
import type { StockCheckResult } from "./types";

const OUT_OF_STOCK_PATTERNS = [/out of stock/i, /sold out/i, /not available/i];
const IN_STOCK_PATTERNS = [/add to cart/i, /pick it up/i];

export async function checkTargetProduct(url: string): Promise<StockCheckResult> {
  const html = await fetchHtml(url);
  const jsonLd = parseProductJsonLd(html);
  if (jsonLd?.inStock !== undefined) {
    return { inStock: jsonLd.inStock, title: jsonLd.title, priceCents: jsonLd.priceCents };
  }

  // Target also runs bot protection — same caveat as Walmart applies here.
  if (OUT_OF_STOCK_PATTERNS.some((p) => p.test(html))) return { inStock: false, title: jsonLd?.title };
  if (IN_STOCK_PATTERNS.some((p) => p.test(html))) return { inStock: true, title: jsonLd?.title };

  throw new Error(
    "Could not determine stock status from Target's page — either the markup changed, or the request got blocked by bot protection."
  );
}
