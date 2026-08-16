"use client";

import { useState } from "react";

export default function NotifyStatus({ configured }: { configured: boolean }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendTest() {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/notify/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send test email");
      setMessage("Test email sent — check your inbox.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${configured ? "bg-emerald-500" : "bg-zinc-600"}`} />
        <span className="text-zinc-300">
          Email notifications {configured ? "are configured" : "aren't set up"}
        </span>
        {!configured && (
          <span className="text-xs text-zinc-600">
            (set RESEND_API_KEY and ALERT_EMAIL_TO — see .env.example)
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {message && <span className="text-xs text-zinc-500">{message}</span>}
        {configured && (
          <button
            onClick={sendTest}
            disabled={sending}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send test email"}
          </button>
        )}
      </div>
    </div>
  );
}
