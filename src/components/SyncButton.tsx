"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface SyncProgress {
  running: boolean;
  total: number;
  completed: number;
  currentCardName: string | null;
  lastRunFailedCount: number;
  lastRunErrorSample: Array<{ cardName: string; error: string }>;
}

export default function SyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [errorsDismissed, setErrorsDismissed] = useState(false);

  // Poll regardless of whether this button started the sync — a large collection can take
  // 15-25+ minutes (PriceCharting's 1 req/sec limit), and the background auto-sync
  // scheduler (src/lib/autoSync.ts) can kick a sync off without any click at all. Either
  // way, this shows what's actually happening instead of a static spinner that's
  // indistinguishable from hung — and keeps showing the previous run's errors (rather than
  // clearing them the moment it's no longer running), since those are exactly what you need
  // to see to figure out why something didn't sync.
  useEffect(() => {
    let cancelled = false;
    let wasRunning = false;
    async function poll() {
      try {
        const res = await fetch("/api/sync/status");
        const data: SyncProgress = await res.json();
        if (cancelled) return;
        if (data.running && !wasRunning) setErrorsDismissed(false);
        wasRunning = data.running;
        setProgress(data);
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

  const showErrors = !running && !errorsDismissed && (progress?.lastRunFailedCount ?? 0) > 0;

  return (
    <div className="relative flex items-center gap-2">
      {label && <span className="max-w-xs truncate text-xs text-zinc-500">{label}</span>}
      <button
        onClick={handleSync}
        disabled={isPending || running}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {running ? "Syncing…" : isPending ? "Refreshing…" : "Sync now"}
      </button>
      {showErrors && (
        <div className="absolute right-0 top-full z-10 mt-2 w-96 rounded-md border border-rose-900/60 bg-zinc-950 p-3 text-xs shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-rose-400">
              {progress!.lastRunFailedCount} card(s) failed to sync last run
            </p>
            <button
              onClick={() => setErrorsDismissed(true)}
              className="text-zinc-500 hover:text-zinc-300"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5 text-zinc-400">
            {progress!.lastRunErrorSample.map((e, i) => (
              <li key={i}>
                <span className="text-zinc-300">{e.cardName}:</span> {e.error}
              </li>
            ))}
          </ul>
          {progress!.lastRunFailedCount > progress!.lastRunErrorSample.length && (
            <p className="mt-2 text-zinc-600">
              +{progress!.lastRunFailedCount - progress!.lastRunErrorSample.length} more with the same or similar
              errors.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
