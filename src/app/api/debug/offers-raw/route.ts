import { NextResponse } from "next/server";
import { getOffersRaw } from "@/lib/pricecharting";

/**
 * Temporary diagnostic route: dumps the complete, untouched /api/offers response so we can
 * check for pagination metadata (cursor, next-page token, total count) that isn't
 * documented and that getOffers() would otherwise silently discard. Safe to delete once
 * pagination is sorted out — it doesn't expose the API token, just proxies the response.
 */
export async function GET() {
  const sellerId = process.env.PRICECHARTING_SELLER_ID;
  if (!sellerId) {
    return NextResponse.json({ error: "PRICECHARTING_SELLER_ID is not set in .env" }, { status: 400 });
  }

  try {
    const raw = await getOffersRaw({ seller: sellerId, status: "collection" });
    return NextResponse.json({
      offerCount: raw.offers?.length ?? 0,
      topLevelKeys: Object.keys(raw),
      fullResponse: raw,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
