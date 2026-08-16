"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  async function handleSync() {
    setStatus("Syncing…");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setStatus(`Synced ${data.syncedCards} card(s), ${data.alertsCreated} new alert(s)`);
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setTimeout(() => setStatus(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status && <span className="text-xs text-zinc-500">{status}</span>}
      <button
        onClick={handleSync}
        disabled={isPending}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {isPending ? "Refreshing…" : "Sync now"}
      </button>
    </div>
  );
}
