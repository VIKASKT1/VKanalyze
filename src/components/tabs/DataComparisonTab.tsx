import { useState } from 'react';
import {
  GitCompare, Upload, TrendingUp, TrendingDown, Minus, AlertCircle,
} from 'lucide-react';
import { parseFile } from '../../lib/data-processing';
import { callAnalysisWorkerOnce } from '../../hooks/useAnalysisWorker';
import type { ColumnStats } from '../../lib/types';

interface Props {
  datasetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  statistics: Record<string, ColumnStats>;
  rowCount: number;
  qualityScore: number;
}

interface ComparisonData {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  statistics: Record<string, ColumnStats>;
  rowCount: number;
  qualityScore: number;
}

function fmt(v: number | undefined, decimals = 2) {
  if (v === undefined || isNaN(v)) return 'N/A';
  return v.toFixed(decimals);
}

function DeltaBadge({ a, b }: { a: number | undefined; b: number | undefined }) {
  if (a === undefined || b === undefined) return <span className="text-paper-dimmer text-xs">—</span>;
  const delta = b - a;
  const pct = a !== 0 ? ((delta / Math.abs(a)) * 100).toFixed(1) : '—';
  if (Math.abs(delta) < 0.001) return <span className="flex items-center gap-0.5 text-xs text-paper-dim"><Minus className="w-3 h-3" /> No change</span>;
  if (delta > 0) return <span className="flex items-center gap-0.5 text-xs text-emerald-400"><TrendingUp className="w-3 h-3" /> +{fmt(delta)} ({pct}%)</span>;
  return <span className="flex items-center gap-0.5 text-xs text-red-400"><TrendingDown className="w-3 h-3" /> {fmt(delta)} ({pct}%)</span>;
}

export default function DataComparisonTab({ datasetName, columns, rows, statistics, rowCount, qualityScore }: Props) {
  const [comparing, setComparing] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const datasetA: ComparisonData = { name: datasetName, columns, rows, statistics, rowCount, qualityScore };

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const parsed = await parseFile(file);
      // PERFORMANCE FIX: profiling the comparison file (which can itself be
      // a 1,000,000-row dataset) used to run synchronously on the main
      // thread here. Routed through the shared analysis worker instead;
      // `loading` (already tracked above) covers the wait.
      const prof = await callAnalysisWorkerOnce<{ statistics: Record<string, ColumnStats>; qualityScore: number }>(
        parsed.columns, parsed.rows, { type: 'profile' }
      );
      setComparing({
        name: file.name.replace(/\.[^.]+$/, ''),
        columns: parsed.columns,
        rows: parsed.rows,
        statistics: prof.statistics,
        rowCount: parsed.rowCount,
        qualityScore: prof.qualityScore,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
    setLoading(false);
    e.target.value = '';
  }

  const sharedCols = comparing
    ? datasetA.columns.filter(c => {
        const statA = datasetA.statistics[c];
        const statB = comparing.statistics[c];
        return statA?.mean !== undefined && statB?.mean !== undefined;
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-paper flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-accent-bright" />
          Dataset Comparison
        </h2>
        <p className="text-sm text-paper-dim mt-0.5">Compare current dataset against another file</p>
      </div>

      {!comparing ? (
        <div className="p-8 bg-ink-surface border-2 border-dashed border-ink-borderStrong rounded-2xl text-center">
          <GitCompare className="w-10 h-10 text-paper-dimmer mx-auto mb-4" />
          <p className="text-paper font-medium mb-2">Upload a second dataset to compare</p>
          <p className="text-paper-dim text-sm mb-5">Compare KPIs, column statistics, and data quality side by side</p>
          <label className="cursor-pointer">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-bright text-ink text-sm font-semibold rounded-xl transition">
              <Upload className="w-4 h-4" />
              {loading ? 'Loading…' : 'Upload Dataset B'}
            </div>
            <input type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFile} className="hidden" disabled={loading} />
          </label>
          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-sm justify-center">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* KPI comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Row Count', a: datasetA.rowCount, b: comparing.rowCount },
              { label: 'Column Count', a: datasetA.columns.length, b: comparing.columns.length },
              { label: 'Quality Score', a: datasetA.qualityScore, b: comparing.qualityScore },
            ].map(({ label, a, b }) => (
              <div key={label} className="bg-ink-surface border border-ink-border rounded-xl p-4">
                <div className="text-xs text-paper-dim mb-3">{label}</div>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-xs text-paper-dim mb-0.5">A: {datasetA.name}</div>
                    <div className="text-lg font-bold text-paper">{a.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-paper-dim mb-0.5">B: {comparing.name}</div>
                    <div className="text-lg font-bold text-accent-bright">{b.toLocaleString()}</div>
                  </div>
                </div>
                <DeltaBadge a={a} b={b} />
              </div>
            ))}
          </div>

          {/* Column comparison */}
          <div className="bg-ink-surface border border-ink-border rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-ink-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-paper">Shared Numeric Columns ({sharedCols.length})</h3>
              <label className="cursor-pointer">
                <span className="flex items-center gap-1 text-xs text-accent-bright hover:text-accent transition">
                  <Upload className="w-3 h-3" /> Change file B
                </span>
                <input type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFile} className="hidden" />
              </label>
            </div>
            {sharedCols.length === 0 ? (
              <div className="p-8 text-center text-paper-dim">
                <p className="text-sm">No shared numeric columns between the two datasets.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-border">
                      <th className="text-left px-4 py-3 text-xs text-paper-dim font-medium">Column</th>
                      <th className="text-right px-4 py-3 text-xs text-paper-dim font-medium">Mean A</th>
                      <th className="text-right px-4 py-3 text-xs text-paper-dim font-medium">Mean B</th>
                      <th className="text-right px-4 py-3 text-xs text-paper-dim font-medium">Delta</th>
                      <th className="text-right px-4 py-3 text-xs text-paper-dim font-medium">Max A</th>
                      <th className="text-right px-4 py-3 text-xs text-paper-dim font-medium">Max B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sharedCols.map(col => {
                      const sA = datasetA.statistics[col];
                      const sB = comparing.statistics[col];
                      return (
                        <tr key={col} className="border-b border-ink-border/50 hover:bg-ink-raised/30 transition">
                          <td className="px-4 py-3 font-medium text-paper">{col}</td>
                          <td className="px-4 py-3 text-right text-paper/90 tabular-nums">{fmt(sA?.mean)}</td>
                          <td className="px-4 py-3 text-right text-accent-bright tabular-nums">{fmt(sB?.mean)}</td>
                          <td className="px-4 py-3 text-right"><DeltaBadge a={sA?.mean} b={sB?.mean} /></td>
                          <td className="px-4 py-3 text-right text-paper/90 tabular-nums">{fmt(sA?.max as number)}</td>
                          <td className="px-4 py-3 text-right text-accent-bright tabular-nums">{fmt(sB?.max as number)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
