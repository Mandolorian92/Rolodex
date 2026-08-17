"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RETAILERS = [
  { value: "GAMESTOP", label: "GameStop" },
  { value: "WALMART", label: "Walmart" },
  { value: "TARGET", label: "Target" },
  { value: "BESTBUY", label: "Best Buy" },
];

export default function AddWatchTargetForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [retailer, setRetailer] = useState("GAMESTOP");
  const [kind, setKind] = useState<"PRODUCT" | "SEARCH">("PRODUCT");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [sku, setSku] = useState("");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stock-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retailer,
          kind,
          label,
          url,
          sku: sku || undefined,
          keyword: keyword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error?.formErrors?.[0] ?? data.error?.fieldErrors?.[Object.keys(data.error?.fieldErrors ?? {})[0]]?.[0] ?? data.error ?? "Failed to add"
        );
      }
      setLabel("");
      setUrl("");
      setSku("");
      setKeyword("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        + Watch a product
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Watch a retail listing</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Retailer
          <select
            value={retailer}
            onChange={(e) => setRetailer(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          >
            {RETAILERS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Watch type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "PRODUCT" | "SEARCH")}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          >
            <option value="PRODUCT">Specific product (restock alert)</option>
            <option value="SEARCH" disabled={retailer !== "BESTBUY"}>
              Keyword search (new listing alert — Best Buy only)
            </option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Scarlet & Violet Elite Trainer Box"
          required
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        {kind === "PRODUCT" ? "Product page URL" : "Search results page URL"}
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          required
          type="url"
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </label>

      {retailer === "BESTBUY" && kind === "PRODUCT" && (
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Best Buy SKU (the number right before &ldquo;.p&rdquo; in the URL)
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. 6418599"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
      )}

      {kind === "SEARCH" && (
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Keyword to watch for new listings
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. Pokemon Elite Trainer Box"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </form>
  );
}
