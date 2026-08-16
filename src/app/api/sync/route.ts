import { NextResponse } from "next/server";
import { syncCollection } from "@/lib/sync";

// Triggered manually from the dashboard, or on a schedule (e.g. Vercel Cron) to refresh
// prices for every card currently in the collection and re-run the trend/alert engine.
export async function POST() {
  const results = await syncCollection();
  const totalAlerts = results.reduce((sum, r) => sum + r.alertsCreated, 0);
  const totalSnapshots = results.reduce((sum, r) => sum + r.snapshotsCreated, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    syncedCards: results.length,
    snapshotsCreated: totalSnapshots,
    alertsCreated: totalAlerts,
    errors: errors.map((e) => ({ cardId: e.cardId, cardName: e.cardName, error: e.error })),
    results,
  });
}
