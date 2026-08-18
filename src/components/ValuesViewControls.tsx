"use client";

import { useRouter } from "next/navigation";

export default function ValuesViewControls({
  view,
  tier,
  tierOptions,
  category,
  language,
}: {
  view: "list" | "matrix";
  tier: string;
  tierOptions: Array<{ value: string; label: string }>;
  category: string;
  language: string;
}) {
  const router = useRouter();

  function navigate(next: { view?: string; tier?: string }) {
    const params = new URLSearchParams({
      view: next.view ?? view,
      tier: next.tier ?? tier,
    });
    if (category !== "all") params.set("category", category);
    if (language !== "all") params.set("language", language);
    router.push(`/collection/values?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <div className="flex items-center rounded-md border border-zinc-700 p-0.5">
        {(["list", "matrix"] as const).map((v) => (
          <button
            key={v}
            onClick={() => navigate({ view: v })}
            className={`rounded px-3 py-1 text-xs font-semibold ${
              view === v ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {v === "list" ? "Top cards" : "Grade matrix"}
          </button>
        ))}
      </div>
      {view === "list" && (
        <label className="flex items-center gap-2 text-zinc-500">
          Ranked by
          <select
            value={tier}
            onChange={(e) => navigate({ tier: e.target.value })}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          >
            {tierOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
