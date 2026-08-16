/**
 * Demo seed data so the app is browsable without live PriceCharting/eBay API keys.
 * Creates a few cards with synthetic price history (one trending up, one trending down,
 * one that recently peaked and pulled back) and runs the trend engine to generate alerts.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { Condition, PriceSource } from "../src/generated/prisma/client";
import { evaluateCardTrends } from "../src/lib/trends";

const DAY = 24 * 60 * 60 * 1000;

interface SeedCard {
  priceChartingId: string;
  name: string;
  consoleName: string;
  category: string;
  quantity: number;
  condition: Condition;
  purchasePrice: number; // cents
  /** Price (dollars) at each day offset from today, oldest first: [-30d, -14d, -7d, -3d, -1d, today]. */
  priceCurveUsd: number[];
}

const SEED_CARDS: SeedCard[] = [
  {
    priceChartingId: "demo-charizard-base-holo",
    name: "Charizard #4 Holo",
    consoleName: "Pokemon Base Set",
    category: "pokemon-card",
    quantity: 1,
    condition: Condition.GRADED_9,
    purchasePrice: 25000,
    priceCurveUsd: [280, 300, 320, 360, 395, 410],
  },
  {
    priceChartingId: "demo-blastoise-base-holo",
    name: "Blastoise #2 Holo",
    consoleName: "Pokemon Base Set",
    category: "pokemon-card",
    quantity: 2,
    condition: Condition.NEAR_MINT,
    purchasePrice: 9000,
    priceCurveUsd: [120, 118, 115, 108, 100, 92],
  },
  {
    priceChartingId: "demo-jordan-1986-fleer",
    name: "Michael Jordan Rookie #57",
    consoleName: "1986 Fleer Basketball",
    category: "sports-card",
    quantity: 1,
    condition: Condition.GRADED_8,
    purchasePrice: 400000,
    priceCurveUsd: [4200, 4600, 5400, 6100, 5700, 5500],
  },
  {
    priceChartingId: "demo-black-lotus-alpha",
    name: "Black Lotus",
    consoleName: "Magic: The Gathering Alpha",
    category: "magic-card",
    quantity: 1,
    condition: Condition.LIGHTLY_PLAYED,
    purchasePrice: 900000,
    priceCurveUsd: [9500, 9600, 9550, 9700, 9650, 9680],
  },
];

const OFFSETS_DAYS = [30, 14, 7, 3, 1, 0];

async function main() {
  for (const seed of SEED_CARDS) {
    const card = await prisma.card.upsert({
      where: { priceChartingId: seed.priceChartingId },
      create: {
        priceChartingId: seed.priceChartingId,
        name: seed.name,
        consoleName: seed.consoleName,
        category: seed.category,
      },
      update: {},
    });

    await prisma.collectionItem.upsert({
      where: { cardId_condition: { cardId: card.id, condition: seed.condition } },
      create: {
        cardId: card.id,
        quantity: seed.quantity,
        condition: seed.condition,
        purchasePrice: seed.purchasePrice,
        purchasedAt: new Date(Date.now() - 60 * DAY),
      },
      update: {},
    });

    const priceType = seed.condition === Condition.GRADED_9 || seed.condition === Condition.GRADED_8 ? "graded" : "ungraded";

    for (let i = 0; i < OFFSETS_DAYS.length; i++) {
      const daysAgo = OFFSETS_DAYS[i];
      const priceUsd = seed.priceCurveUsd[i];
      await prisma.priceSnapshot.create({
        data: {
          cardId: card.id,
          source: PriceSource.MANUAL,
          priceType,
          price: Math.round(priceUsd * 100),
          capturedAt: new Date(Date.now() - daysAgo * DAY),
        },
      });
    }

    const alerts = await evaluateCardTrends(card.id);
    console.log(`Seeded ${seed.name} (${alerts.length} alert(s) generated)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
