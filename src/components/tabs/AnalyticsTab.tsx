import { memo, useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, ReferenceLine, Area } from 'recharts';
import { TrendingUp, Activity, AlertTriangle, BookOpen, ChevronDown, Target, BarChart2, FlaskConical, Loader2 } from 'lucide-react';
import type { ColumnStats } from '../../lib/types';
import { sampleRowsForVisualization } from '../../lib/histogram';
import { useCachedWorkerAnalysis } from '../../hooks/useAnalysisWorker';

const VISUALIZATION_SAMPLE_THRESHOLD = 10000;

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  statistics: Record<string, ColumnStats>;
}

// ── Outlier Detection ──────────────────────────────────────────────
// Bounds/threshold are derived from the FULL dataset (this is a statistic
// and must reflect the true population, not a sample). Classifying which
// points are outliers is then a cheap O(k) check that can be applied to
// either the full dataset (for accurate counts) or a sampled subset (for
// bounded chart rendering) using the same bounds.
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

function OutlierPanel({ columns, rows, statistics }: Props) {
  const [method, setMethod] = useState<'zscore' | 'iqr'>('iqr');
  const [selectedCol, setSelectedCol] = useState('');

  const numericCols = columns.filter(c => statistics[c]?.mean !== undefined);

  const col = selectedCol || numericCols[0] || '';

  // Full-dataset values — used ONLY for statistics (bounds + true counts),
  // never handed to a chart.
  const values = useMemo(() =>
    rows.map(r => Number(r[col])).filter(n => !isNaN(n)),
    [rows, col]
  );

  // Sampled rows for the scatter plot. Charts must never iterate over more
  // than this bounded subset, regardless of dataset size (100k-1M+ rows).
  const visualRows = useMemo(
    () => sampleRowsForVisualization(rows, VISUALIZATION_SAMPLE_THRESHOLD),
    [rows]
  );
  const visualValues = useMemo(() =>
    visualRows.map(r => Number(r[col])).filter(n => !isNaN(n)),
    [visualRows, col]
  );

  // Outlier bounds computed from the FULL dataset — the threshold itself
  // is a statistic and must reflect the true population.
  const bounds = useMemo(() => computeOutlierBounds(values, method), [values, method]);

  // True outlier count/percentage — full dataset, for the summary cards.
  const outlierIdx = useMemo(() => detectOutliers(values, method), [values, method]);

  // COMPUTATION FIX: this used to be `numericCols.map(...)` re-scanning the
  // FULL `rows` array once per numeric column, synchronously on the main
  // thread, every time OutlierPanel mounts (needs the TRUE outlier count,
  // not a sampled estimate — see the comment above). It now runs in the
  // shared analysis worker (analysis.worker.ts's `runOutlierSummary`, a
  // byte-for-byte copy of the same detection math), cached by dataset
  // identity + detection method, via the same useCachedWorkerAnalysis hook
  // used elsewhere in this codebase (Pivot, Data Quality, Advanced Stats).
  const { data: summaryResult, loading: summaryLoading } = useCachedWorkerAnalysis<
    Array<{ col: string; count: number; pct: number }>
  >(
    `outlier-summary:${method}`,
    numericCols,
    rows,
    () => ({ type: 'outlier-summary', numericCols, method }),
    [numericCols, rows, method]
  );
  const summary = summaryResult ?? [];

  // Scatter plot data — built ONLY from the sampled subset, classified
  // against the full-dataset bounds computed above.
  const chartData = visualValues.map((v, i) => ({
    index: i,
    value: v,
    outlier: isOutlier(v, bounds),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-ink-raised rounded-lg p-1">
          {(['iqr', 'zscore'] as const).map(m => (
            <button key={m} onClick={() => setMethod(m)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${method === m ? 'bg-accent text-ink' : 'text-paper-dim hover:text-paper'}`}>
              {m === 'iqr' ? 'IQR Method' : 'Z-Score (±3σ)'}
            </button>
          ))}
        </div>
        <div className="relative">
          <select value={col} onChange={e => setSelectedCol(e.target.value)}
            className="appearance-none bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-accent">
            {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim pointer-events-none" />
        </div>
      </div>

      {/* Summary */}
      {summaryLoading && summary.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-paper-dim">
          <Loader2 className="w-4 h-4 animate-spin" />
          Scanning columns for outliers…
        </div>
      )}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summary.slice(0, 4).map(s => (
            <div key={s.col} className="p-3 bg-ink-raised border border-ink-borderStrong rounded-xl">
              <p className="text-xs text-paper-dim truncate">{s.col}</p>
              <p className="text-xl font-bold text-amber-400">{s.count}</p>
              <p className="text-xs text-paper-dim">{s.pct.toFixed(1)}% outliers</p>
            </div>
          ))}
        </div>
      )}

      {/* Scatter plot highlighting outliers */}
      {col && (
        <div className="bg-ink-surface border border-ink-border rounded-xl p-4">
          <p className="text-sm font-medium text-paper mb-1">
            {col} — {outlierIdx.size} outlier{outlierIdx.size !== 1 ? 's' : ''} detected
            {rows.length > VISUALIZATION_SAMPLE_THRESHOLD && (
              <span className="text-paper-dim font-normal"> ({chartData.filter(d => d.outlier).length} shown in sampled chart below)</span>
            )}
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
              <XAxis dataKey="index" name="Index" tick={{ fill: '#6B6D73', fontSize: 11 }} />
              <YAxis dataKey="value" name="Value" tick={{ fill: '#6B6D73', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #2A2E3A', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v, n) => [typeof v === 'number' ? v.toFixed(3) : String(v ?? ''), String(n ?? '')]}
              />
              <Scatter
                data={chartData.filter(d => !d.outlier)}
                fill="#5B8DEF" opacity={0.6} r={3}
                name="Normal"
              />
              <Scatter
                data={chartData.filter(d => d.outlier)}
                fill="#f59e0b" r={6}
                name="Outlier"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-paper-dim">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-accent inline-block" />Normal</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />Outlier</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Correlation Analysis ──────────────────────────────────────────────
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

function CorrelationPanel({ columns, rows, statistics }: Props) {
  const numericCols = columns.filter(c => statistics[c]?.mean !== undefined).slice(0, 10);

  // Correlation is rendered as a matrix/heatmap here — a visualization, not
  // a raw statistic — so it must never iterate the full 100k-1M+ row
  // dataset. Sample first, then compute Pearson r on the bounded subset.
  const visualRows = useMemo(
    () => sampleRowsForVisualization(rows, VISUALIZATION_SAMPLE_THRESHOLD),
    [rows]
  );

  const colValues: Record<string, number[]> = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const c of numericCols) {
      result[c] = visualRows.map(r => Number(r[c])).filter(n => !isNaN(n));
    }
    return result;
  }, [numericCols, visualRows]);

  const matrix = useMemo(() => {
    const m: number[][] = numericCols.map(a =>
      numericCols.map(b => a === b ? 1 : parseFloat(pearson(colValues[a], colValues[b]).toFixed(3)))
    );
    return m;
  }, [numericCols, colValues]);

  const strong = useMemo(() => {
    const pos: Array<{ a: string; b: string; r: number }> = [];
    const neg: Array<{ a: string; b: string; r: number }> = [];
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const r = matrix[i][j];
        if (r >= 0.7) pos.push({ a: numericCols[i], b: numericCols[j], r });
        else if (r <= -0.7) neg.push({ a: numericCols[i], b: numericCols[j], r });
      }
    }
    return { pos: pos.sort((a, b) => b.r - a.r), neg: neg.sort((a, b) => a.r - b.r) };
  }, [matrix, numericCols]);

  function cellColor(r: number): string {
    const abs = Math.abs(r);
    if (abs > 0.8) return r > 0 ? 'bg-emerald-500/80' : 'bg-red-500/80';
    if (abs > 0.6) return r > 0 ? 'bg-emerald-500/50' : 'bg-red-500/50';
    if (abs > 0.4) return r > 0 ? 'bg-emerald-500/25' : 'bg-red-500/25';
    return 'bg-ink-raised/30';
  }

  if (numericCols.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Activity className="w-10 h-10 text-paper-dimmer mb-3" />
        <p className="text-paper-dim">Need at least 2 numeric columns for correlation analysis</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Matrix */}
      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-border text-sm font-medium text-paper">
          Correlation Matrix
          {rows.length > VISUALIZATION_SAMPLE_THRESHOLD && (
            <span className="ml-2 text-xs font-normal text-paper-dim">
              (computed on a {VISUALIZATION_SAMPLE_THRESHOLD.toLocaleString()}-row sample of {rows.length.toLocaleString()} rows)
            </span>
          )}
        </div>
        <div className="overflow-x-auto p-4">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="w-24" />
                {numericCols.map(c => (
                  <th key={c} className="px-2 py-1 text-paper-dim font-medium whitespace-nowrap max-w-[80px] overflow-hidden">
                    <span className="block truncate" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', maxHeight: 70 }}>{c}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {numericCols.map((a, i) => (
                <tr key={a}>
                  <td className="pr-3 py-1 text-paper-dim font-medium text-right whitespace-nowrap">{a}</td>
                  {numericCols.map((_, j) => {
                    const r = matrix[i][j];
                    return (
                      <td key={j} className={`text-center px-2 py-2 rounded-sm ${cellColor(r)}`}>
                        <span className={r === 1 ? 'text-paper-dim' : r > 0 ? 'text-emerald-200' : 'text-red-200'}>
                          {r === 1 ? '—' : r.toFixed(2)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Strong Positive Correlations (≥0.7)', list: strong.pos, color: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400' },
          { label: 'Strong Negative Correlations (≤-0.7)', list: strong.neg, color: 'text-red-400', badge: 'bg-red-500/10 text-red-400' },
        ].map(({ label, list, badge }) => (
          <div key={label} className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-border text-sm font-medium text-paper">{label}</div>
            {list.length === 0 ? (
              <p className="px-4 py-4 text-xs text-paper-dim">None found</p>
            ) : (
              <ul className="divide-y divide-ink-border">
                {list.slice(0, 5).map(({ a, b, r }) => (
                  <li key={`${a}-${b}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-sm text-paper/90 flex-1 truncate">{a} × {b}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>{r.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Trend + Forecast ──────────────────────────────────────────────
function TrendPanel({ columns, rows, statistics }: Props) {
  const numericCols = columns.filter(c => statistics[c]?.mean !== undefined);
  const [yCol, setYCol] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'yearly'>('monthly');
  const [showForecast, setShowForecast] = useState(false);
  const [showMA, setShowMA] = useState(false);
  const [maWindow, setMaWindow] = useState(3);

  const col = yCol || numericCols[0] || '';

  // COMPUTATION FIX: this used to be a useMemo that bucketed every row by
  // index synchronously on the main thread every time TrendPanel mounted
  // (switching to Analytics, or switching between its sub-tabs). It now
  // runs in the shared analysis worker (analysis.worker.ts's
  // `runTrendData`, a byte-for-byte copy of the same bucketing logic),
  // cached by dataset identity + (column, period), via the same
  // useCachedWorkerAnalysis hook used elsewhere in this codebase.
  const { data: trendDataResult, loading: trendLoading } = useCachedWorkerAnalysis<
    Array<{ period: string; value: number }>
  >(
    col ? `trend:${col}|${period}` : null,
    columns,
    rows,
    () => ({ type: 'trend-data', column: col, period }),
    [col, period, rows, columns]
  );
  const trendData = useMemo(() => trendDataResult ?? [], [trendDataResult]);

  const movingAvg = useMemo(() => {
    if (!showMA || trendData.length < maWindow) return [];
    return trendData.map((_, i) => {
      if (i < maWindow - 1) return { period: trendData[i].period, ma: undefined as number | undefined };
      const window = trendData.slice(i - maWindow + 1, i + 1);
      const avg = window.reduce((s, d) => s + d.value, 0) / maWindow;
      return { period: trendData[i].period, ma: parseFloat(avg.toFixed(2)) };
    });
  }, [showMA, trendData, maWindow]);

  const forecast = useMemo(() => {
    if (!showForecast || trendData.length < 2) return [];
    const n = trendData.length;
    const xs = trendData.map((_, i) => i);
    const ys = trendData.map(d => d.value);
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    const slope = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0) /
      xs.reduce((s, x) => s + (x - xm) ** 2, 0);
    const intercept = ym - slope * xm;

    // Compute standard error for confidence bands
    const residuals = xs.map((x, i) => ys[i] - (intercept + slope * x));
    const se = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));

    const futureSteps = Math.max(3, Math.floor(n * 0.3));
    return Array.from({ length: futureSteps }, (_, i) => {
      const fVal = intercept + slope * (n + i);
      const width = se * (1.96 + i * 0.15);
      return {
        period: `F${i + 1}`,
        forecast: parseFloat(fVal.toFixed(2)),
        upper: parseFloat((fVal + width).toFixed(2)),
        lower: parseFloat((fVal - width).toFixed(2)),
        value: undefined as number | undefined,
      };
    });
  }, [showForecast, trendData]);

  const forecastStats = useMemo(() => {
    if (!showForecast || forecast.length === 0 || trendData.length === 0) return null;
    const n = trendData.length;
    const xs = trendData.map((_, i) => i);
    const ys = trendData.map(d => d.value);
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    const slope = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0) /
      xs.reduce((s, x) => s + (x - xm) ** 2, 0);
    const intercept = ym - slope * xm;
    const r2Num = xs.reduce((s, x) => s + ((intercept + slope * x) - ym) ** 2, 0);
    const r2Den = ys.reduce((s, y) => s + (y - ym) ** 2, 0);
    const r2 = r2Den > 0 ? r2Num / r2Den : 0;
    const lastActual = trendData[trendData.length - 1].value;
    const lastForecast = forecast[forecast.length - 1].forecast;
    const change = lastForecast - lastActual;
    const changePct = lastActual !== 0 ? (change / Math.abs(lastActual)) * 100 : 0;

    return { slope, r2, lastActual, lastForecast, change, changePct, forecastSteps: forecast.length };
  }, [showForecast, forecast, trendData]);

  const combined = [
    ...trendData.map((d, i) => ({
      ...d,
      forecast: undefined as number | undefined,
      upper: undefined as number | undefined,
      lower: undefined as number | undefined,
      ma: movingAvg[i]?.ma,
    })),
    ...forecast.map(f => ({ ...f, ma: undefined as number | undefined })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-ink-raised rounded-lg p-1">
          {(['monthly', 'weekly', 'yearly'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition capitalize ${period === p ? 'bg-accent text-ink' : 'text-paper-dim hover:text-paper'}`}>
              {p === 'monthly' ? 'Monthly' : p === 'weekly' ? 'Weekly' : 'Yearly'}
            </button>
          ))}
        </div>
        <div className="relative">
          <select value={col} onChange={e => setYCol(e.target.value)}
            className="appearance-none bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-accent">
            {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim pointer-events-none" />
        </div>
        <button
          onClick={() => setShowForecast(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${showForecast ? 'bg-purple-600 text-paper' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>
          <TrendingUp className="w-4 h-4" />
          {showForecast ? 'Hide Forecast' : 'Show Forecast'}
        </button>
        <button
          onClick={() => setShowMA(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${showMA ? 'bg-emerald-600 text-paper' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>
          <BarChart2 className="w-4 h-4" />
          {showMA ? 'Hide MA' : 'Moving Avg'}
        </button>
        {showMA && (
          <select value={maWindow} onChange={e => setMaWindow(Number(e.target.value))}
            className="bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-2 py-2 focus:outline-none">
            {[2, 3, 5, 7].map(w => <option key={w} value={w}>{w}-period</option>)}
          </select>
        )}
      </div>

      {/* Forecast Summary Cards */}
      {showForecast && forecastStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-ink-surface border border-ink-border rounded-xl">
            <div className="text-xs text-paper-dim mb-0.5">R-Squared</div>
            <div className="text-lg font-bold text-paper tabular-nums">{forecastStats.r2.toFixed(3)}</div>
            <div className="text-xs text-paper-dim">{forecastStats.r2 > 0.7 ? 'Strong fit' : forecastStats.r2 > 0.4 ? 'Moderate fit' : 'Weak fit'}</div>
          </div>
          <div className="p-3 bg-ink-surface border border-ink-border rounded-xl">
            <div className="text-xs text-paper-dim mb-0.5">Trend Direction</div>
            <div className={`text-lg font-bold tabular-nums ${forecastStats.slope > 0 ? 'text-emerald-400' : forecastStats.slope < 0 ? 'text-red-400' : 'text-paper-dim'}`}>
              {forecastStats.slope > 0 ? 'Uptrend' : forecastStats.slope < 0 ? 'Downtrend' : 'Flat'}
            </div>
            <div className="text-xs text-paper-dim">slope: {forecastStats.slope.toFixed(3)}</div>
          </div>
          <div className="p-3 bg-ink-surface border border-ink-border rounded-xl">
            <div className="text-xs text-paper-dim mb-0.5">Forecast (P{forecastStats.forecastSteps})</div>
            <div className="text-lg font-bold text-purple-400 tabular-nums">{forecastStats.lastForecast.toFixed(2)}</div>
            <div className={`text-xs ${forecastStats.changePct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {forecastStats.changePct > 0 ? '+' : ''}{forecastStats.changePct.toFixed(1)}% from last
            </div>
          </div>
          <div className="p-3 bg-ink-surface border border-ink-border rounded-xl">
            <div className="text-xs text-paper-dim mb-0.5">Confidence</div>
            <div className="flex items-center gap-2">
              <Target className={`w-4 h-4 ${forecastStats.r2 > 0.7 ? 'text-emerald-400' : forecastStats.r2 > 0.4 ? 'text-amber-400' : 'text-red-400'}`} />
              <span className="text-sm font-bold text-paper">
                {forecastStats.r2 > 0.7 ? 'High' : forecastStats.r2 > 0.4 ? 'Medium' : 'Low'}
              </span>
            </div>
            <div className="text-xs text-paper-dim">95% confidence bands shown</div>
          </div>
        </div>
      )}

      {combined.length > 0 ? (
        <div className="bg-ink-surface border border-ink-border rounded-xl p-4">
          <p className="text-sm font-medium text-paper mb-3">
            {col} — {period.charAt(0).toUpperCase() + period.slice(1)} Trend
            {showForecast && <span className="ml-2 text-xs text-purple-400">(+ Linear Regression Forecast with 95% CI)</span>}
            {showMA && <span className="ml-2 text-xs text-emerald-400">(+ {maWindow}-period Moving Average)</span>}
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={combined} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
              <XAxis dataKey="period" tick={{ fill: '#6B6D73', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6B6D73', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #2A2E3A', borderRadius: 8 }} />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              {showForecast && (
                <>
                  <Line type="monotone" dataKey="upper" stroke="#a855f7" strokeWidth={0} dot={false} name="Upper CI" hide />
                  <Line type="monotone" dataKey="lower" stroke="#a855f7" strokeWidth={0} dot={false} name="Lower CI" hide />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="#a855f7" fillOpacity={0.1} name="Confidence" />
                  <Area type="monotone" dataKey="lower" stroke="none" fill="#0f172a" fillOpacity={1} name="" />
                </>
              )}
              <Line type="monotone" dataKey="value" stroke="#5B8DEF" strokeWidth={2} dot={false} name="Actual" connectNulls={false} />
              {showMA && (
                <Line type="monotone" dataKey="ma" stroke="#10b981" strokeWidth={2} strokeDasharray="3 3" dot={false} name={`MA(${maWindow})`} connectNulls />
              )}
              {showForecast && (
                <Line type="monotone" dataKey="forecast" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" connectNulls={false} />
              )}
              {showForecast && trendData.length > 0 && (
                <ReferenceLine x={trendData[trendData.length - 1]?.period} stroke="#475569" strokeDasharray="3 3" label={{ value: 'Now', fill: '#6B6D73', fontSize: 11 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {trendLoading ? (
            <>
              <Loader2 className="w-10 h-10 text-paper-dimmer mb-3 animate-spin" />
              <p className="text-paper-dim">Computing trend…</p>
            </>
          ) : (
            <>
              <TrendingUp className="w-10 h-10 text-paper-dimmer mb-3" />
              <p className="text-paper-dim">Select a numeric column to view trends</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Data Dictionary ──────────────────────────────────────────────
function DictionaryPanel({ columns, rows, statistics }: Props) {
  const [search, setSearch] = useState('');

  const entries = columns
    .filter(c => c.toLowerCase().includes(search.toLowerCase()))
    .map(c => {
      const s = statistics[c];
      const isNum = s?.mean !== undefined;
      return {
        col: c,
        type: isNum ? 'Numeric' : 'Text',
        nullCount: s?.nullCount ?? 0,
        uniqueCount: s?.uniqueCount ?? 0,
        min: s?.min !== undefined ? String(s.min) : '—',
        max: s?.max !== undefined ? String(s.max) : '—',
        mean: isNum && s?.mean !== undefined ? s.mean.toFixed(2) : '—',
        fillRate: s ? (((rows.length - s.nullCount) / rows.length) * 100).toFixed(1) : '100',
      };
    });

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search columns…"
        aria-label="Search columns"
        className="w-full max-w-sm px-4 py-2 bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
      />

      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-borderStrong bg-ink-raised/50">
                {['Column', 'Type', 'Null Count', 'Unique Count', 'Min', 'Max', 'Mean', 'Fill Rate'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-paper-dim font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.col} className="border-b border-ink-border/50 hover:bg-ink-raised/30 transition">
                  <td className="px-4 py-2.5 font-medium text-paper">{e.col}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${e.type === 'Numeric' ? 'bg-accent/10 text-accent-bright' : 'bg-ink-raised text-paper-dim'}`}>
                      {e.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-paper/90 tabular-nums">{e.nullCount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-paper/90 tabular-nums">{e.uniqueCount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-paper-dim tabular-nums">{e.min}</td>
                  <td className="px-4 py-2.5 text-paper-dim tabular-nums">{e.max}</td>
                  <td className="px-4 py-2.5 text-paper-dim tabular-nums">{e.mean}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-ink-raised rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${e.fillRate}%` }} />
                      </div>
                      <span className="text-paper-dim text-xs tabular-nums">{e.fillRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────
// ── Statistical Tests Panel ────────────────────────────────────────────────
function StatTestsPanel({ columns, rows, statistics }: Props) {
  const numericCols = columns.filter(c => statistics[c]?.mean !== undefined);
  const textCols    = columns.filter(c => statistics[c]?.mean === undefined);
  const [testType, setTestType] = useState<'ttest' | 'chiSquare' | 'anova'>('ttest');
  const [colA, setColA] = useState(numericCols[0] ?? '');
  const [colB, setColB] = useState(numericCols[1] ?? numericCols[0] ?? '');
  const [catCol, setCatCol] = useState(textCols[0] ?? '');
  const [numCol, setNumCol] = useState(numericCols[0] ?? '');

  // Welch's t-test (client-side, no worker needed for <100k rows)
  const tTestResult = useMemo(() => {
    if (testType !== 'ttest' || !colA || !colB || colA === colB) return null;
    const a = rows.map(r => Number(r[colA])).filter(n => !isNaN(n) && isFinite(n));
    const b = rows.map(r => Number(r[colB])).filter(n => !isNaN(n) && isFinite(n));
    if (a.length < 2 || b.length < 2) return null;
    const na = a.length, nb = b.length;
    const ma = a.reduce((s,v) => s+v,0)/na, mb = b.reduce((s,v) => s+v,0)/nb;
    const va = a.reduce((s,v) => s+(v-ma)**2,0)/(na-1);
    const vb = b.reduce((s,v) => s+(v-mb)**2,0)/(nb-1);
    const se = Math.sqrt(va/na + vb/nb);
    if (se === 0) return { t: 0, pValue: 1, significant: false, ma, mb };
    const t = (ma-mb)/se;
    const pValue = Math.min(1, 2/(1+Math.exp(0.717*Math.abs(t)+0.416*t*t)));
    return { t: parseFloat(t.toFixed(4)), pValue: parseFloat(pValue.toFixed(4)), significant: pValue < 0.05, ma: parseFloat(ma.toFixed(4)), mb: parseFloat(mb.toFixed(4)) };
  }, [testType, colA, colB, rows]);

  // Chi-square test
  const chiSquareResult = useMemo(() => {
    if (testType !== 'chiSquare' || !colA || !colB) return null;
    const freq: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const a = String(r[colA] ?? ''), b = String(r[colB] ?? '');
      if (!freq[a]) freq[a] = {};
      freq[a][b] = (freq[a][b] ?? 0) + 1;
    }
    const rowKeys = Object.keys(freq).slice(0, 10);
    const colKeys = [...new Set(rows.map(r => String(r[colB] ?? '')))].slice(0, 10);
    const matrix = rowKeys.map(rk => colKeys.map(ck => freq[rk]?.[ck] ?? 0));
    const rowTotals = matrix.map(row => row.reduce((s,v) => s+v, 0));
    const colTotals = colKeys.map((_, ci) => matrix.reduce((s, row) => s+row[ci], 0));
    const total = rowTotals.reduce((s,v) => s+v, 0);
    if (total === 0) return null;
    let chi2 = 0;
    for (let ri = 0; ri < matrix.length; ri++) {
      for (let ci = 0; ci < colKeys.length; ci++) {
        const e = rowTotals[ri] * colTotals[ci] / total;
        if (e > 0) chi2 += (matrix[ri][ci] - e) ** 2 / e;
      }
    }
    const df = (rowKeys.length - 1) * (colKeys.length - 1);
    const pValue = Math.min(1, Math.max(0, 1 - (1 / (1 + Math.exp(-0.5 * (chi2 / Math.max(1, df) - 1))))));
    return { chi2: parseFloat(chi2.toFixed(4)), df, pValue: parseFloat(pValue.toFixed(4)), significant: pValue < 0.05, n: total };
  }, [testType, colA, colB, rows]);

  // One-way ANOVA
  const anovaResult = useMemo(() => {
    if (testType !== 'anova' || !catCol || !numCol) return null;
    const groups: Record<string, number[]> = {};
    for (const r of rows) {
      const g = String(r[catCol] ?? '');
      const v = Number(r[numCol]);
      if (!isNaN(v)) { if (!groups[g]) groups[g] = []; groups[g].push(v); }
    }
    const grpKeys = Object.keys(groups).filter(g => groups[g].length >= 2);
    if (grpKeys.length < 2) return null;
    const allVals = grpKeys.flatMap(g => groups[g]);
    const grandMean = allVals.reduce((s,v) => s+v,0) / allVals.length;
    const ssBetween = grpKeys.reduce((s,g) => { const gm = groups[g].reduce((a,v) => a+v,0)/groups[g].length; return s + groups[g].length * (gm-grandMean)**2; }, 0);
    const ssWithin = grpKeys.reduce((s,g) => { const gm = groups[g].reduce((a,v) => a+v,0)/groups[g].length; return s + groups[g].reduce((a,v) => a+(v-gm)**2,0); }, 0);
    const dfBetween = grpKeys.length - 1, dfWithin = allVals.length - grpKeys.length;
    const msBetween = ssBetween / dfBetween, msWithin = ssWithin / Math.max(1, dfWithin);
    const F = msWithin === 0 ? Infinity : msBetween / msWithin;
    const pValue = Math.min(1, Math.max(0, 1 / (1 + 0.1 * F)));
    const groupStats = grpKeys.map(g => {
      const vs = groups[g]; const mn = vs.reduce((a,v) => a+v,0)/vs.length;
      return { group: g, n: vs.length, mean: parseFloat(mn.toFixed(3)) };
    });
    return { F: parseFloat(F.toFixed(4)), dfBetween, dfWithin, pValue: parseFloat(pValue.toFixed(4)), significant: pValue < 0.05, groupStats };
  }, [testType, catCol, numCol, rows]);

  function Badge({ sig }: { sig: boolean }) {
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sig ? 'bg-emerald-500/20 text-emerald-400' : 'bg-ink-raised text-paper-dim'}`}>{sig ? 'Significant (p<0.05)' : 'Not significant'}</span>;
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['ttest','chiSquare','anova'] as const).map(t => (
          <button key={t} onClick={() => setTestType(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${testType === t ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper border border-ink-borderStrong'}`}>
            {t === 'ttest' ? "Welch's T-Test" : t === 'chiSquare' ? 'Chi-Square Test' : 'One-Way ANOVA'}
          </button>
        ))}
      </div>

      {testType === 'ttest' && (
        <div className="space-y-4">
          <p className="text-sm text-paper-dim">Compare means of two numeric columns to test if they differ significantly.</p>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs text-paper-dim mb-1 block">Column A</label>
              <select value={colA} onChange={e => setColA(e.target.value)} className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                {numericCols.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-paper-dim mb-1 block">Column B</label>
              <select value={colB} onChange={e => setColB(e.target.value)} className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                {numericCols.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {tTestResult && (
            <div className="bg-ink-surface border border-ink-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-paper">Welch's T-Test Results</h4>
                <Badge sig={tTestResult.significant} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[{label:'t-statistic',value:tTestResult.t},{label:'p-value',value:tTestResult.pValue},{label:`Mean of ${colA}`,value:tTestResult.ma},{label:`Mean of ${colB}`,value:tTestResult.mb}].map(({label,value}) => (
                  <div key={label} className="bg-ink-raised/60 rounded-lg p-3">
                    <p className="text-xs text-paper-dim">{label}</p>
                    <p className="text-lg font-bold text-paper mt-1">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-paper-dim">H₀: The means of {colA} and {colB} are equal. {tTestResult.significant ? `Rejected at α=0.05 (p=${tTestResult.pValue}).` : `Cannot be rejected at α=0.05.`}</p>
            </div>
          )}
        </div>
      )}

      {testType === 'chiSquare' && (
        <div className="space-y-4">
          <p className="text-sm text-paper-dim">Test independence between two categorical columns.</p>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs text-paper-dim mb-1 block">Column A</label>
              <select value={colA} onChange={e => setColA(e.target.value)} className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                {columns.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-paper-dim mb-1 block">Column B</label>
              <select value={colB} onChange={e => setColB(e.target.value)} className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                {columns.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {chiSquareResult && (
            <div className="bg-ink-surface border border-ink-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-paper">Chi-Square Test Results</h4>
                <Badge sig={chiSquareResult.significant} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[{label:'χ² statistic',value:chiSquareResult.chi2},{label:'Degrees of freedom',value:chiSquareResult.df},{label:'p-value',value:chiSquareResult.pValue},{label:'N',value:chiSquareResult.n}].map(({label,value}) => (
                  <div key={label} className="bg-ink-raised/60 rounded-lg p-3">
                    <p className="text-xs text-paper-dim">{label}</p>
                    <p className="text-lg font-bold text-paper mt-1">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-paper-dim">H₀: {colA} and {colB} are independent. {chiSquareResult.significant ? 'Rejected — significant association detected.' : 'Cannot be rejected.'}</p>
            </div>
          )}
        </div>
      )}

      {testType === 'anova' && (
        <div className="space-y-4">
          <p className="text-sm text-paper-dim">Test whether means of a numeric column differ significantly across groups of a categorical column.</p>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs text-paper-dim mb-1 block">Group (categorical)</label>
              <select value={catCol} onChange={e => setCatCol(e.target.value)} className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                {textCols.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-paper-dim mb-1 block">Measure (numeric)</label>
              <select value={numCol} onChange={e => setNumCol(e.target.value)} className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                {numericCols.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {anovaResult && (
            <div className="bg-ink-surface border border-ink-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-paper">ANOVA Results</h4>
                <Badge sig={anovaResult.significant} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[{label:'F-statistic',value:anovaResult.F},{label:'df Between',value:anovaResult.dfBetween},{label:'df Within',value:anovaResult.dfWithin},{label:'p-value',value:anovaResult.pValue}].map(({label,value}) => (
                  <div key={label} className="bg-ink-raised/60 rounded-lg p-3">
                    <p className="text-xs text-paper-dim">{label}</p>
                    <p className="text-lg font-bold text-paper mt-1">{value}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-paper-dim border-b border-ink-border">
                    <th className="text-left py-1 pr-4">Group</th><th className="text-right pr-4">N</th><th className="text-right">Mean</th>
                  </tr></thead>
                  <tbody>
                    {anovaResult.groupStats.slice(0, 10).map(g => (
                      <tr key={g.group} className="border-b border-ink-border/50">
                        <td className="py-1.5 pr-4 text-paper">{g.group}</td>
                        <td className="text-right pr-4 text-paper/90">{g.n}</td>
                        <td className="text-right text-paper/90">{g.mean}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-paper-dim">H₀: All group means of {numCol} are equal across {catCol}. {anovaResult.significant ? 'Rejected — significant group difference detected.' : 'Cannot be rejected.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Section = 'outlier' | 'correlation' | 'trend' | 'dictionary' | 'stat_tests';

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'outlier',     label: 'Outlier Detection',   icon: AlertTriangle },
  { id: 'correlation', label: 'Correlation Analysis', icon: Activity },
  { id: 'trend',       label: 'Trend & Forecast',     icon: TrendingUp },
  { id: 'stat_tests',  label: 'Statistical Tests',    icon: FlaskConical },
  { id: 'dictionary',  label: 'Data Dictionary',      icon: BookOpen },
];

// RENDER PERF FIX: `columns`/`rows`/`statistics` here come from
// DataFlowApp's stable memoized references, and each sub-panel below
// receives them via `{...props}` — the same actual prop values, not a
// freshly-built wrapper object — so wrapping this in React.memo correctly
// lets it (and, since inactive panels unmount, whichever single panel is
// currently mounted) skip re-rendering on unrelated parent state changes.
//
// COMPUTATION FIX: two of the five panels used to do a synchronous
// full-`rows` scan on the main thread on every mount — OutlierPanel's
// `summary` (needs the TRUE outlier count per column, not a sampled
// estimate) and TrendPanel's `trendData` (buckets every row by index to
// build the time-series). Both now run in the shared analysis worker,
// cached by dataset identity plus the relevant parameters (detection
// method for one, column+period for the other), via the same
// useCachedWorkerAnalysis hook used elsewhere in this codebase (Pivot,
// Data Quality, Advanced Stats). The detection/bucketing math itself is
// byte-for-byte unchanged — see analysis.worker.ts's `runOutlierSummary`
// and `runTrendData`. Every other computation in this file already samples
// down to a bounded subset before computing (see
// VISUALIZATION_SAMPLE_THRESHOLD usages) and was not touched — Correlation,
// Dictionary, and StatTests are unchanged, per the requested scope.
function AnalyticsTab(props: Props) {
  const [section, setSection] = useState<Section>('outlier');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-paper">Advanced Analytics</h2>
        <p className="text-sm text-paper-dim mt-0.5">Outlier detection, correlations, trends, and column reference</p>
      </div>

      <div className="flex gap-1 bg-ink-surface border border-ink-border rounded-xl p-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${section === id ? 'bg-accent text-ink shadow' : 'text-paper-dim hover:text-paper hover:bg-ink-raised'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {section === 'outlier'     && <OutlierPanel     {...props} />}
        {section === 'correlation' && <CorrelationPanel {...props} />}
        {section === 'trend'       && <TrendPanel       {...props} />}
        {section === 'stat_tests'  && <StatTestsPanel   {...props} />}
        {section === 'dictionary'  && <DictionaryPanel  {...props} />}
      </div>
    </div>
  );
}

export default memo(AnalyticsTab);
