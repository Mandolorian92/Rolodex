"use client";

import { useRouter } from "next/navigation";

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export default function CollectionFilters({
  basePath = "/collection",
  category,
  language,
  categoryOptions,
  languageOptions,
  extraParams = {},
}: {
  basePath?: string;
  category: string;
  language: string;
  categoryOptions: FilterOption[];
  languageOptions: FilterOption[];
  /** Other params to preserve across a filter change, e.g. { sort, dir } or { tier, view }. */
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();

  function navigate(next: { category?: string; language?: string }) {
    const params = new URLSearchParams(extraParams);
    const nextCategory = next.category ?? category;
    const nextLanguage = next.language ?? language;
    if (nextCategory !== "all") params.set("category", nextCategory);
    if (nextLanguage !== "all") params.set("language", nextLanguage);
    router.push(`${basePath}?${params.toString()}`);
  }

  if (categoryOptions.length <= 1 && languageOptions.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {categoryOptions.length > 1 && (
        <label className="flex items-center gap-2 text-zinc-500">
          Category
          <select
            value={category}
            onChange={(e) => navigate({ category: e.target.value })}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>
        </label>
      )}
      {languageOptions.length > 1 && (
        <label className="flex items-center gap-2 text-zinc-500">
          Language
          <select
            value={language}
            onChange={(e) => navigate({ language: e.target.value })}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          >
            {languageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
