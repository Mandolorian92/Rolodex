/**
 * CLI entry point for checking every active stock-watch target. Run with
 * `npm run stock-watch`. Intended to also be invoked on a schedule (cron, Vercel Cron
 * hitting POST /api/stock-watch/check, GitHub Actions, etc) — check every few minutes if
 * you want a real shot at catching a restock before it sells out.
 */
import "dotenv/config";
import { checkAllWatchTargets } from "../src/lib/stockWatch";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Checking stock watch targets...");
  const results = await checkAllWatchTargets();

  for (const r of results) {
    if (r.error) {
      console.error(`✗ ${r.label}: ${r.error}`);
    } else {
      console.log(`✓ ${r.label}: ${r.alerts.length} alert(s)`);
    }
  }

  const totalAlerts = results.reduce((sum, r) => sum + r.alerts.length, 0);
  console.log(`\nDone. ${results.length} target(s) checked, ${totalAlerts} new alert(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
