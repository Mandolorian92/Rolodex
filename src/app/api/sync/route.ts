import { NextRequest, NextResponse } from "next/server";
import { syncCollection } from "@/lib/sync";

// Vercel Cron sends a GET request (with an Authorization: Bearer <CRON_SECRET> header, if
// CRON_SECRET is set) rather than POST — see vercel.json and the README's "Keeping prices
// fresh" section. Manual triggers from the dashboard still use POST.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return POST();
}

// Triggered manually from the dashboard, or on a schedule (e.g. Vercel Cron) to refresh
// prices for every card currently in the collection and re-run the trend/alert engine.
export async function POST() {
  const results = await syncCollection();
  const totalAlerts = results.reduce((sum, r) => sum + r.alerts.length, 0);
  const totalGuideSnapshots = results.reduce((sum, r) => sum + r.guideSnapshotsCreated, 0);
  const totalSales = results.reduce((sum, r) => sum + r.salesRecorded, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    syncedCards: results.length,
    guideSnapshotsCreated: totalGuideSnapshots,
    salesRecorded: totalSales,
    alertsCreated: totalAlerts,
    errors: errors.map((e) => ({ cardId: e.cardId, cardName: e.cardName, error: e.error })),
    results: results.map((r) => ({
      cardId: r.cardId,
      cardName: r.cardName,
      guideSnapshotsCreated: r.guideSnapshotsCreated,
      salesRecorded: r.salesRecorded,
      alertsCreated: r.alerts.length,
      error: r.error,
    })),
  });
}
