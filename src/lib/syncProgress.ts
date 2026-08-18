/**
 * In-memory progress tracking for the collection sync — a full sync is rate-limited to
 * roughly 1 card/second (PriceCharting's hard 1 req/sec limit, ~2 calls/card), so on a
 * few-hundred-card collection it can legitimately take 15-25+ minutes. Without any progress
 * feedback that's indistinguishable from hung. This is read by GET /api/sync/status so the
 * UI can show real progress instead of a static spinner, whether the sync was triggered by
 * a click or by the background auto-sync scheduler.
 *
 * Deliberately in-memory (not persisted) — it only needs to answer "what's happening right
 * now on this server process," which is exactly where the sync is actually running.
 */
export interface SyncProgress {
  running: boolean;
  total: number;
  completed: number;
  currentCardName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

declare global {
  var __rolodexSyncProgress: SyncProgress | undefined;
}

function state(): SyncProgress {
  if (!globalThis.__rolodexSyncProgress) {
    globalThis.__rolodexSyncProgress = {
      running: false,
      total: 0,
      completed: 0,
      currentCardName: null,
      startedAt: null,
      finishedAt: null,
    };
  }
  return globalThis.__rolodexSyncProgress;
}

export function getSyncProgress(): SyncProgress {
  return { ...state() };
}

export function startSyncProgress(total: number): void {
  const s = state();
  s.running = true;
  s.total = total;
  s.completed = 0;
  s.currentCardName = null;
  s.startedAt = new Date().toISOString();
  s.finishedAt = null;
}

export function reportSyncCard(cardName: string): void {
  state().currentCardName = cardName;
}

export function completeSyncCard(): void {
  state().completed += 1;
}

export function finishSyncProgress(): void {
  const s = state();
  s.running = false;
  s.currentCardName = null;
  s.finishedAt = new Date().toISOString();
}
