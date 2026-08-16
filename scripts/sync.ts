/**
 * CLI entry point for refreshing prices on every collection card and running the trend
 * engine. Run with `npm run sync`. Intended to also be invoked on a schedule (cron,
 * Vercel Cron hitting POST /api/sync, GitHub Actions, etc) so the ticker stays live.
 */
import "dotenv/config";
import { syncCollection } from "../src/lib/sync";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Syncing collection prices...");
  const results = await syncCollection();

  for (const r of results) {
    if (r.error) {
      console.error(`✗ ${r.cardName}: ${r.error}`);
    } else {
      console.log(
        `✓ ${r.cardName}: ${r.snapshotsCreated} price(s), ${r.ebaySalesCreated} eBay sale(s), ${r.alerts.length} alert(s)`
      );
    }
  }

  const totalAlerts = results.reduce((sum, r) => sum + r.alerts.length, 0);
  console.log(`\nDone. ${results.length} card(s) synced, ${totalAlerts} new alert(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
