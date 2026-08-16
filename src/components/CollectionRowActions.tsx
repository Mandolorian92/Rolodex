"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CollectionRowActions({
  itemId,
  initialQuantity,
}: {
  itemId: string;
  initialQuantity: number;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(initialQuantity);
  const [busy, setBusy] = useState(false);

  async function updateQuantity() {
    setBusy(true);
    try {
      await fetch(`/api/collection/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove this card from your collection?")) return;
    setBusy(true);
    try {
      await fetch(`/api/collection/${itemId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
      />
      <button
        onClick={updateQuantity}
        disabled={busy || quantity === initialQuantity}
        className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
      >
        Save
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
