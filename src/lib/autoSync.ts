/**
 * Background auto-refresh for a long-running server process (local `npm run dev`/`npm
 * start`, or any self-hosted deployment that keeps one Node process alive). Nothing calls
 * /api/sync or /api/stock-watch/check on its own otherwise — you'd have to click "Sync now"
 * every time, which defeats the point of a ticker.
 *
 * This is NOT a substitute for vercel.json's Cron Jobs on a serverless deployment: Vercel
 * functions don't keep a process alive between requests, so a setInterval here would never
 * actually fire there. This covers the opposite case — a persistent process with no cron
 * wired up in front of it.
 */
import { syncCollection } from "@/lib/sync";
import { checkAllWatchTargets } from "@/lib/stockWatch";

declare global {
  var __rolodexAutoSyncStarted: boolean | undefined;
}

function parseMinutes(envVar: string | undefined, defaultMinutes: number): number {
  if (envVar === undefined || envVar === "") return defaultMinutes;
  const n = Number(envVar);
  return Number.isFinite(n) && n >= 0 ? n : defaultMinutes;
}

/** Idempotent — safe to call more than once (e.g. across dev-mode module reloads). */
export function startAutoSync(): void {
  if (globalThis.__rolodexAutoSyncStarted) return;
  globalThis.__rolodexAutoSyncStarted = true;

  const syncMinutes = parseMinutes(process.env.AUTO_SYNC_INTERVAL_MINUTES, 60);
  const stockWatchMinutes = parseMinutes(process.env.AUTO_STOCK_WATCH_INTERVAL_MINUTES, 5);

  if (syncMinutes > 0) {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      console.log(`[auto-sync] Running scheduled price sync (every ${syncMinutes}m)...`);
      syncCollection()
        .catch((err) => console.error("[auto-sync] Price sync failed:", err))
        .finally(() => {
          running = false;
        });
    }, syncMinutes * 60 * 1000);
    console.log(`[auto-sync] Price sync scheduled every ${syncMinutes} minute(s).`);
  } else {
    console.log("[auto-sync] Price sync auto-refresh disabled (AUTO_SYNC_INTERVAL_MINUTES=0).");
  }

  if (stockWatchMinutes > 0) {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      console.log(`[auto-sync] Running scheduled stock watch check (every ${stockWatchMinutes}m)...`);
      checkAllWatchTargets()
        .catch((err) => console.error("[auto-sync] Stock watch check failed:", err))
        .finally(() => {
          running = false;
        });
    }, stockWatchMinutes * 60 * 1000);
    console.log(`[auto-sync] Stock watch check scheduled every ${stockWatchMinutes} minute(s).`);
  } else {
    console.log("[auto-sync] Stock watch auto-refresh disabled (AUTO_STOCK_WATCH_INTERVAL_MINUTES=0).");
  }
}
