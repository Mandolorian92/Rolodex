"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface SyncProgress {
  running: boolean;
  total: number;
  completed: number;
  currentCardName: string | null;
}

export default function SyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  // Poll regardless of whether this button started the sync — a large collection can take
  // 15-25+ minutes (PriceCharting's 1 req/sec limit), and the background auto-sync
  // scheduler (src/lib/autoSync.ts) can kick a sync off without any click at all. Either
  // way, this shows what's actually happening instead of a static spinner that's
  // indistinguishable from hung.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/sync/status");
        const data: SyncProgress = await res.json();
        if (!cancelled) setProgress(data.running ? data : null);
      } catch {
        // Transient poll failure — try again next tick.
      }
    }
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleSync() {
    setStatus(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setStatus(`Synced ${data.syncedCards} card(s), ${data.alertsCreated} new alert(s)`);
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setTimeout(() => setStatus(null), 6000);
    }
  }

  const running = progress?.running ?? false;
  const label = running
    ? `Syncing ${progress!.completed}/${progress!.total}${
        progress!.currentCardName ? ` — ${progress!.currentCardName}` : ""
      }`
    : status;

  return (
    <div className="flex items-center gap-2">
      {label && <span className="max-w-xs truncate text-xs text-zinc-500">{label}</span>}
      <button
        onClick={handleSync}
        disabled={isPending || running}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {running ? "Syncing…" : isPending ? "Refreshing…" : "Sync now"}
      </button>
    </div>
  );
}
