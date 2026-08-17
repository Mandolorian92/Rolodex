import { Retailer } from "@/generated/prisma/client";
import { checkGameStopProduct } from "./gamestop";
import { checkWalmartProduct } from "./walmart";
import { checkTargetProduct } from "./target";
import { checkBestBuyProduct, searchBestBuyListings } from "./bestbuy";

export type { StockCheckResult, ListingResult } from "./types";
import type { ListingResult, StockCheckResult } from "./types";

export async function checkProductStock(
  retailer: Retailer,
  url: string,
  sku?: string | null
): Promise<StockCheckResult> {
  switch (retailer) {
    case Retailer.GAMESTOP:
      return checkGameStopProduct(url);
    case Retailer.WALMART:
      return checkWalmartProduct(url);
    case Retailer.TARGET:
      return checkTargetProduct(url);
    case Retailer.BESTBUY:
      if (!sku) {
        throw new Error(
          "Best Buy watch targets need a SKU — it's the number right before \".p\" in the product URL (e.g. .../site/.../6418599.p)."
        );
      }
      return checkBestBuyProduct(sku);
  }
}

export async function searchNewListings(retailer: Retailer, keyword: string): Promise<ListingResult[]> {
  if (retailer === Retailer.BESTBUY) return searchBestBuyListings(keyword);
  throw new Error(
    `Search-mode watching isn't supported yet for ${retailer} — add a specific product page URL instead.`
  );
}
