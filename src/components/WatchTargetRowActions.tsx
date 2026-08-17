"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WatchTargetRowActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function checkNow() {
    setBusy(true);
    setStatus("Checking…");
    try {
      const res = await fetch(`/api/stock-watch/${id}/check`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      setStatus(data.error ? data.error : `${data.alerts.length} alert(s)`);
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 4000);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await fetch(`/api/stock-watch/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Stop watching this listing?")) return;
    setBusy(true);
    try {
      await fetch(`/api/stock-watch/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status && <span className="text-xs text-zinc-500">{status}</span>}
      <button
        onClick={checkNow}
        disabled={busy}
        className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
      >
        Check now
      </button>
      <button
        onClick={toggleActive}
        disabled={busy}
        className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
      >
        {active ? "Pause" : "Resume"}
      </button>
      <button
        onClick={remove}
        disabled={busy}
        className="rounded bg-rose-600/20 px-2 py-1 text-xs font-medium text-rose-400 hover:bg-rose-600/30 disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  );
}
