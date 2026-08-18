"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ImportSummary {
  offersFound: number;
  newCards: number;
  updatedCards: number;
  unchangedCards: number;
  priceSnapshotsCreated: number;
  skipped: Array<{ offer: string; reason: string }>;
}

export default function ImportCollectionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sellerId, setSellerId] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport(e: React.FormEvent) {
    e.preventDefault();
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: sellerId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.formErrors?.[0] ?? data.error ?? "Import failed");
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
      >
        Import from PriceCharting
      </button>
    );
  }

  return (
    <form onSubmit={runImport} className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Import your PriceCharting collection</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Pulls everything marked as &ldquo;collection&rdquo; on your PriceCharting account in one call.
          Re-running this syncs quantity/condition changes made there.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Seller ID (from your collection URL — leave blank to use PRICECHARTING_SELLER_ID)
        <input
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          placeholder="e.g. qayjb4fmzx2igw4ok35gct4znm"
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={importing}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import"}
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
      {result && (
        <p className="text-sm text-emerald-400">
          Found {result.offersFound} offer(s): {result.newCards} new, {result.updatedCards} updated,{" "}
          {result.unchangedCards} already up to date (skipped, not re-written),{" "}
          {result.priceSnapshotsCreated} new price(s) recorded
          {result.skipped.length > 0 ? `, ${result.skipped.length} skipped with an error` : ""}.
        </p>
      )}
    </form>
  );
}
