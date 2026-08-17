/**
 * Most storefronts embed schema.org Product/Offer structured data (JSON-LD) in every
 * product page for Google Shopping / rich results — it's meant to be machine-read, so it's
 * a far more stable signal than scraping page text or CSS classes that change on every
 * redesign. This is the primary stock-detection path; retailer-specific checkers fall back
 * to text patterns only when a page doesn't have it.
 */

interface ParsedProduct {
  title?: string;
  inStock?: boolean;
  priceCents?: number;
}

const IN_STOCK_TOKENS = ["instock", "limitedavailability", "onlineonly", "presale"];
const OUT_OF_STOCK_TOKENS = ["outofstock", "soldout", "discontinued"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function typesOf(node: Record<string, unknown>): string[] {
  const type = node["@type"];
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === "string");
  return [];
}

function findProductNode(node: unknown): Record<string, unknown> | null {
  if (!isRecord(node)) return null;
  if (typesOf(node).includes("Product")) return node;
  const graph = node["@graph"];
  if (Array.isArray(graph)) {
    for (const child of graph) {
      const found = findProductNode(child);
      if (found) return found;
    }
  }
  return null;
}

function extractFromProduct(product: Record<string, unknown>): ParsedProduct {
  const offersRaw = product.offers;
  const offers = Array.isArray(offersRaw) ? offersRaw : offersRaw != null ? [offersRaw] : [];

  let inStock: boolean | undefined;
  let priceCents: number | undefined;

  for (const offer of offers) {
    if (!isRecord(offer)) continue;
    const availability = String(offer.availability ?? "").toLowerCase();
    if (IN_STOCK_TOKENS.some((t) => availability.includes(t))) inStock = true;
    else if (OUT_OF_STOCK_TOKENS.some((t) => availability.includes(t)) && inStock === undefined) inStock = false;

    if (offer.price != null) {
      const num = Number(offer.price);
      if (!Number.isNaN(num)) priceCents = Math.round(num * 100);
    }
  }

  return {
    title: typeof product.name === "string" ? product.name : undefined,
    inStock,
    priceCents,
  };
}

/** Scan an HTML document for a schema.org Product node and pull stock/price/title out of it. */
export function parseProductJsonLd(html: string): ParsedProduct | null {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }

    const candidates = Array.isArray(data) ? data : [data];
    for (const candidate of candidates) {
      const product = findProductNode(candidate);
      if (product) return extractFromProduct(product);
    }
  }

  return null;
}
