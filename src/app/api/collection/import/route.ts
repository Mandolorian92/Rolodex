import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importPriceChartingCollection } from "@/lib/import";

const ImportSchema = z.object({
  sellerId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const summary = await importPriceChartingCollection(parsed.data.sellerId);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 502 }
    );
  }
}
