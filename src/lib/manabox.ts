/**
 * Import a collection exported from ManaBox (a mobile scanning/cataloging app) as CSV.
 * ManaBox has no public API, so a file export is the only integration surface available.
 *
 * IMPORTANT — the column names below are built from the commonly-documented/community-known
 * ManaBox export format, not verified against a real exported file (this sandbox has no way
 * to produce one). If a real export uses different header text, `FIELD_ALIASES` is the only
 * place that needs updating — everything downstream works off the normalized field names.
 * Treat the first real import as the live test, the same way PriceCharting's collection
 * import needed a few rounds of fixes against real account data early in this project.
 *
 * Cards brought in this way have no real PriceCharting product id, so they rely on TCGPlayer
 * (src/lib/tcgplayerSync.ts) for pricing instead. For identity, a Magic card gets its real
 * Scryfall id when the export includes one (stored on Card.scryfallId — a genuine external
 * reference, not a synthesized key); anything else falls back to Card.manaboxId, built from
 * ManaBox's own row id when present or a name+set+foil fingerprint when it isn't.
 */
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { Condition } from "@/generated/prisma/client";
import { parseConditionString } from "@/lib/grades";
import { detectLanguage } from "@/lib/cardMeta";

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "card name"],
  setName: ["set name", "edition", "set"],
  setCode: ["set code", "edition code"],
  foil: ["foil", "printing"],
  quantity: ["quantity", "qty", "count"],
  manaboxId: ["manabox id", "manaboxid"],
  scryfallId: ["scryfall id", "scryfallid"],
  purchasePrice: ["purchase price"],
  condition: ["condition"],
  language: ["language", "lang"],
  game: ["game", "tcg"],
};

function buildHeaderMap(fields: string[]): Record<string, string> {
  const normalized = fields.map((f) => [f, f.trim().toLowerCase()] as const);
  const map: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const match = normalized.find(([, norm]) => aliases.includes(norm));
    if (match) map[field] = match[0];
  }
  return map;
}

const GAME_TO_CATEGORY: Record<string, string> = {
  magic: "magic-card",
  "magic: the gathering": "magic-card",
  mtg: "magic-card",
  pokemon: "pokemon-card",
  "pokémon": "pokemon-card",
  "yu-gi-oh!": "yugioh-card",
  yugioh: "yugioh-card",
  "yu-gi-oh": "yugioh-card",
};

export interface ManaboxParsedRow {
  scryfallId: string | null;
  manaboxId: string | null;
  name: string;
  consoleName: string | null;
  category: string;
  language: string | null;
  quantity: number;
  condition: Condition;
  purchasePriceCents: number | null;
}

export interface ManaboxParseResult {
  rows: ManaboxParsedRow[];
  skipped: Array<{ row: number; reason: string }>;
}

/** Pure parsing — no DB access — so it's easy to test/inspect independent of the import. */
export function parseManaboxCsv(csvText: string): ManaboxParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields ?? [];
  const headerMap = buildHeaderMap(fields);
  const skipped: ManaboxParseResult["skipped"] = [];

  if (!headerMap.name) {
    return { rows: [], skipped: [{ row: 0, reason: "Couldn't find a card name column in this CSV." }] };
  }

  const rows: ManaboxParsedRow[] = [];
  parsed.data.forEach((raw, i) => {
    const get = (field: string): string | undefined => {
      const header = headerMap[field];
      return header ? raw[header]?.trim() : undefined;
    };

    const name = get("name");
    if (!name) {
      skipped.push({ row: i + 2, reason: "Missing card name" }); // +2: 1-indexed, plus header row
      return;
    }

    const setName = get("setName") ?? null;
    const setCode = get("setCode") ?? null;
    const isFoil = /^(true|yes|1|foil)$/i.test(get("foil") ?? "");
    const displayName = isFoil ? `${name} (Foil)` : name;

    const scryfallId = get("scryfallId") || null;
    // Real ManaBox row id when present; otherwise a fingerprint from the row's own fields —
    // either way this is what re-imports dedupe on when there's no Scryfall id to key off.
    const manaboxId = scryfallId ? null : get("manaboxId") || `${name}|${setCode ?? setName ?? ""}|${isFoil}`;

    const quantityRaw = Number(get("quantity"));
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.round(quantityRaw) : 1;

    const conditionRaw = get("condition");
    const condition: Condition = conditionRaw
      ? parseConditionString(conditionRaw.replace(/_/g, " "))
      : Condition.NEAR_MINT;

    const gameRaw = get("game")?.toLowerCase();
    const category = (gameRaw && GAME_TO_CATEGORY[gameRaw]) || "magic-card"; // ManaBox's origin/primary use case

    const language = get("language") || detectLanguage(name, setName);

    const purchasePriceRaw = get("purchasePrice");
    const purchasePriceNum = purchasePriceRaw ? Number(purchasePriceRaw.replace(/[^0-9.-]/g, "")) : NaN;
    const purchasePriceCents = Number.isFinite(purchasePriceNum) ? Math.round(purchasePriceNum * 100) : null;

    rows.push({
      scryfallId,
      manaboxId,
      name: displayName,
      consoleName: setName,
      category,
      language,
      quantity,
      condition,
      purchasePriceCents,
    });
  });

  return { rows, skipped };
}

export interface ManaboxImportSummary {
  rowsFound: number;
  newCards: number;
  updatedCards: number;
  unchangedCards: number;
  skipped: Array<{ row: number; reason: string }>;
}

/**
 * Import a ManaBox CSV export, delta-aware like the PriceCharting importer — re-running an
 * import with the same file (or a re-export after only a few cards changed) only writes
 * what's actually different.
 */
export async function importManaboxCsv(csvText: string, userId: string): Promise<ManaboxImportSummary> {
  const { rows, skipped } = parseManaboxCsv(csvText);

  const summary: ManaboxImportSummary = {
    rowsFound: rows.length,
    newCards: 0,
    updatedCards: 0,
    unchangedCards: 0,
    skipped,
  };

  for (const row of rows) {
    const existingCard = row.scryfallId
      ? await prisma.card.findUnique({ where: { scryfallId: row.scryfallId } })
      : await prisma.card.findUnique({ where: { manaboxId: row.manaboxId! } });

    let card = existingCard;
    let cardChanged = false;
    if (!card) {
      card = await prisma.card.create({
        data: {
          scryfallId: row.scryfallId,
          manaboxId: row.manaboxId,
          name: row.name,
          consoleName: row.consoleName,
          category: row.category,
          language: row.language,
        },
      });
    } else if (card.name !== row.name || card.consoleName !== row.consoleName) {
      card = await prisma.card.update({
        where: { id: card.id },
        data: { name: row.name, consoleName: row.consoleName },
      });
      cardChanged = true;
    }

    const existingItem = await prisma.collectionItem.findFirst({
      where: { userId, cardId: card.id, condition: row.condition },
    });

    let itemChanged = false;
    if (!existingItem) {
      await prisma.collectionItem.create({
        data: {
          userId,
          cardId: card.id,
          quantity: row.quantity,
          condition: row.condition,
          purchasePrice: row.purchasePriceCents,
        },
      });
      itemChanged = true;
    } else if (existingItem.quantity !== row.quantity) {
      await prisma.collectionItem.update({ where: { id: existingItem.id }, data: { quantity: row.quantity } });
      itemChanged = true;
    }

    if (!existingCard) summary.newCards += 1;
    else if (cardChanged || itemChanged) summary.updatedCards += 1;
    else summary.unchangedCards += 1;
  }

  return summary;
}
