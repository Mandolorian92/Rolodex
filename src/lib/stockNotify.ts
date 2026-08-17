/**
 * Email notifications for stock-watch alerts, via the same Resend setup used for card price
 * alerts (src/lib/notify.ts) — separate module because the content/links are different
 * (straight to the retailer's product page, not back into the app), but same env vars.
 */
import type { Retailer, StockAlert, WatchTarget } from "@/generated/prisma/client";

const RESEND_API_URL = "https://api.resend.com/emails";

export type StockAlertWithTarget = StockAlert & { watchTarget: WatchTarget };

export function isStockNotifyConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);
}

const RETAILER_LABEL: Record<Retailer, string> = {
  GAMESTOP: "GameStop",
  WALMART: "Walmart",
  TARGET: "Target",
  BESTBUY: "Best Buy",
};

function buildEmail(alerts: StockAlertWithTarget[]): { subject: string; html: string; text: string } {
  const subject = alerts.length === 1 ? `Stock alert: ${alerts[0].watchTarget.label}` : `Stock watch: ${alerts.length} new alerts`;

  const text = alerts
    .map((a) => `[${RETAILER_LABEL[a.watchTarget.retailer]}] ${a.message} ${a.url}`)
    .join("\n");

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">Stock watch alerts</h2>
      <p style="color: #71717a; margin-top: 0;">${alerts.length} new alert${alerts.length === 1 ? "" : "s"}.</p>
      <table style="width: 100%; border-collapse: collapse;">
        ${alerts
          .map(
            (a) => `
          <tr style="border-top: 1px solid #e4e4e7;">
            <td style="padding: 10px 0;">
              <div style="font-size: 12px; font-weight: 600; color: #059669;">${RETAILER_LABEL[a.watchTarget.retailer]}</div>
              <div style="font-weight: 600;">${a.watchTarget.label}</div>
              <div style="color: #52525b; font-size: 14px;">${a.message}</div>
              <a href="${a.url}" style="font-size: 13px; color: #059669;">Buy now →</a>
            </td>
          </tr>`
          )
          .join("")}
      </table>
    </div>
  `.trim();

  return { subject, html, text };
}

/** Send one email summarizing a batch of newly-created stock alerts. No-ops if unconfigured. */
export async function notifyStockAlerts(alerts: StockAlertWithTarget[]): Promise<void> {
  if (alerts.length === 0) return;
  if (!isStockNotifyConfigured()) {
    console.log(`[stockNotify] Skipping email for ${alerts.length} alert(s) — RESEND_API_KEY/ALERT_EMAIL_TO not set.`);
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
    console.error(`[stockNotify] Resend API error ${res.status}: ${await res.text()}`);
  }
}
