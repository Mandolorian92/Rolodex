import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Condition } from "@/generated/prisma/client";
import { syncCard } from "@/lib/sync";
import { checkForHigherValueVariants } from "@/lib/variants";

export async function GET() {
  const items = await prisma.collectionItem.findMany({
    include: {
      card: {
        include: {
          priceSnapshots: { orderBy: { capturedAt: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

const AddToCollectionSchema = z.object({
  priceChartingId: z.string().min(1),
  name: z.string().min(1),
  consoleName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  quantity: z.number().int().positive().default(1),
  condition: z.nativeEnum(Condition).default(Condition.NEAR_MINT),
  purchasePrice: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = AddToCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { priceChartingId, name, consoleName, category, imageUrl, quantity, condition, purchasePrice, notes } =
    parsed.data;

  const card = await prisma.card.upsert({
    where: { priceChartingId },
    create: { priceChartingId, name, consoleName, category, imageUrl },
    update: { name, consoleName, category, imageUrl },
  });

  const item = await prisma.collectionItem.upsert({
    where: { cardId_condition: { cardId: card.id, condition } },
    create: { cardId: card.id, quantity, condition, purchasePrice, notes },
    update: { quantity: { increment: quantity } },
    include: { card: true },
  });

  // Best-effort initial price pull so the card shows real data immediately, without
  // blocking the add flow if PriceCharting/eBay aren't configured or are unreachable.
  try {
    await syncCard(card.id);
  } catch (err) {
    console.warn(`[collection] initial sync failed for card ${card.id}:`, err);
  }

  try {
    await checkForHigherValueVariants(card);
  } catch (err) {
    console.warn(`[collection] variant check failed for card ${card.id}:`, err);
  }

  return NextResponse.json({ item }, { status: 201 });
}
