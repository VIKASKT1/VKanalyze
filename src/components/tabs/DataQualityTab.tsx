import { memo, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Info, Lightbulb, Calendar, Hash, Loader2 } from 'lucide-react';
import type { ColumnStats } from '../../lib/types';
import { useCachedWorkerAnalysis } from '../../hooks/useAnalysisWorker';

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  statistics: Record<string, ColumnStats>;
  qualityScore: number;
  duplicateRows: number;
}

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <svg width="100" height="100" className="rotate-[-90deg]">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#2A2E3A" strokeWidth="10" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="50" y="55" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold"
        style={{ transform: 'rotate(90deg)', transformOrigin: '50px 50px' }}>
        {score}
      </text>
    </svg>
  );
}

// RENDER PERF FIX: `rows`/`columns`/`statistics` here come from
// DataFlowApp's stable memoized references, and the actual analysis is
// already worker-backed + dataset-cached (see comment above). Wrapping in
// React.memo lets this skip re-rendering entirely on unrelated parent state
// changes (menus, other tabs' state, etc.).
function DataQualityTab({ columns, rows, statistics, qualityScore, duplicateRows }: Props) {
  // PERFORMANCE FIX: this used to be a synchronous useMemo doing, for every
  // column, a full `rows.map()` plus a `new Date()` parse per row to detect
  // date columns/invalid dates plus another full pass for invalid numbers —
  // measured at ~1.6s for an 8-column, 1,000,000-row dataset, and it fully
  // re-ran on every single mount of this tab (since local component state
  // doesn't survive a tab switch — see dataset-cache.ts). It now runs once
  // in the shared analysis Web Worker and the result is cached by the
  // identity of `rows`, so revisiting this tab after the first visit reads
  // the cached result instantly with zero main-thread work.
  interface QualityScanResult {
    issues: Array<{ type: string; col: string; count: number; pct: number; severity: 'critical' | 'warning' | 'info' }>;
    dateColumns: string[];
    numberIssues: Array<{ col: string; count: number }>;
  }
  const { data: scanResult, loading: scanLoading } = useCachedWorkerAnalysis<QualityScanResult>(
    rows.length > 0 ? 'quality-scan' : null,
    columns,
    rows,
    () => ({ type: 'quality-scan', statistics }),
    [columns, rows, statistics]
  );
  const analysis: QualityScanResult = useMemo(
    () => scanResult ?? { issues: [], dateColumns: [], numberIssues: [] },
    [scanResult]
  );

  const totalMissing = useMemo(() =>
    Object.values(statistics).reduce((sum, s) => sum + (s?.nullCount ?? 0), 0),
    [statistics]
  );

  const recommendations: string[] = useMemo(() => {
    const recs: string[] = [];
    const highMissCols = Object.entries(statistics)
      .filter(([, s]) => s.nullCount / rows.length > 0.2)
      .map(([c]) => c);

    if (highMissCols.length > 0)
      recs.push(`Fill or drop columns with >20% missing values: ${highMissCols.slice(0, 3).join(', ')}`);
    if (duplicateRows > 0)
      recs.push(`Remove ${duplicateRows} duplicate row${duplicateRows > 1 ? 's' : ''} using the Clean tab`);
    if (analysis.dateColumns.length > 0)
      recs.push(`Standardize date formats in: ${analysis.dateColumns.join(', ')}`);
    if (qualityScore >= 80)
      recs.push('Dataset quality is excellent — ready for analysis and visualization');
    else if (qualityScore >= 60)
      recs.push('Moderate quality — address missing values to improve analysis accuracy');
    else
      recs.push('Low quality score — prioritize cleaning before drawing conclusions');
    return recs;
  }, [statistics, rows, duplicateRows, analysis, qualityScore]);

  const scoreLabel = qualityScore >= 80 ? 'Excellent' : qualityScore >= 60 ? 'Good' : qualityScore >= 40 ? 'Fair' : 'Poor';
  const scoreColor = qualityScore >= 80 ? 'text-emerald-400' : qualityScore >= 60 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-paper flex items-center gap-2">
          Data Quality Center
          {scanLoading && <Loader2 className="w-4 h-4 animate-spin text-paper-dim" />}
        </h2>
        <p className="text-sm text-paper-dim mt-0.5">Comprehensive analysis of data health and actionable recommendations</p>
      </div>

      {/* Score + KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex items-center gap-4 p-5 bg-ink-surface border border-ink-border rounded-xl">
          <ScoreRing score={qualityScore} />
          <div>
            <p className="text-xs text-paper-dim uppercase tracking-wide">Quality Score</p>
            <p className={`text-2xl font-bold ${scoreColor}`}>{qualityScore}<span className="text-paper-dim text-base">/100</span></p>
            <p className={`text-sm font-medium ${scoreColor}`}>{scoreLabel}</p>
          </div>
        </div>

        {[
          { label: 'Missing Values', value: totalMissing.toLocaleString(), icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Duplicate Rows', value: duplicateRows.toLocaleString(), icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Detected Date Cols', value: analysis.dateColumns.length.toString(), icon: Calendar, color: 'text-accent-bright', bg: 'bg-accent/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-4 p-5 bg-ink-surface border border-ink-border rounded-xl">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-xs text-paper-dim uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Issues breakdown */}
      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-border flex items-center gap-2">
          <Info className="w-4 h-4 text-paper-dim" />
          <span className="text-sm font-medium text-paper">Issues by Column</span>
          <span className="ml-auto text-xs text-paper-dim">{analysis.issues.length} issue{analysis.issues.length !== 1 ? 's' : ''} found</span>
        </div>
        {analysis.issues.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">No issues detected — dataset looks clean!</span>
          </div>
        ) : (
          <div className="divide-y divide-ink-border">
            {analysis.issues.map((issue, i) => {
              const icon = issue.severity === 'critical' ? XCircle : issue.severity === 'warning' ? AlertTriangle : Info;
              const Icon = icon;
              const colors: Record<string, string> = { critical: 'text-red-400', warning: 'text-amber-400', info: 'text-accent-bright' };
              const bg: Record<string, string> = { critical: 'bg-red-500/10', warning: 'bg-amber-500/10', info: 'bg-accent/10' };
              const typeLabel: Record<string, string> = { missing: 'Missing Values', invalid_date: 'Invalid Dates', invalid_number: 'Invalid Numbers' };
              return (
                <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-raised/30 transition">
                  <div className={`w-8 h-8 rounded-lg ${bg[issue.severity]} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${colors[issue.severity]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-paper truncate">{issue.col}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${bg[issue.severity]} ${colors[issue.severity]}`}>
                        {typeLabel[issue.type] ?? issue.type}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-ink-raised rounded-full overflow-hidden max-w-[200px]">
                        <div
                          className={`h-full rounded-full transition-all ${issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-accent'}`}
                          style={{ width: `${Math.min(issue.pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-paper-dim">{issue.count.toLocaleString()} ({issue.pct.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Missing by column heatmap */}
      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-border">
          <span className="text-sm font-medium text-paper flex items-center gap-2"><Hash className="w-4 h-4 text-paper-dim" /> Missing Values by Column</span>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {columns.map(col => {
            const s = statistics[col];
            const pct = s ? (s.nullCount / rows.length) * 100 : 0;
            const filled = 100 - pct;
            const color = pct === 0 ? 'bg-emerald-500' : pct < 10 ? 'bg-amber-500' : 'bg-red-500';
            return (
              <div key={col} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-paper-dim truncate max-w-[100px]">{col}</span>
                  <span className="text-xs text-paper-dim">{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-ink-raised rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${filled}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-border flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-paper">Recommendations</span>
        </div>
        <ul className="divide-y divide-ink-border">
          {recommendations.map((rec, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-3">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span className="text-sm text-paper/90">{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default memo(DataQualityTab);
