/**
 * analysis.worker.ts — off-main-thread home for per-tab heavy computations.
 *
 * Profiled on a 1,000,000-row / 8-column dataset, these all take long enough
 * on the main thread to trigger Chrome's "Page Unresponsive" dialog:
 *   - profileData (statistics + duplicate detection): ~5-7s
 *   - DataQualityTab per-column date/invalid-number scan: ~1.6s
 *   - PivotTab grouping (rowField x colField aggregation): ~0.2-1s+ depending
 *     on cardinality
 *
 * Each of these was previously run synchronously on the main thread, and
 * several tabs re-ran them from scratch on every mount (see dataset-cache.ts
 * for why that happened). This worker is the single place they now run;
 * callers (via useAnalysisWorker.ts) additionally cache the resolved result
 * so a repeat request for the same data never even reaches this worker.
 */

/**
 * analysis.worker.ts — off-main-thread home for per-tab heavy computations.
 *
 * Profiled on a 1,000,000-row / 8-column dataset, these all take long enough
 * on the main thread to trigger Chrome's "Page Unresponsive" dialog:
 *   - profileData (statistics + duplicate detection): ~5-7s
 *   - DataQualityTab per-column date/invalid-number scan: ~1.6s
 *   - PivotTab grouping (rowField x colField aggregation): ~0.2-1s+ depending
 *     on cardinality
 *
 * IMPORTANT — postMessage is not free for large datasets:
 * Sending `rows` to a worker requires the browser to structuredClone it.
 * Profiled cost for 1,000,000 rows / 8 columns: ~3.3 SECONDS, synchronously,
 * on the sending (main) thread, before the postMessage call even returns.
 * That means naively re-sending the full `rows` array on every single
 * analysis request (one send for quality-scan, another for pivot, another
 * for duplicate-count...) would recreate almost the same main-thread block
 * we're trying to eliminate — just moved into "worker setup" instead of
 * "worker computation".
 *
 * FIX: a dataset is registered with this worker ONCE (`register`), which
 * pays the one-time clone cost, and the worker keeps its own reference to
 * those rows in memory afterwards. Every subsequent request (profile,
 * duplicate-count, quality-scan, pivot — regardless of how many different
 * ones get requested, or how many times) references the dataset by a small
 * `datasetId` string instead of re-sending the rows. See
 * useAnalysisWorker.ts for the main-thread side of this (it registers a
 * given `rows` array reference at most once, proactively, as soon as it's
 * available — not only when a tab first needs it).
 */

import { profileData, countDuplicateRows } from '../lib/data-processing';
import type { ColumnStats } from '../lib/types';

type Row = Record<string, unknown>;

const datasets = new Map<string, { columns: string[]; rows: Row[] }>();

interface QualityIssue {
  type: string;
  col: string;
  count: number;
  pct: number;
  severity: 'critical' | 'warning' | 'info';
}

function isLikelyDate(vals: unknown[]): boolean {
  const sample = vals.filter(v => v !== null && v !== undefined && v !== '').slice(0, 20);
  if (sample.length === 0) return false;
  const dateCount = sample.filter(v => {
    const d = new Date(String(v));
    return !isNaN(d.getTime()) && String(v).match(/\d{2,4}[-/]\d{1,2}[-/]\d{1,4}/);
  }).length;
  return dateCount > sample.length * 0.6;
}

function countInvalidDates(vals: unknown[]): number {
  const nonNull = vals.filter(v => v !== null && v !== undefined && v !== '');
  return nonNull.filter(v => isNaN(new Date(String(v)).getTime())).length;
}

function countInvalidNumbers(vals: unknown[]): number {
  const nonNull = vals.filter(v => v !== null && v !== undefined && v !== '');
  return nonNull.filter(v => {
    const n = Number(v);
    return !isNaN(n) && !isFinite(n);
  }).length;
}

function runQualityScan(columns: string[], rows: Row[], statistics: Record<string, ColumnStats>) {
  const issues: QualityIssue[] = [];
  const dateColumns: string[] = [];
  const numberIssues: Array<{ col: string; count: number }> = [];

  for (const col of columns) {
    const vals = rows.map(r => r[col]);
    const s = statistics[col];

    if (s && s.nullCount > 0) {
      const pct = (s.nullCount / rows.length) * 100;
      issues.push({ type: 'missing', col, count: s.nullCount, pct, severity: pct > 30 ? 'critical' : pct > 10 ? 'warning' : 'info' });
    }

    if (isLikelyDate(vals)) {
      dateColumns.push(col);
      const invalid = countInvalidDates(vals);
      if (invalid > 0) issues.push({ type: 'invalid_date', col, count: invalid, pct: (invalid / rows.length) * 100, severity: 'warning' });
    }

    const infCount = countInvalidNumbers(vals);
    if (infCount > 0) {
      numberIssues.push({ col, count: infCount });
      issues.push({ type: 'invalid_number', col, count: infCount, pct: (infCount / rows.length) * 100, severity: 'warning' });
    }
  }

  return { issues, dateColumns, numberIssues };
}

type AggFn = 'sum' | 'avg' | 'count' | 'min' | 'max';

function aggregate(vals: number[], fn: AggFn): number {
  if (vals.length === 0) return 0;
  switch (fn) {
    case 'sum': return vals.reduce((a, b) => a + b, 0);
    case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length;
    case 'count': return vals.length;
    case 'min': return vals.reduce((a, b) => (a < b ? a : b));
    case 'max': return vals.reduce((a, b) => (a > b ? a : b));
  }
}

function runPivot(rows: Row[], rowField: string, colField: string | null, valueField: string, aggFn: AggFn) {
  const rowKeys = [...new Set(rows.map(r => String(r[rowField] ?? '(blank)')))].sort();
  const colKeys = colField ? [...new Set(rows.map(r => String(r[colField] ?? '(blank)')))].sort() : ['Value'];

  const matrix: Record<string, Record<string, number[]>> = {};
  for (const rk of rowKeys) {
    matrix[rk] = {};
    for (const ck of colKeys) matrix[rk][ck] = [];
  }

  for (const row of rows) {
    const rk = String(row[rowField] ?? '(blank)');
    const ck = colField ? String(row[colField] ?? '(blank)') : 'Value';
    const val = Number(row[valueField]);
    if (!isNaN(val)) {
      if (!matrix[rk]) matrix[rk] = {};
      if (!matrix[rk][ck]) matrix[rk][ck] = [];
      matrix[rk][ck].push(val);
    }
  }

  const data = rowKeys.map(rk => {
    const row: Record<string, string | number> = { __row: rk };
    let rowTotal = 0;
    for (const ck of colKeys) {
      const agg = aggregate(matrix[rk][ck] ?? [], aggFn);
      row[ck] = agg;
      rowTotal += aggFn === 'count' ? (matrix[rk][ck]?.length ?? 0) : agg;
    }
    row.__total = aggFn === 'avg' ? aggregate(Object.values(matrix[rk]).flat(), aggFn) : rowTotal;
    return row;
  });

  const totalsRow: Record<string, string | number> = { __row: 'Total' };
  for (const ck of colKeys) {
    const allVals = rowKeys.flatMap(rk => matrix[rk][ck] ?? []);
    totalsRow[ck] = aggregate(allVals, aggFn);
  }

  return { rowKeys, colKeys, data, totalsRow };
}

// ── Preview: filter + sort ──────────────────────────────────────────────
// Byte-for-byte the same tie-breaking/comparison logic that previously ran
// synchronously inside PreviewTab's `filtered` useMemo on the main thread:
// case-insensitive substring match across all columns, then (if a sort
// column is set) a stable numeric-vs-string comparison with the same
// asc/desc flip. Only WHERE this runs changed (worker instead of main
// thread) — see useAnalysisWorker.ts / PreviewTab.tsx for the caller side.
function runPreviewFilterSort(
  columns: string[],
  rows: Row[],
  search: string,
  sortCol: string | null,
  sortDir: 'asc' | 'desc'
): Row[] {
  let r = rows;
  if (search.trim()) {
    const q = search.toLowerCase();
    r = r.filter(row => columns.some(c => String(row[c] ?? '').toLowerCase().includes(q)));
  }
  if (sortCol) {
    r = [...r].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      const an = Number(av), bn = Number(bv);
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }
  return r;
}

// ── Advanced Stats ───────────────────────────────────────────────────────
// Byte-for-byte the same mean/variance/stdDev/percentile/skewness/kurtosis
// math that previously ran synchronously inside AdvancedStatsTab's
// `advStats` useMemo on the main thread. Only WHERE this runs changed.
function computeAdvancedStats(nums: number[]) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = nums.reduce((s, v) => s + v, 0) / n;
  const variance = n >= 2 ? nums.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  function percentile(p: number) {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
  }

  const q1 = percentile(25);
  const q2 = percentile(50);
  const q3 = percentile(75);
  const iqr = q3 - q1;
  const p10 = percentile(10);
  const p90 = percentile(90);

  let skewness = 0;
  if (stdDev > 0 && n >= 3) {
    const m3 = nums.reduce((s, v) => s + Math.pow(v - mean, 3), 0) / n;
    skewness = m3 / Math.pow(stdDev, 3);
  }

  let kurtosis = 0;
  if (stdDev > 0 && n >= 4) {
    const m4 = nums.reduce((s, v) => s + Math.pow(v - mean, 4), 0) / n;
    kurtosis = m4 / Math.pow(stdDev, 4) - 3;
  }

  return {
    mean, variance, stdDev, q1, q2, q3, iqr, p10, p90, skewness, kurtosis,
    min: sorted[0], max: sorted[n - 1],
  };
}

// ── Analytics: Outlier summary + Trend bucketing ─────────────────────────
// Byte-for-byte the same outlier-detection math and trend-bucketing logic
// that previously ran synchronously inside AnalyticsTab's OutlierPanel
// (`summary`) and TrendPanel (`trendData`) on the main thread. Only WHERE
// this runs changed.
function computeOutlierBounds(values: number[], method: 'zscore' | 'iqr') {
  if (values.length < 4) return null;
  if (method === 'zscore') {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    if (std === 0) return null;
    return { kind: 'zscore' as const, mean, std };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return { kind: 'iqr' as const, lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr };
}

function isOutlier(v: number, bounds: ReturnType<typeof computeOutlierBounds>): boolean {
  if (!bounds) return false;
  if (bounds.kind === 'zscore') return Math.abs((v - bounds.mean) / bounds.std) > 3;
  return v < bounds.lower || v > bounds.upper;
}

function detectOutliers(values: number[], method: 'zscore' | 'iqr'): Set<number> {
  const bounds = computeOutlierBounds(values, method);
  const indices = new Set<number>();
  if (!bounds) return indices;
  values.forEach((v, i) => { if (isOutlier(v, bounds)) indices.add(i); });
  return indices;
}

function runOutlierSummary(numericCols: string[], rows: Row[], method: 'zscore' | 'iqr') {
  return numericCols.map(c => {
    const vals = rows.map(r => Number(r[c])).filter(n => !isNaN(n));
    const idx = detectOutliers(vals, method);
    return { col: c, count: idx.size, pct: vals.length > 0 ? (idx.size / vals.length) * 100 : 0 };
  }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
}

function runTrendData(rows: Row[], col: string, period: 'monthly' | 'weekly' | 'yearly') {
  const vals = rows
    .map((r, i) => ({ i, v: Number(r[col]) }))
    .filter(d => !isNaN(d.v));
  if (vals.length === 0) return [];

  const bucketSize = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 365;
  const buckets: Record<number, number[]> = {};
  vals.forEach(({ i, v }) => {
    const bucket = Math.floor(i / bucketSize);
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(v);
  });

  return Object.entries(buckets).map(([k, vs]) => ({
    period: `P${Number(k) + 1}`,
    value: parseFloat((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)),
  }));
}

type Request =
  | { id: number; type: 'register'; datasetId: string; columns: string[]; rows: Row[] }
  | { id: number; type: 'profile'; datasetId: string }
  | { id: number; type: 'duplicate-count'; datasetId: string }
  | { id: number; type: 'quality-scan'; datasetId: string; statistics: Record<string, ColumnStats> }
  | { id: number; type: 'pivot'; datasetId: string; rowField: string; colField: string | null; valueField: string; aggFn: AggFn }
  | { id: number; type: 'preview-filter-sort'; datasetId: string; search: string; sortCol: string | null; sortDir: 'asc' | 'desc' }
  | { id: number; type: 'advanced-stats'; datasetId: string; column: string }
  | { id: number; type: 'outlier-summary'; datasetId: string; numericCols: string[]; method: 'zscore' | 'iqr' }
  | { id: number; type: 'trend-data'; datasetId: string; column: string; period: 'monthly' | 'weekly' | 'yearly' };

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    let result: unknown;
    switch (req.type) {
      case 'register':
        // One-time (per dataset) structuredClone cost is paid right here,
        // when this message is received — but only ONCE per dataset,
        // regardless of how many different analysis types get requested
        // against it afterwards.
        datasets.set(req.datasetId, { columns: req.columns, rows: req.rows });
        result = { registered: true };
        break;
      case 'profile': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        result = profileData(ds.columns, ds.rows);
        break;
      }
      case 'duplicate-count': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        result = countDuplicateRows(ds.rows);
        break;
      }
      case 'quality-scan': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        result = runQualityScan(ds.columns, ds.rows, req.statistics);
        break;
      }
      case 'pivot': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        result = runPivot(ds.rows, req.rowField, req.colField, req.valueField, req.aggFn);
        break;
      }
      case 'preview-filter-sort': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        result = runPreviewFilterSort(ds.columns, ds.rows, req.search, req.sortCol, req.sortDir);
        break;
      }
      case 'advanced-stats': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        const nums = ds.rows.map(r => Number(r[req.column])).filter(n => !isNaN(n));
        result = computeAdvancedStats(nums);
        break;
      }
      case 'outlier-summary': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        result = runOutlierSummary(req.numericCols, ds.rows, req.method);
        break;
      }
      case 'trend-data': {
        const ds = datasets.get(req.datasetId);
        if (!ds) throw new Error('Dataset not registered: ' + req.datasetId);
        result = runTrendData(ds.rows, req.column, req.period);
        break;
      }
    }
    self.postMessage({ id: req.id, type: 'result', result });
  } catch (err) {
    self.postMessage({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
