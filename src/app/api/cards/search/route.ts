import { NextRequest, NextResponse } from "next/server";
import { searchProducts, extractPriceFields } from "@/lib/pricecharting";

// Search the PriceCharting catalog so the user can find a card to add to their collection.
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing ?q= search query" }, { status: 400 });
  }

  try {
    const products = await searchProducts(query);
    return NextResponse.json({
      results: products.map((p) => ({
        priceChartingId: p.id,
        name: p["product-name"],
        consoleName: p["console-name"] ?? null,
        prices: extractPriceFields(p),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 502 }
    );
  }
}
