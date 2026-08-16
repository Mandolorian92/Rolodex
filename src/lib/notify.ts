/**
 * Email notifications for newly-created alerts, via Resend's HTTP API
 * (https://resend.com/docs/api-reference/emails/send-email). Chosen over SMTP for setup
 * simplicity — one API key, no app-password dance with a mail provider.
 *
 * Configuration is optional: with RESEND_API_KEY / ALERT_EMAIL_TO unset, notifications are
 * silently skipped (logged, not thrown) so sync keeps working without email wired up, same
 * pattern as the optional eBay integration.
 */
import type { Alert, Card } from "@/generated/prisma/client";
import { formatPct } from "@/lib/format";

const RESEND_API_URL = "https://api.resend.com/emails";

export type AlertWithCard = Alert & { card: Card };

export function isNotifyConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);
}

function appUrl(path: string): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}${path}`;
}

const ALERT_TYPE_LABEL: Record<string, string> = {
  TRENDING_UP: "Trending up",
  TRENDING_DOWN: "Trending down",
  SELL_SIGNAL: "Sell signal",
  NEW_HIGH: "New high",
};

function buildEmail(alerts: AlertWithCard[]): { subject: string; html: string; text: string } {
  const subject =
    alerts.length === 1
      ? `Rolodex: ${ALERT_TYPE_LABEL[alerts[0].type] ?? alerts[0].type} — ${alerts[0].card.name}`
      : `Rolodex: ${alerts.length} new signals`;

  const rows = alerts
    .map((alert) => {
      const label = ALERT_TYPE_LABEL[alert.type] ?? alert.type;
      const url = appUrl(`/cards/${alert.cardId}`);
      return { label, url, alert };
    })
    .sort((a, b) => Math.abs(b.alert.changePct) - Math.abs(a.alert.changePct));

  const text = rows
    .map(({ label, url, alert }) => `[${label}] ${alert.card.name}: ${alert.message} (${url})`)
    .join("\n");

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">Rolodex signals</h2>
      <p style="color: #71717a; margin-top: 0;">${alerts.length} new alert${alerts.length === 1 ? "" : "s"} from your last sync.</p>
      <table style="width: 100%; border-collapse: collapse;">
        ${rows
          .map(
            ({ label, url, alert }) => `
          <tr style="border-top: 1px solid #e4e4e7;">
            <td style="padding: 10px 0;">
              <div style="font-weight: 600;">${alert.card.name}</div>
              <div style="color: #52525b; font-size: 14px;">${alert.message}</div>
              <a href="${url}" style="font-size: 13px; color: #059669;">View card →</a>
            </td>
            <td style="padding: 10px 0; text-align: right; white-space: nowrap;">
              <span style="font-size: 12px; font-weight: 600; color: #059669;">${label}</span>
              <div style="font-size: 13px; color: #3f3f46;">${formatPct(alert.changePct)}</div>
            </td>
          </tr>`
          )
          .join("")}
      </table>
    </div>
  `.trim();

  return { subject, html, text };
}

/** Send one email summarizing a batch of newly-created alerts. No-ops if unconfigured. */
export async function notifyNewAlerts(alerts: AlertWithCard[]): Promise<void> {
  if (alerts.length === 0) return;
  if (!isNotifyConfigured()) {
    console.log(`[notify] Skipping email for ${alerts.length} alert(s) — RESEND_API_KEY/ALERT_EMAIL_TO not set.`);
    return;
  }

  const { subject, html, text } = buildEmail(alerts);

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM || "Rolodex <onboarding@resend.dev>",
      to: [process.env.ALERT_EMAIL_TO],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    // Don't let a notification failure fail the sync — just log it loudly.
    console.error(`[notify] Resend API error ${res.status}: ${await res.text()}`);
  }
}

/** Send a one-off test email so users can confirm their notification config works. */
export async function sendTestEmail(): Promise<void> {
  if (!isNotifyConfigured()) {
    throw new Error("RESEND_API_KEY and ALERT_EMAIL_TO must both be set to send a test email.");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM || "Rolodex <onboarding@resend.dev>",
      to: [process.env.ALERT_EMAIL_TO],
      subject: "Rolodex test email",
      html: "<p>If you're reading this, Rolodex email notifications are working.</p>",
      text: "If you're reading this, Rolodex email notifications are working.",
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}
