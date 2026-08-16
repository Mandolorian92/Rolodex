import { Condition } from "@/generated/prisma/client";

/**
 * Maps our Condition enum to the PriceCharting priceType (the "*-price" field, minus the
 * "-price" suffix) that prices that condition. PriceCharting only differentiates raw-card
 * wear (NM/LP/MP/HP/damaged) as a single "loose" (ungraded) price — it has no per-wear-tier
 * pricing — so all raw conditions map to the same series. See CARD_PRICE_TYPE_LABELS in
 * pricecharting.ts for the reverse (priceType -> human label).
 */
export const CONDITION_TO_PRICE_TYPE: Record<Condition, string> = {
  [Condition.UNGRADED]: "loose",
  [Condition.NEAR_MINT]: "loose",
  [Condition.LIGHTLY_PLAYED]: "loose",
  [Condition.MODERATELY_PLAYED]: "loose",
  [Condition.HEAVILY_PLAYED]: "loose",
  [Condition.DAMAGED]: "loose",
  [Condition.GRADED_7]: "cib",
  [Condition.GRADED_8]: "new",
  [Condition.GRADED_9]: "graded",
  [Condition.PSA_10]: "manual-only",
  [Condition.BGS_10]: "bgs-10",
  [Condition.CGC_10]: "condition-17",
  [Condition.SGC_10]: "condition-18",
};

/** Matches a bare grade number like "9" in "PSA 9" or "Grade 9", but not the "9" in "9.5". */
function hasGradeNumber(s: string, n: number): boolean {
  return new RegExp(`\\b${n}\\b(?!\\.)`).test(s);
}

/**
 * Best-effort parse of a free-text condition/listing string into our enum. Handles both
 * PriceCharting's own "Grade 9" phrasing and the far more common real-world "PSA 9" /
 * "BGS 10" style seen in eBay titles and marketplace listings.
 */
export function parseConditionString(conditionString: string | undefined): Condition {
  const s = (conditionString ?? "").toLowerCase();
  const grader = /(psa|bgs|cgc|sgc)/.test(s);

  if (grader || s.includes("grade")) {
    if (hasGradeNumber(s, 10)) {
      if (s.includes("bgs")) return Condition.BGS_10;
      if (s.includes("cgc")) return Condition.CGC_10;
      if (s.includes("sgc")) return Condition.SGC_10;
      return Condition.PSA_10; // PSA is the most common grader; also the "grade 10" default
    }
    if (s.includes("gem mint") || hasGradeNumber(s, 9)) return Condition.GRADED_9;
    if (hasGradeNumber(s, 8)) return Condition.GRADED_8;
    if (hasGradeNumber(s, 7)) return Condition.GRADED_7;
  }

  if (s.includes("heavily played") || s.includes("heavy wear")) return Condition.HEAVILY_PLAYED;
  if (s.includes("moderately played") || s.includes("moderate wear")) return Condition.MODERATELY_PLAYED;
  if (s.includes("lightly played") || s.includes("light wear")) return Condition.LIGHTLY_PLAYED;
  if (s.includes("damaged")) return Condition.DAMAGED;
  if (s.includes("near mint") || s.includes("mint")) return Condition.NEAR_MINT;
  return Condition.UNGRADED;
}
