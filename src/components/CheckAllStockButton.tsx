"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CheckAllStockButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  async function handleCheck() {
    setStatus("Checking…");
    try {
      const res = await fetch("/api/stock-watch/check", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      setStatus(`Checked ${data.checkedTargets} target(s), ${data.alertsCreated} new alert(s)`);
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Check failed");
    } finally {
      setTimeout(() => setStatus(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status && <span className="text-xs text-zinc-500">{status}</span>}
      <button
        onClick={handleCheck}
        disabled={isPending}
        className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-900 disabled:opacity-50"
      >
        {isPending ? "Checking…" : "Check all now"}
      </button>
    </div>
  );
}
