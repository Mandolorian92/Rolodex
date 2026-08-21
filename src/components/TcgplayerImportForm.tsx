"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ImportSummary {
  rowsFound: number;
  matchedExisting: number;
  newCards: number;
  priceSnapshotsCreated: number;
  skipped: Array<{ row: number; reason: string }>;
}

export default function TcgplayerImportForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/collection/import/tcgplayer", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
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
        Import from TCGplayer (CSV)
      </button>
    );
  }

  return (
    <form onSubmit={runImport} className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Import a TCGplayer export</h3>
        <p className="mt-1 text-xs text-zinc-500">
          In the TCGplayer app: your collection → ⋯ → Export. Cards that match something
          already in your collection just get TCGplayer&apos;s real Market Price added
          alongside whatever else you have on file — see it as a second number next to the
          ticker on the card. Anything new gets added as its own card. Safe to re-run.
        </p>
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-200 hover:file:bg-zinc-700"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={importing || !file}
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
          Found {result.rowsFound} row(s): {result.matchedExisting} matched an existing card
          (price added), {result.newCards} added as new
          {result.priceSnapshotsCreated > 0 ? `, ${result.priceSnapshotsCreated} price(s) recorded` : ""}
          {result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ""}.
        </p>
      )}
    </form>
  );
}
