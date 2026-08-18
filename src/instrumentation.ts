/**
 * Next.js calls register() once when the server process starts (not during build, and not
 * per-request) — the right place to kick off a background scheduler. See src/lib/autoSync.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startAutoSync } = await import("@/lib/autoSync");
  startAutoSync();
}
