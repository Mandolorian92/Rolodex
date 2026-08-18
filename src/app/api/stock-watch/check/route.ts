import { NextRequest, NextResponse } from "next/server";
import { checkAllWatchTargets } from "@/lib/stockWatch";

// Vercel Cron sends a GET request (with an Authorization: Bearer <CRON_SECRET> header, if
// CRON_SECRET is set) rather than POST — see vercel.json. Manual "Check all now" clicks
// still use POST.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return POST();
}

// Triggered manually from the /stock-watch page, or on a schedule (e.g. Vercel Cron) to
// check every active watch target and send one summary email for anything that fired.
export async function POST() {
  const results = await checkAllWatchTargets();
  const totalAlerts = results.reduce((sum, r) => sum + r.alerts.length, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    checkedTargets: results.length,
    alertsCreated: totalAlerts,
    errors: errors.map((e) => ({ watchTargetId: e.watchTargetId, label: e.label, error: e.error })),
    results: results.map((r) => ({
      watchTargetId: r.watchTargetId,
      label: r.label,
      alertsCreated: r.alerts.length,
      error: r.error,
    })),
  });
}
