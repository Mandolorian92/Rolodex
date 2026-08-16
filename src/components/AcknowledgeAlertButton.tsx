"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AcknowledgeAlertButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function acknowledge() {
    setBusy(true);
    try {
      await fetch(`/api/alerts/${alertId}`, { method: "PATCH" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={acknowledge}
      disabled={busy}
      className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
    >
      Dismiss
    </button>
  );
}
