import { useEffect, useRef, useState } from 'react';
import { getCachedAsync, peekCached } from '../lib/dataset-cache';

// One shared worker instance for the whole app lifetime — avoids the
// overhead (and memory cost) of spinning up a new Worker per tab visit.
let sharedWorker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    sharedWorker.onmessage = (e: MessageEvent) => {
      const { id, type, result, message } = e.data ?? {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (type === 'error') p.reject(new Error(message));
      else p.resolve(result);
    };
    sharedWorker.onerror = (err) => {
      // Reject every outstanding request; a corrupt worker state shouldn't
      // hang callers forever.
      for (const [id, p] of pending) {
        p.reject(new Error(err.message ?? 'Analysis worker error'));
        pending.delete(id);
      }
    };
  }
  return sharedWorker;
}

function postToWorker<T>(payload: Record<string, unknown>): Promise<T> {
  const worker = getWorker();
  const id = ++reqId;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker.postMessage({ id, ...payload });
  });
}

// ── Dataset registration ────────────────────────────────────────────────────
// Sending `rows` to the worker costs a structuredClone — profiled at ~3.3s
// for 1,000,000 rows / 8 columns. Registering is therefore done AT MOST ONCE
// per distinct `rows` array reference (tracked here by WeakMap, keyed on
// object identity — a new upload / clean / filter naturally produces a new
// array reference, so this never serves stale data). Every analysis request
// after the first for a given `rows` reference only sends a small
// `{datasetId, ...params}` message, not the rows themselves.
const datasetIds = new WeakMap<object, string>();
const registrations = new WeakMap<object, Promise<string>>();
let datasetCounter = 0;

function ensureRegistered(columns: string[], rows: object): Promise<string> {
  const existingId = datasetIds.get(rows);
  if (existingId) return Promise.resolve(existingId);

  const inflight = registrations.get(rows);
  if (inflight) return inflight;

  const datasetId = `ds_${++datasetCounter}`;
  const promise = postToWorker<{ registered: boolean }>({
    type: 'register',
    datasetId,
    columns,
    rows,
  }).then(() => {
    datasetIds.set(rows, datasetId);
    registrations.delete(rows);
    return datasetId;
  });
  registrations.set(rows, promise);
  return promise;
}

/**
 * Proactively register a dataset with the analysis worker before any tab
 * actually needs it — call this as soon as `rows` is available (e.g. right
 * after upload finishes), so the one-time transfer cost overlaps with
 * whatever the user does next instead of happening the moment they first
 * click into a heavy tab like Quality or Pivot.
 */
export function prewarmAnalysisWorker(columns: string[], rows: object): void {
  void ensureRegistered(columns, rows);
}

/** Low-level: call the analysis worker for a dataset already (or about to be) registered. */
async function callRegistered<T>(columns: string[], rows: object, payload: Record<string, unknown>): Promise<T> {
  const datasetId = await ensureRegistered(columns, rows);
  return postToWorker<T>({ datasetId, ...payload });
}

/**
 * React hook: run a worker-backed, dataset-cached computation.
 *
 * `rows` is used both to derive the worker payload AND as the cache key's
 * identity anchor — as long as the same rows array reference is passed in
 * (true across tab remounts unless the data actually changed upstream), the
 * result is read instantly from cache on every call after the first, with
 * zero worker round-trip and zero main-thread recomputation. Registration
 * (see above) is similarly amortized to once per rows reference regardless
 * of how many different `type`s get requested against it.
 */
export function useCachedWorkerAnalysis<T>(
  cacheKey: string | null,
  columns: string[],
  rows: Record<string, unknown>[] | null,
  buildPayload: () => Record<string, unknown>,
  deps: unknown[]
): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>(() => {
    if (rows && cacheKey) {
      const cached = peekCached<T>(rows, cacheKey);
      if (cached !== undefined) return { data: cached, loading: false, error: null };
    }
    return { data: null, loading: !!(rows && cacheKey), error: null };
  });

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!rows || !cacheKey) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const cached = peekCached<T>(rows, cacheKey);
    if (cached !== undefined) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    getCachedAsync<T>(rows, cacheKey, () => callRegistered<T>(columns, rows, buildPayload()))
      .then(data => {
        if (!cancelled && mountedRef.current) setState({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled && mountedRef.current) setState({ data: null, loading: false, error: err.message });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** One-off (non-hook) worker call for imperative flows like "Apply cleaning". */
export function callAnalysisWorkerOnce<T>(columns: string[], rows: Record<string, unknown>[], payload: Record<string, unknown>): Promise<T> {
  return callRegistered<T>(columns, rows, payload);
}
