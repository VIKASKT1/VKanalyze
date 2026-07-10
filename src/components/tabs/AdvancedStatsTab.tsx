import { memo, useState, useMemo } from 'react';
import { BarChart2, TrendingUp, Activity, Search, Loader2 } from 'lucide-react';
import type { ColumnStats } from '../../lib/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { sampleRowsForVisualization } from '../../lib/histogram';
import { useCachedWorkerAnalysis } from '../../hooks/useAnalysisWorker';

interface Props {
  columns: Array<{ name: string; type: string }>;
  statistics: Record<string, ColumnStats>;
  rows: Record<string, unknown>[];
}

function buildHistogramBins(nums: number[], bins = 10) {
  if (nums.length === 0) return [];
  const min = nums.reduce((a, b) => a < b ? a : b);
  const max = nums.reduce((a, b) => a > b ? a : b);
  if (min === max) return [{ label: String(min), count: nums.length }];
  const binWidth = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of nums) {
    const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
    counts[idx]++;
  }
  return counts.map((count, i) => ({
    label: (min + i * binWidth).toFixed(1),
    count,
  }));
}

function fmt(v: number | null | undefined, decimals = 3): string {
  if (v == null || isNaN(v)) return 'N/A';
  return v.toFixed(decimals);
}

interface AdvStatsResult {
  mean: number; variance: number; stdDev: number; q1: number; q2: number; q3: number;
  iqr: number; p10: number; p90: number; skewness: number; kurtosis: number; min: number; max: number;
}

// RENDER PERF FIX: `rows`/`columns` here come from DataFlowApp's stable
// `currentRows`/`columnObjects` memoized references, so wrapping in
// React.memo lets this skip re-rendering on unrelated parent state changes.
//
// COMPUTATION FIX: `advStats` below computes mean/variance/stdDev/
// percentiles/skewness/kurtosis over the FULL `rows` array (correctly —
// sampling would make these numbers wrong, per the note at its call site)
// every time the user selects a different column to inspect. This now runs
// in the shared analysis worker (already used by Data Quality/Analytics/
// Pivot), cached by dataset identity + selected column, via the same
// useCachedWorkerAnalysis hook those tabs use. The statistical formulas
// themselves are unchanged — see analysis.worker.ts's
// `computeAdvancedStats`, a byte-for-byte copy of what used to run here
// directly. A small loading state now shows in the stats panel while a
// newly-selected column's statistics are computing.
function AdvancedStatsTab({ columns, statistics, rows }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const numericCols = columns.filter(c => c.type === 'number');
  const filtered = numericCols.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const currentCol = selected ?? filtered[0]?.name ?? null;

  // Statistics (mean, stdDev, percentiles, skewness, kurtosis) must reflect
  // the TRUE full dataset, so this intentionally still uses `rows` as-is —
  // only WHERE the computation runs has moved (worker instead of main
  // thread), not what it computes over.
  const advColumns = useMemo(() => columns.map(c => c.name), [columns]);
  const { data: advStats, loading: advStatsLoading } = useCachedWorkerAnalysis<AdvStatsResult | null>(
    currentCol ? `advstats:${currentCol}` : null,
    advColumns,
    rows,
    () => ({ type: 'advanced-stats', column: currentCol as string }),
    [currentCol, rows, advColumns]
  );

  // Chart rendering only ever needs a bounded number of points — sampling
  // here keeps the histogram bar chart fast and crash-free on 100k-1M+ row
  // datasets without touching the statistics computed above.
  const visualRows = useMemo(
    () => sampleRowsForVisualization(rows, 10000),
    [rows]
  );

  const histData = useMemo(() => {
    if (!currentCol) return [];
    const nums = visualRows.map(r => Number(r[currentCol])).filter(n => !isNaN(n));
    return buildHistogramBins(nums);
  }, [currentCol, visualRows]);

  if (numericCols.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-paper-dim">
        <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
        <p>No numeric columns found for advanced statistics.</p>
      </div>
    );
  }

  const skewnessLabel = (s: number) => {
    if (Math.abs(s) < 0.5) return { text: 'Approximately Symmetric', color: 'text-emerald-400' };
    if (s > 0.5) return { text: 'Right-Skewed (positive)', color: 'text-amber-400' };
    return { text: 'Left-Skewed (negative)', color: 'text-amber-400' };
  };

  const kurtosisLabel = (k: number) => {
    if (Math.abs(k) < 0.5) return { text: 'Mesokurtic (normal)', color: 'text-emerald-400' };
    if (k > 0.5) return { text: 'Leptokurtic (heavy tails)', color: 'text-amber-400' };
    return { text: 'Platykurtic (light tails)', color: 'text-accent-bright' };
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-paper">Advanced Statistics</h2>
        <p className="text-sm text-paper-dim mt-0.5">Deep statistical analysis: variance, quartiles, percentiles, skewness, kurtosis</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Column selector */}
        <div className="sm:w-56 bg-ink-surface border border-ink-border rounded-xl overflow-hidden flex-shrink-0">
          <div className="p-3 border-b border-ink-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-paper-dim absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search columns…"
                className="w-full bg-ink-raised text-paper text-xs rounded-lg pl-8 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent placeholder-paper-dimmer"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-64">
            {filtered.map(col => (
              <button
                key={col.name}
                onClick={() => setSelected(col.name)}
                className={`w-full text-left px-3 py-2.5 text-sm transition border-b border-ink-border/50 last:border-0 ${
                  currentCol === col.name ? 'bg-accent/10 text-accent-bright' : 'text-paper-dim hover:text-paper hover:bg-ink-raised'
                }`}
              >
                <div className="font-medium truncate">{col.name}</div>
                <div className="text-xs text-paper-dim mt-0.5">
                  mean: {fmt(statistics[col.name]?.mean, 2)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Stats panel */}
        {advStats && currentCol ? (
          <div className="flex-1 space-y-4">
            {/* Core stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Mean', value: fmt(advStats.mean) },
                { label: 'Std Dev', value: fmt(advStats.stdDev) },
                { label: 'Variance', value: fmt(advStats.variance) },
                { label: 'IQR', value: fmt(advStats.iqr) },
                { label: 'Min', value: fmt(advStats.min) },
                { label: 'Q1 (25%)', value: fmt(advStats.q1) },
                { label: 'Median (Q2)', value: fmt(advStats.q2) },
                { label: 'Q3 (75%)', value: fmt(advStats.q3) },
                { label: 'Max', value: fmt(advStats.max) },
                { label: 'P10', value: fmt(advStats.p10) },
                { label: 'P90', value: fmt(advStats.p90) },
                { label: 'Range', value: fmt(advStats.max - advStats.min) },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 bg-ink-surface border border-ink-border rounded-xl">
                  <div className="text-xs text-paper-dim mb-0.5">{label}</div>
                  <div className="text-sm font-bold text-paper tabular-nums">{value}</div>
                </div>
              ))}
            </div>

            {/* Distribution info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-ink-surface border border-ink-border rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-accent-bright" />
                  <span className="text-sm font-semibold text-paper">Skewness</span>
                  <span className="text-lg font-bold text-paper ml-auto tabular-nums">{fmt(advStats.skewness)}</span>
                </div>
                <span className={`text-xs font-medium ${skewnessLabel(advStats.skewness).color}`}>
                  {skewnessLabel(advStats.skewness).text}
                </span>
                <p className="text-xs text-paper-dim mt-1">
                  {Math.abs(advStats.skewness) < 0.5
                    ? 'Values are roughly symmetrically distributed around the mean.'
                    : advStats.skewness > 0
                    ? 'Distribution has a longer right tail — more high-value outliers.'
                    : 'Distribution has a longer left tail — more low-value outliers.'}
                </p>
              </div>
              <div className="p-4 bg-ink-surface border border-ink-border rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-paper">Kurtosis</span>
                  <span className="text-lg font-bold text-paper ml-auto tabular-nums">{fmt(advStats.kurtosis)}</span>
                </div>
                <span className={`text-xs font-medium ${kurtosisLabel(advStats.kurtosis).color}`}>
                  {kurtosisLabel(advStats.kurtosis).text}
                </span>
                <p className="text-xs text-paper-dim mt-1">
                  {Math.abs(advStats.kurtosis) < 0.5
                    ? 'Distribution has normal tail weight (similar to a bell curve).'
                    : advStats.kurtosis > 0
                    ? 'Distribution has heavier tails — extreme values are more frequent than expected.'
                    : 'Distribution has lighter tails — extreme values are less frequent than expected.'}
                </p>
              </div>
            </div>

            {/* Histogram */}
            <div className="bg-ink-surface border border-ink-border rounded-xl p-5">
              <h4 className="text-sm font-semibold text-paper mb-4">Distribution — {currentCol}</h4>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={histData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #2A2E3A', borderRadius: '8px', color: '#f1f5f9' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="count" fill="#5B8DEF" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-paper-dim">
            {advStatsLoading && currentCol ? (
              <p className="text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Computing statistics for {currentCol}…
              </p>
            ) : (
              <p className="text-sm">Select a column to view advanced statistics</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(AdvancedStatsTab);
