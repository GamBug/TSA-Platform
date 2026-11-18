/**
 * In-memory sliding-window limiter for public guest creation. State is per process and is lost
 * on restart, which matches the disposable demo database. A full table fails closed.
 */
export function createSlidingWindowLimiter({ limit, windowMilliseconds, maxKeys = 10_000, now = Date.now } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100_000) throw new RangeError('limit must be an integer from 1 through 100000');
  if (!Number.isSafeInteger(windowMilliseconds) || windowMilliseconds < 1) throw new RangeError('windowMilliseconds must be a positive integer');
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) throw new RangeError('maxKeys must be a positive integer');
  const hits = new Map();

  const prune = (at) => {
    for (const [key, times] of hits) {
      while (times.length && times[0] <= at - windowMilliseconds) times.shift();
      if (times.length === 0) hits.delete(key);
    }
  };

  return Object.freeze({
    /** Record one use for `key`; returns { allowed, retryAfterSeconds }. */
    take(key) {
      const at = now();
      let times = hits.get(key);
      if (times) while (times.length && times[0] <= at - windowMilliseconds) times.shift();
      if (!times) {
        if (hits.size >= maxKeys) prune(at);
        if (hits.size >= maxKeys) return { allowed: false, retryAfterSeconds: Math.ceil(windowMilliseconds / 1000) };
        times = [];
        hits.set(key, times);
      }
      if (times.length >= limit) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((times[0] + windowMilliseconds - at) / 1000)) };
      }
      times.push(at);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  });
}
