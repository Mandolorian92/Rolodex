/**
 * Flags when a card might be the wrong print variant — the same card number exists in
 * several finishes (Holo, Reverse Holo, Cosmos Holo, 1st Edition, etc), and they can carry
 * real price deltas. If a same-card sibling in a different variant is priced meaningfully
 * more than what's on file, that's worth a manual double-check: either the card was
 * scanned/labeled as the wrong print, or it's a heads-up that a look-alike variant is more
 * valuable.
 *
 * This only compares guide prices (both sides), since we don't track sale history for
 * cards outside the collection — a simplification, not a claim that guide price is gospel.
 */
import { prisma } from "@/lib/prisma";
import { AlertType, PriceSource, type Alert, type Card } from "@/generated/prisma/client";
import { searchProducts, getProduct, extractPriceFields } from "@/lib/pricecharting";
import { formatCents, formatPct } from "@/lib/format";

/**
 * Known print-variant phrases, longest/most-specific first so e.g. "Cosmos Holo" is
 * matched before the bare "Holo" it contains. Necessarily incomplete across every TCG —
 * extend as new variant styles come up.
 */
const VARIANT_TOKENS = [
  "1st Edition Shadowless",
  "1st Edition",
  "Shadowless",
  "Unlimited",
  "Cosmos Holo",
  "Cosmo Holo",
  "Reverse Holo",
  "Poke Ball Holo",
  "Master Ball Holo",
  "Full Art",
  "Alternate Art",
  "Alt Art",
  "Secret Rare",
  "Rainbow Rare",
  "Gold Rare",
  "Textured",
  "Staff Prerelease",
  "Prerelease",
  "Promo",
  "Holo",
];

export interface VariantSplit {
  baseName: string;
  variant: string | null;
}

/**
 * Split a PriceCharting product name into its base card identity and detected print
 * variant(s). Strips every matching token (not just the first), so names combining
 * several qualifiers — e.g. "Charizard #4 1st Edition Shadowless Holo" — reduce to the
 * same base identity as any differently-worded sibling.
 */
export function extractVariant(productName: string): VariantSplit {
  let baseName = productName.trim().replace(/\s+/g, " ");
  const foundVariants: string[] = [];

  for (const token of VARIANT_TOKENS) {
    const re = new RegExp(`\\s*\\b${token.replace(/\s+/g, "\\s+")}\\b\\s*`, "i");
    if (re.test(baseName)) {
      baseName = baseName.replace(re, " ").trim().replace(/\s+/g, " ");
      foundVariants.push(token);
    }
  }

  return { baseName, variant: foundVariants.length > 0 ? foundVariants.join(", ") : null };
}

/** A sibling priced this much more (fractionally) than what's on file is worth flagging. */
const VARIANT_MISMATCH_THRESHOLD = 0.1;
/** Don't re-flag the same card more than once per this many days. */
const VARIANT_ALERT_COOLDOWN_DAYS = 14;
/** Cap how many candidate siblings we fetch full pricing for, to bound API calls. */
const MAX_SIBLINGS_PRICED = 5;
/**
 * How often to re-run this check per card during a passive/automatic sync. Each run costs
 * up to 1 + MAX_SIBLINGS_PRICED PriceCharting API calls, so this is not run on every sync —
 * see shouldRecheckVariant(). Manual checks (the "Check for higher-value variants" button)
 * bypass this and always run fresh.
 */
export const VARIANT_RECHECK_STALENESS_DAYS = 14;

export interface HigherValueVariant {
  productId: string;
  productName: string;
  price: number; // cents
  deltaPct: number;
}

export interface VariantCheckResult {
  higherValueVariants: HigherValueVariant[];
  /** The alert that was created, if any (null if nothing found or it's within cooldown). */
  alert: Alert | null;
}

/** Whether a card is due for a passive variant recheck during sync (never checked, or stale). */
export function shouldRecheckVariant(card: Card): boolean {
  if (!card.variantCheckedAt) return true;
  const staleCutoff = Date.now() - VARIANT_RECHECK_STALENESS_DAYS * 24 * 60 * 60 * 1000;
  return card.variantCheckedAt.getTime() < staleCutoff;
}

/**
 * Search for other PriceCharting products that are the same card (same base name + set)
 * but a different print variant, and flag any priced meaningfully higher than what's on
 * file for this card. Records Card.variantLabel/variantCheckedAt either way, and persists
 * an Alert (deduplicated on a cooldown) when it finds something worth a look. Always runs
 * fresh — callers doing passive/automatic checks should gate on shouldRecheckVariant() first
 * to control how often this (relatively expensive) check runs.
 */
export async function checkForHigherValueVariants(card: Card): Promise<VariantCheckResult> {
  const { baseName, variant } = extractVariant(card.name);

  await prisma.card.update({
    where: { id: card.id },
    data: { variantLabel: variant, variantCheckedAt: new Date() },
  });

  const ownedSnapshot = await prisma.priceSnapshot.findFirst({
    where: { cardId: card.id, source: PriceSource.PRICECHARTING_GUIDE },
    orderBy: { capturedAt: "desc" },
  });
  if (!ownedSnapshot) return { higherValueVariants: [], alert: null };

  const candidates = await searchProducts(`${baseName} ${card.consoleName ?? ""}`.trim());
  const siblings = candidates.filter((c) => {
    if (c.id === card.priceChartingId) return false;
    if (card.consoleName && c["console-name"] && c["console-name"] !== card.consoleName) return false;
    return extractVariant(c["product-name"]).baseName.toLowerCase() === baseName.toLowerCase();
  });

  const higherValueVariants: HigherValueVariant[] = [];
  for (const sibling of siblings.slice(0, MAX_SIBLINGS_PRICED)) {
    try {
      const product = await getProduct(sibling.id);
      const prices = extractPriceFields(product);
      const siblingPrice = prices[ownedSnapshot.priceType];
      if (!siblingPrice) continue;

      const deltaPct = (siblingPrice - ownedSnapshot.price) / ownedSnapshot.price;
      if (deltaPct >= VARIANT_MISMATCH_THRESHOLD) {
        higherValueVariants.push({
          productId: sibling.id,
          productName: sibling["product-name"],
          price: siblingPrice,
          deltaPct,
        });
      }
    } catch {
      // Best-effort — skip candidates we can't price rather than failing the whole check.
    }
  }

  let alert: Alert | null = null;
  if (higherValueVariants.length > 0) {
    alert = await recordVariantAlert(card, ownedSnapshot.priceType, ownedSnapshot.price, higherValueVariants);
  }

  return { higherValueVariants, alert };
}

async function recordVariantAlert(
  card: Card,
  priceType: string,
  ownedPrice: number,
  matches: HigherValueVariant[]
): Promise<Alert | null> {
  const cooldownCutoff = new Date(Date.now() - VARIANT_ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const existing = await prisma.alert.findFirst({
    where: {
      cardId: card.id,
      type: AlertType.VARIANT_MISMATCH,
      priceType,
      createdAt: { gte: cooldownCutoff },
    },
  });
  if (existing) return null;

  const best = matches.reduce((max, m) => (m.deltaPct > max.deltaPct ? m : max), matches[0]);

  return prisma.alert.create({
    data: {
      cardId: card.id,
      type: AlertType.VARIANT_MISMATCH,
      priceType,
      message: `Double check the variant — "${best.productName}" (same card, different print) is worth ${formatCents(best.price)}, ${formatPct(best.deltaPct)} more than what's on file. You may have scanned or labeled the wrong variant.`,
      changePct: best.deltaPct,
      fromPrice: ownedPrice,
      toPrice: best.price,
      windowDays: 0,
    },
  });
}
