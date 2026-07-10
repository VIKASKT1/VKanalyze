/**
 * dataset-cache.ts — shared cache for expensive per-dataset computations.
 *
 * ROOT CAUSE OF THE TAB-SWITCH FREEZE:
 * Tabs are conditionally rendered (`{activeTab === 'x' && <Tab/>}`), so React
 * fully UNMOUNTS a tab's component tree when you navigate away and MOUNTS a
 * fresh instance when you come back. Any `useState`/`useMemo` inside that
 * component is thrown away on unmount — there is nothing local a component
 * can do to remember "I already computed this" across a tab switch.
 *
 * Several tabs (Clean, Data Quality, Pivot, Smart Recommendations, Compare)
 * responded to this by just recomputing full-dataset statistics, duplicate
 * detection, or grouping from scratch on every single mount — even though
 * the underlying rows hadn't changed at all. On a 1,000,000-row dataset,
 * several of those recomputations individually take multiple seconds of
 * blocking main-thread work (profiled separately), so revisiting a tab a
 * few times could block the UI thread for 5-10+ seconds, which is exactly
 * what triggers Chrome's "Page Unresponsive" dialog.
 *
 * FIX: cache derived results in a WeakMap keyed by the *identity* of the
 * rows array (not its contents). This is deliberate:
 *   - A fresh upload, a cleaning operation, or a filter operation all
 *     produce a brand-new rows array reference in this codebase, so the
 *     cache is automatically and correctly invalidated whenever the data
 *     actually changes — no manual cache-busting/versioning needed.
 *   - When the *same* rows array is passed to the *same tab* again (i.e.
 *     the user switches away and back without changing the data), every
 *     lookup is an instant cache hit, independent of component mount state.
 *   - Using a WeakMap means the cache entry is garbage-collected
 *     automatically once the rows array itself is no longer referenced
 *     anywhere (e.g. after a new upload replaces it) — no manual cleanup,
 *     no unbounded memory growth across a long session.
 */

type CacheEntry = {
  hasValue: boolean;
  value: unknown;
  inflight: Promise<unknown> | null;
};

const store = new WeakMap<object, Map<string, CacheEntry>>();

function bucketFor(rows: object): Map<string, CacheEntry> {
  let bucket = store.get(rows);
  if (!bucket) {
    bucket = new Map();
    store.set(rows, bucket);
  }
  return bucket;
}

/** Synchronous memoized getter. Use only for cheap (<~10ms) derivations. */
export function getCachedSync<T>(rows: object, key: string, compute: () => T): T {
  const bucket = bucketFor(rows);
  const entry = bucket.get(key);
  if (entry?.hasValue) return entry.value as T;
  const value = compute();
  bucket.set(key, { hasValue: true, value, inflight: null });
  return value;
}

/**
 * Async memoized getter (for worker-backed computations). Concurrent calls
 * for the same (rows, key) share a single in-flight promise instead of
 * triggering duplicate worker round-trips.
 */
export function getCachedAsync<T>(rows: object, key: string, compute: () => Promise<T>): Promise<T> {
  const bucket = bucketFor(rows);
  const entry = bucket.get(key);
  if (entry?.hasValue) return Promise.resolve(entry.value as T);
  if (entry?.inflight) return entry.inflight as Promise<T>;

  const promise = compute().then(value => {
    bucket.set(key, { hasValue: true, value, inflight: null });
    return value;
  }).catch(err => {
    // Don't poison the cache with a failed attempt — allow retry.
    bucket.delete(key);
    throw err;
  });

  bucket.set(key, { hasValue: false, value: undefined, inflight: promise });
  return promise;
}

/** Returns a cached value if present, without triggering computation. */
export function peekCached<T>(rows: object, key: string): T | undefined {
  return store.get(rows)?.get(key)?.value as T | undefined;
}

/** Explicitly drop a dataset's cache bucket (rarely needed given WeakMap GC). */
export function invalidateDataset(rows: object): void {
  store.delete(rows);
}
