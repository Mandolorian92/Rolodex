import { PriceSource } from "@/generated/prisma/client";
import { CARD_PRICE_TYPE_LABELS } from "@/lib/pricecharting";

/** Short labels for the multi-source price breakdown — table space is tight, so these stay terse. */
export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  PRICECHARTING_GUIDE: "PriceCharting",
  PRICECHARTING_SALE: "PC sale",
  EBAY_SALE: "eBay sale",
  TCGPLAYER_MARKET: "TCGPlayer",
  MANUAL: "Manual",
};

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatPct(fraction: number): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Every card in this app is a trading card, so a PriceCharting priceType always means the
 * card grade mapping in CARD_PRICE_TYPE_LABELS (loose = ungraded, manual-only = PSA 10,
 * etc — see pricecharting.ts). Fall back to a generic title-case for anything unmapped.
 */
export function formatPriceType(priceType: string): string {
  if (priceType in CARD_PRICE_TYPE_LABELS) return CARD_PRICE_TYPE_LABELS[priceType];
  return priceType
    .split(/[-_]/)
    .map((word) => (word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}
