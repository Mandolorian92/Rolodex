"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, formatPriceType } from "@/lib/format";

interface SearchResult {
  priceChartingId: string;
  name: string;
  consoleName: string | null;
  prices: Record<string, number>;
}

const CONDITIONS = [
  "UNGRADED",
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
  "GRADED_10",
  "GRADED_9",
  "GRADED_8",
  "GRADED_7",
] as const;

export default function AddCardForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>("NEAR_MINT");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [adding, setAdding] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function addToCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceChartingId: selected.priceChartingId,
          name: selected.name,
          consoleName: selected.consoleName,
          quantity,
          condition,
          purchasePrice: purchasePrice ? Math.round(Number(purchasePrice) * 100) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? JSON.stringify(data.error) : "Failed to add card");
      router.push("/collection");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the PriceCharting catalog, e.g. 'Charizard Base Set'"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {results && (
        <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {results.length === 0 && <p className="p-4 text-sm text-zinc-500">No results.</p>}
          {results.map((r) => (
            <button
              key={r.priceChartingId}
              onClick={() => setSelected(r)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-zinc-900 ${
                selected?.priceChartingId === r.priceChartingId ? "bg-zinc-900" : ""
              }`}
            >
              <span>
                <span className="font-medium text-zinc-100">{r.name}</span>
                {r.consoleName && <span className="ml-2 text-xs text-zinc-500">{r.consoleName}</span>}
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {Object.entries(r.prices)
                  .slice(0, 2)
                  .map(([type, cents]) => `${formatPriceType(type)} ${formatCents(cents)}`)
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <form onSubmit={addToCollection} className="flex flex-col gap-4 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Add &ldquo;{selected.name}&rdquo; to your collection</h3>
          <div className="grid grid-cols-3 gap-4">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Quantity
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Condition
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as (typeof CONDITIONS)[number])}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Purchase price ($)
              <input
                type="number"
                min={0}
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="self-start rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to collection"}
          </button>
        </form>
      )}
    </div>
  );
}
