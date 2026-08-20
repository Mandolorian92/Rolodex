/**
 * Simple process-wide throttle: ensures calls made through `throttle()` are spaced at
 * least `minIntervalMs` apart, queueing anything that comes in faster. Used to stay under
 * PriceCharting's hard "1 call per second" API limit — exceeding it risks the account's
 * API access being revoked, per their docs.
 */
export function createThrottle(minIntervalMs: number) {
  let chain: Promise<void> = Promise.resolve();

  return function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const result = chain.then(async () => {
      const result = await fn();
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs));
      return result;
    });
    // Swallow rejections in the chain itself so one failed call doesn't wedge the queue;
    // the actual error still propagates to whoever awaited `result`.
    chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

/** PriceCharting allows 1 request/second; use 1100ms to leave headroom for clock drift. */
export const throttlePriceCharting = createThrottle(1100);

/**
 * TCGPlayer's documented limits are more generous than PriceCharting's, but this sandbox
 * can't reach api.tcgplayer.com to confirm real numbers — 300ms is a conservative guess
 * (~3 req/sec), not a verified figure. Tighten or loosen once tested against the real API.
 */
export const throttleTcgplayer = createThrottle(300);
