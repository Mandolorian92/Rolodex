"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, LANGUAGE_TOKENS } from "@/lib/cardMeta";

const CATEGORY_OPTIONS = [
  { value: "", label: "Unknown / not set" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

export default function CardMetaEditor({
  cardId,
  category,
  language,
}: {
  cardId: string;
  category: string | null;
  language: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [categoryValue, setCategoryValue] = useState(category ?? "");
  const [languageValue, setLanguageValue] = useState(language ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categoryValue || null,
          language: languageValue.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-zinc-500 underline hover:text-zinc-300"
      >
        {category ? CATEGORY_LABELS[category] ?? category : "Unknown category"}
        {language ? ` · ${language}` : ""} — edit
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-1 text-zinc-500">
        Category
        <select
          value={categoryValue}
          onChange={(e) => setCategoryValue(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-zinc-500">
        Language
        <input
          list="language-presets"
          value={languageValue}
          onChange={(e) => setLanguageValue(e.target.value)}
          placeholder="Blank = English/unspecified"
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100 placeholder:text-zinc-600"
        />
        <datalist id="language-presets">
          {LANGUAGE_TOKENS.map((token) => (
            <option key={token} value={token} />
          ))}
        </datalist>
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => setEditing(false)}
        disabled={saving}
        className="rounded px-2 py-1.5 text-zinc-400 hover:text-zinc-200"
      >
        Cancel
      </button>
      {error && <p className="w-full text-rose-400">{error}</p>}
    </div>
  );
}
