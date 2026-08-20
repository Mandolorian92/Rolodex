import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCollectionExportCsv } from "@/lib/collectionExport";

// A plain GET (not a fetch-triggered download) so a simple <a href> link works — the
// Content-Disposition header is what makes the browser download it instead of navigating.
export async function GET() {
  const items = await prisma.collectionItem.findMany({
    include: { card: { include: { priceSnapshots: { orderBy: { capturedAt: "asc" } } } } },
    orderBy: { createdAt: "desc" },
  });

  const csv = buildCollectionExportCsv(items);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rolodex-collection-${date}.csv"`,
    },
  });
}
