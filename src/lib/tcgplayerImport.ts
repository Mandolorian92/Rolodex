/**
 * Import a collection export from the TCGPlayer app (Collection → ⋯ → Export). This is the
 * other half of the reconciliation problem PriceCharting's own CSV export can't solve alone:
 * PriceCharting's guide price and TCGPlayer's live Market Price disagree on the same card
 * often enough — sometimes by 10x on cheap commons, sometimes 20-30% on real chase cards —
 * that seeing only one number hides how unreliable either one is in isolation. See the
 * ticker-series design note in src/lib/tickerSeries.ts.
 *
 * Every row a TCGPlayer export is a real product TCGPlayer already prices, so import here
 * does two different things depending on whether the card is already in the catalog:
 *   - Already known (matched by name+number, or by a cached tcgplayerProductId from a prior
 *     import): just add a TCGPLAYER_MARKET PriceSnapshot. This is enrichment, not ownership —
 *     quantity/condition for an existing card stays owned by whatever import first created it
 *     (PriceCharting, ManaBox, manual), so re-running this never overwrites those.
 *   - Genuinely new: create the Card (identified by tcgplayerProductId, TCGPlayer's own
 *     catalog id — see the Card model) and a CollectionItem, since nothing else has told us
 *     about it yet.
 *
 * Matching against the existing catalog is necessarily heuristic: PriceCharting's card
 * numbers frequently don't line up 1:1 with TCGPlayer's officially numbered products (the
 * same root cause that broke the "Import text list" flow this whole project's manual
 * TCGPlayer-import effort ran into — see the conversation history), so this matches on
 * cleaned name + card number, exactly the logic hand-verified against a real 1200-card
 * PriceCharting export and a real 335-card TCGPlayer export before being formalized here.
 */
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { Condition, PriceSource, type Card } from "@/generated/prisma/client";
import { parseConditionString, CONDITION_TO_PRICE_TYPE } from "@/lib/grades";
import { detectLanguage } from "@/lib/cardMeta";

const PRODUCT_LINE_TO_CATEGORY: Record<string, string> = {
  pokemon: "pokemon-card",
  magic: "magic-card",
  "magic: the gathering": "magic-card",
  yugioh: "yugioh-card",
  "yu-gi-oh!": "yugioh-card",
  "yu-gi-oh": "yugioh-card",
};

export interface TcgplayerParsedRow {
  tcgplayerProductId: string;
  name: string;
  cardNumber: string | null; // leading zeros stripped, e.g. "88"
  setName: string; // raw "Set Name" column, e.g. "ME05: Pitch Black"
  category: string;
  quantity: number;
  priceCents: number | null;
  condition: Condition;
  imageUrl: string | null;
}

export interface TcgplayerParseResult {
  rows: TcgplayerParsedRow[];
  skipped: Array<{ row: number; reason: string }>;
}

/** Pure parsing — no DB access — so matching logic below is easy to test/inspect in isolation. */
export function parseTcgplayerCsv(csvText: string): TcgplayerParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const skipped: TcgplayerParseResult["skipped"] = [];
  const rows: TcgplayerParsedRow[] = [];

  parsed.data.forEach((raw, i) => {
    const tcgplayerProductId = raw["TCGplayer Id"]?.trim();
    const rawName = raw["Product Name"]?.trim();
    if (!tcgplayerProductId || !rawName) {
      skipped.push({ row: i + 2, reason: "Missing TCGplayer Id or Product Name column" }); // +2: 1-indexed, plus header row
      return;
    }

    // TCGPlayer appends the card number to Product Name in one of two forms depending on
    // the product's era — newer sets get " - NNN/NNN" (e.g. "Primarina - 088/084"), older
    // ones get " (N)" (e.g. "Ho-oh (7)"). The Number column is the reliable source for the
    // number either way, so both forms just get stripped off the display name here.
    const name = rawName
      .replace(/\s*-\s*\d+\/\d+\s*$/, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim();
    const numberRaw = raw["Number"]?.split("/")[0]?.trim();
    const cardNumber = numberRaw ? numberRaw.replace(/^0+/, "") || "0" : null;

    const setName = raw["Set Name"]?.trim() ?? "";
    const productLine = raw["Product Line"]?.trim().toLowerCase() ?? "";
    const category = PRODUCT_LINE_TO_CATEGORY[productLine] ?? "other-card";

    const quantityRaw = Number(raw["Add to Quantity"] || raw["Total Quantity"]);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.round(quantityRaw) : 1;

    const priceRaw = raw["TCG Market Price"]?.trim();
    const priceNum = priceRaw ? Number(priceRaw) : NaN;
    const priceCents = Number.isFinite(priceNum) ? Math.round(priceNum * 100) : null;

    const condition = parseConditionString(raw["Condition"]);

    rows.push({
      tcgplayerProductId,
      name,
      cardNumber,
      setName,
      category,
      quantity,
      priceCents,
      condition,
      imageUrl: raw["Photo URL"]?.trim() || null,
    });
  });

  return { rows, skipped };
}

/**
 * Existing Card.name values are stored verbatim from whichever source first created them —
 * for PriceCharting-sourced cards that's "Manectric #24" or "Steelix [Holo] #139" (the raw
 * product-name, card number and variant tag included). Pull those back apart so they can be
 * compared against a TCGPlayer row's already-clean name + number.
 */
function cleanCardName(raw: string): { base: string; number: string | null } {
  const m = raw.match(/^(.*?)\s*#(\S+)$/);
  const withoutNumber = m ? m[1] : raw;
  const number = m ? m[2].replace(/^0+/, "") || "0" : null;
  const base = withoutNumber
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { base, number };
}

async function findMatchingCard(row: TcgplayerParsedRow): Promise<Card | null> {
  const byTcgplayerId = await prisma.card.findUnique({ where: { tcgplayerProductId: row.tcgplayerProductId } });
  if (byTcgplayerId) return byTcgplayerId;

  if (!row.cardNumber) return null;

  // Broad search narrowed/verified in JS, since the real card name is embedded inside
  // Card.name rather than stored as a separate number column.
  const candidates = await prisma.card.findMany({
    where: { category: row.category, name: { contains: row.name, mode: "insensitive" } },
  });

  const exact = candidates.filter((c) => {
    const { base, number } = cleanCardName(c.name);
    return base.toLowerCase() === row.name.toLowerCase() && number === row.cardNumber;
  });

  if (exact.length === 0) return null;
  if (exact.length === 1) return exact[0];

  // Same name+number exists in more than one set (rare, but real) — disambiguate by set
  // name, the same loose substring check that resolved this by hand for the first round of
  // ambiguous TCGPlayer-import failures.
  const setToken = row.setName.split(":").pop()?.trim().toLowerCase() ?? row.setName.toLowerCase();
  const bySet = setToken ? exact.find((c) => c.consoleName?.toLowerCase().includes(setToken)) : undefined;
  return bySet ?? exact[0];
}

export interface TcgplayerImportSummary {
  rowsFound: number;
  /** Row matched an existing card — only its TCGPLAYER_MARKET price was added. */
  matchedExisting: number;
  /** No match found — a new Card + CollectionItem was created from this row. */
  newCards: number;
  priceSnapshotsCreated: number;
  skipped: Array<{ row: number; reason: string }>;
}

export async function importTcgplayerCsv(csvText: string, userId: string): Promise<TcgplayerImportSummary> {
  const { rows, skipped } = parseTcgplayerCsv(csvText);

  const summary: TcgplayerImportSummary = {
    rowsFound: rows.length,
    matchedExisting: 0,
    newCards: 0,
    priceSnapshotsCreated: 0,
    skipped,
  };

  for (const row of rows) {
    let card = await findMatchingCard(row);
    const isNew = !card;

    if (card) {
      if (!card.tcgplayerProductId) {
        card = await prisma.card.update({
          where: { id: card.id },
          data: { tcgplayerProductId: row.tcgplayerProductId },
        });
      }
      summary.matchedExisting += 1;
    } else {
      const name = row.cardNumber ? `${row.name} #${row.cardNumber}` : row.name;
      card = await prisma.card.create({
        data: {
          tcgplayerProductId: row.tcgplayerProductId,
          name,
          consoleName: row.setName || null,
          category: row.category,
          language: detectLanguage(name, row.setName),
          imageUrl: row.imageUrl,
        },
      });
      summary.newCards += 1;
    }

    if (row.priceCents !== null && row.priceCents > 0) {
      const priceType = CONDITION_TO_PRICE_TYPE[row.condition];
      const latest = await prisma.priceSnapshot.findFirst({
        where: { cardId: card.id, source: PriceSource.TCGPLAYER_MARKET, priceType },
        orderBy: { capturedAt: "desc" },
      });
      // Skip writing a new snapshot if the price hasn't moved — otherwise every re-import
      // stamps a fresh, identical row for every unchanged card.
      if (!latest || latest.price !== row.priceCents) {
        await prisma.priceSnapshot.create({
          data: { cardId: card.id, source: PriceSource.TCGPLAYER_MARKET, priceType, price: row.priceCents },
        });
        summary.priceSnapshotsCreated += 1;
      }
    }

    // Ownership (quantity/condition) is only written for genuinely new cards — an existing
    // card's CollectionItem stays owned by whichever import first created it, so re-running
    // this never stomps quantity someone already corrected on PriceCharting or in-app.
    if (isNew) {
      const existingItem = await prisma.collectionItem.findFirst({
        where: { userId, cardId: card.id, condition: row.condition },
      });
      if (!existingItem) {
        await prisma.collectionItem.create({
          data: { userId, cardId: card.id, quantity: row.quantity, condition: row.condition },
        });
      } else if (existingItem.quantity !== row.quantity) {
        await prisma.collectionItem.update({ where: { id: existingItem.id }, data: { quantity: row.quantity } });
      }
    }
  }

  return summary;
}
