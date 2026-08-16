"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, formatPct } from "@/lib/format";

interface HigherValueVariant {
  productId: string;
  productName: string;
  price: number;
  deltaPct: number;
}

export default function CheckVariantsButton({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HigherValueVariant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/cards/${cardId}/check-variants`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Variant check failed");
      setResult(data.matches);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Variant check failed");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={check}
        disabled={checking}
        className="self-start rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
      >
        {checking ? "Checking…" : "Check for higher-value variants"}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {result && result.length === 0 && (
        <p className="text-xs text-zinc-500">No pricier same-card variants found.</p>
      )}
      {result && result.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-zinc-400">
          {result.map((m) => (
            <li key={m.productId}>
              &ldquo;{m.productName}&rdquo; — {formatCents(m.price)} ({formatPct(m.deltaPct)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
