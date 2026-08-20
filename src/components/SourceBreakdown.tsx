import { formatCents } from "@/lib/format";
import { PRICE_SOURCE_LABELS } from "@/lib/format";
import type { SourceQuote } from "@/lib/tickerSeries";

/**
 * "PriceCharting says $5, TCGPlayer says $80" — shown next to the card's headlined price so
 * a real spread between sources is visible instead of silently resolved to one number. Only
 * renders when there's actually more than one source on file; a single-source card would
 * just repeat the number already shown above it.
 */
export default function SourceBreakdown({ quotes }: { quotes: SourceQuote[] }) {
  if (quotes.length < 2) return null;

  return (
    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-zinc-600">
      {quotes.map((q) => (
        <span key={q.source}>
          {PRICE_SOURCE_LABELS[q.source]} {formatCents(q.price)}
        </span>
      ))}
    </div>
  );
}
