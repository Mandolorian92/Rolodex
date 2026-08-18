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
export interface SyncErrorSample {
  cardName: string;
  error: string;
}

export interface SyncProgress {
  running: boolean;
  total: number;
  completed: number;
  currentCardName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** From the most recently finished run — cleared the moment a new run starts. */
  lastRunFailedCount: number;
  /** A sample (not every failure — could be hundreds) so the actual error text is visible. */
  lastRunErrorSample: SyncErrorSample[];
}

const MAX_ERROR_SAMPLE = 10;

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
      lastRunFailedCount: 0,
      lastRunErrorSample: [],
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
  s.lastRunFailedCount = 0;
  s.lastRunErrorSample = [];
}

export function reportSyncCard(cardName: string): void {
  state().currentCardName = cardName;
}

export function completeSyncCard(): void {
  state().completed += 1;
}

export function finishSyncProgress(errors: SyncErrorSample[] = []): void {
  const s = state();
  s.running = false;
  s.currentCardName = null;
  s.finishedAt = new Date().toISOString();
  s.lastRunFailedCount = errors.length;
  s.lastRunErrorSample = errors.slice(0, MAX_ERROR_SAMPLE);
}
