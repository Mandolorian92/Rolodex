/**
 * Demo seed data so the app is browsable without live PriceCharting/eBay API keys.
 * Creates a few cards with synthetic guide-price history (one trending up, one trending
 * down, one that recently peaked and pulled back) and runs the trend engine to generate
 * alerts. Two cards also get a synthetic recent sale — modeling the real-world case where
 * an actual sale beats what PriceCharting's guide price says the card is worth.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { AlertType, Condition, PriceSource } from "../src/generated/prisma/client";
import { evaluateCardTrends } from "../src/lib/trends";
import { CONDITION_TO_PRICE_TYPE, parseConditionString } from "../src/lib/grades";
import { formatCents, formatPct } from "../src/lib/format";

const DAY = 24 * 60 * 60 * 1000;

interface SeedSale {
  source: typeof PriceSource.PRICECHARTING_SALE | typeof PriceSource.EBAY_SALE;
  title: string;
  priceUsd: number;
  conditionText: string;
  daysAgo: number;
}

interface SeedVariantMismatch {
  /** Another same-card print PriceCharting sells for more than what's on file. */
  siblingName: string;
  siblingPriceUsd: number;
}

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
  /** An actual recent sale, demonstrating real sales beating/lagging the guide price. */
  recentSale?: SeedSale;
  /** A pricier same-card different-print sibling, demonstrating the variant-mismatch flag. */
  variantMismatch?: SeedVariantMismatch;
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
    recentSale: {
      source: PriceSource.PRICECHARTING_SALE,
      title: "Charizard #4 Holo PSA 9 - Base Set",
      priceUsd: 460,
      conditionText: "PSA 9",
      daysAgo: 0,
    },
  },
  {
    priceChartingId: "demo-vaporeon-22-holo",
    name: "Vaporeon #22 Holo",
    consoleName: "Pokemon Shining Fates",
    category: "pokemon-card",
    quantity: 1,
    condition: Condition.NEAR_MINT,
    purchasePrice: 800,
    priceCurveUsd: [9.5, 9.8, 10.2, 10.5, 10.8, 11],
    // Mirrors the real scenario: the same card number exists as a pricier print variant,
    // worth a double-check in case the wrong one was scanned in.
    variantMismatch: {
      siblingName: "Vaporeon #22 Cosmos Holo",
      siblingPriceUsd: 34.99,
    },
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
    // Mirrors a real scenario: the guide price lags what the card actually just sold for.
    recentSale: {
      source: PriceSource.EBAY_SALE,
      title: "Black Lotus Alpha - Lightly Played - MTG",
      priceUsd: 10900,
      conditionText: "Lightly Played",
      daysAgo: 0,
    },
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

    const priceType = CONDITION_TO_PRICE_TYPE[seed.condition];

    for (let i = 0; i < OFFSETS_DAYS.length; i++) {
      const daysAgo = OFFSETS_DAYS[i];
      const priceUsd = seed.priceCurveUsd[i];
      await prisma.priceSnapshot.create({
        data: {
          cardId: card.id,
          source: PriceSource.PRICECHARTING_GUIDE,
          priceType,
          price: Math.round(priceUsd * 100),
          capturedAt: new Date(Date.now() - daysAgo * DAY),
        },
      });
    }

    if (seed.recentSale) {
      const sale = seed.recentSale;
      const soldAt = new Date(Date.now() - sale.daysAgo * DAY);
      const itemUrl = `https://example.com/demo-sale/${seed.priceChartingId}`;

      await prisma.marketSale.upsert({
        where: { itemUrl },
        create: {
          cardId: card.id,
          source: sale.source,
          title: sale.title,
          price: Math.round(sale.priceUsd * 100),
          itemUrl,
          condition: sale.conditionText,
          soldAt,
        },
        update: {},
      });

      await prisma.priceSnapshot.create({
        data: {
          cardId: card.id,
          source: sale.source,
          priceType: CONDITION_TO_PRICE_TYPE[parseConditionString(sale.conditionText)],
          price: Math.round(sale.priceUsd * 100),
          capturedAt: soldAt,
        },
      });
    }

    if (seed.variantMismatch) {
      const vm = seed.variantMismatch;
      const { extractVariant } = await import("../src/lib/variants");
      const { variant } = extractVariant(seed.name);

      await prisma.card.update({
        where: { id: card.id },
        data: { variantLabel: variant, variantCheckedAt: new Date() },
      });

      const ownedSnapshot = await prisma.priceSnapshot.findFirst({
        where: { cardId: card.id, source: PriceSource.PRICECHARTING_GUIDE },
        orderBy: { capturedAt: "desc" },
      });

      if (ownedSnapshot) {
        const siblingPrice = Math.round(vm.siblingPriceUsd * 100);
        const deltaPct = (siblingPrice - ownedSnapshot.price) / ownedSnapshot.price;
        await prisma.alert.create({
          data: {
            cardId: card.id,
            type: AlertType.VARIANT_MISMATCH,
            priceType: ownedSnapshot.priceType,
            message: `Double check the variant — "${vm.siblingName}" (same card, different print) is worth ${formatCents(siblingPrice)}, ${formatPct(deltaPct)} more than what's on file. You may have scanned or labeled the wrong variant.`,
            changePct: deltaPct,
            fromPrice: ownedSnapshot.price,
            toPrice: siblingPrice,
            windowDays: 0,
          },
        });
      }
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
