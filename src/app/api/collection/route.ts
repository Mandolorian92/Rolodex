import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Condition } from "@/generated/prisma/client";
import { syncCard } from "@/lib/sync";
import { deriveCategory, detectLanguage } from "@/lib/cardMeta";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const items = await prisma.collectionItem.findMany({
    where: { userId },
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
  source: z.enum(["pricecharting", "scryfall", "pokemontcg"]).default("pricecharting"),
  // Kept as an accepted alias for priceChartingId so any existing caller (or muscle-memory
  // API usage) that only knows the old shape still works — externalId is preferred.
  externalId: z.string().min(1).optional(),
  priceChartingId: z.string().min(1).optional(),
  name: z.string().min(1),
  consoleName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  quantity: z.number().int().positive().default(1),
  condition: z.nativeEnum(Condition).default(Condition.NEAR_MINT),
  purchasePrice: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Scryfall results are unambiguously Magic and pokemontcg.io results are unambiguously
 * Pokémon — no heuristic needed, unlike PriceCharting's console-name-based guess (see
 * deriveCategory in cardMeta.ts) which the "pricecharting" branch below still falls back to.
 */
function findOrCreateCard(
  source: "pricecharting" | "scryfall" | "pokemontcg",
  externalId: string,
  data: { name: string; consoleName: string | null; category: string | null; language: string | null; imageUrl: string | null }
) {
  switch (source) {
    case "scryfall":
      return prisma.card.upsert({
        where: { scryfallId: externalId },
        create: { scryfallId: externalId, ...data, category: "magic-card" },
        update: { ...data, category: "magic-card" },
      });
    case "pokemontcg":
      return prisma.card.upsert({
        where: { pokemonTcgId: externalId },
        create: { pokemonTcgId: externalId, ...data, category: "pokemon-card" },
        update: { ...data, category: "pokemon-card" },
      });
    case "pricecharting":
    default:
      return prisma.card.upsert({
        where: { priceChartingId: externalId },
        create: { priceChartingId: externalId, ...data },
        update: data,
      });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const parsed = AddToCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { source, name, consoleName, category, imageUrl, quantity, condition, purchasePrice, notes } = parsed.data;
  const externalId = parsed.data.externalId ?? parsed.data.priceChartingId;
  if (!externalId) {
    return NextResponse.json({ error: "externalId (or priceChartingId) is required" }, { status: 400 });
  }
  // The add-card search UI doesn't collect category, so derive it (and language) the same
  // way import does — an explicit category from the caller still wins if one's given.
  const resolvedCategory = category ?? deriveCategory(consoleName);
  const language = detectLanguage(name, consoleName);

  const card = await findOrCreateCard(source, externalId, {
    name,
    consoleName: consoleName ?? null,
    category: resolvedCategory,
    language,
    imageUrl: imageUrl ?? null,
  });

  const existingItem = await prisma.collectionItem.findFirst({ where: { userId, cardId: card.id, condition } });
  const item = existingItem
    ? await prisma.collectionItem.update({
        where: { id: existingItem.id },
        data: { quantity: { increment: quantity } },
        include: { card: true },
      })
    : await prisma.collectionItem.create({
        data: { userId, cardId: card.id, quantity, condition, purchasePrice, notes },
        include: { card: true },
      });

  // Best-effort initial price pull (and, since this card is new, a variant-mismatch check —
  // see shouldRecheckVariant() in variants.ts) so the card shows real data immediately,
  // without blocking the add flow if PriceCharting/eBay aren't configured or are unreachable.
  try {
    await syncCard(card.id);
  } catch (err) {
    console.warn(`[collection] initial sync failed for card ${card.id}:`, err);
  }

  return NextResponse.json({ item }, { status: 201 });
}
