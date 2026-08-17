export interface StockCheckResult {
  inStock: boolean;
  title?: string;
  priceCents?: number;
}

export interface ListingResult {
  /** SKU or product URL — whatever uniquely identifies this listing for dedupe. */
  externalId: string;
  title: string;
  url: string;
  priceCents?: number;
}
