import { useMemo } from 'react';
import { Database, TrendingUp, AlertTriangle, CheckCircle, Copy, BarChart2 } from 'lucide-react';
import type { ParsedData } from '../../lib/data-processing';
import type { ProfileData, ColumnStats } from '../../lib/types';
import { formatBytes, formatNumber } from '../../lib/utils';

interface Props {
  file: File;
  parsed: ParsedData;
  profile: ProfileData;
}

function StatCard({ label, value, sub, color = 'blue' }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    red: 'text-red-400 bg-red-500/10',
  };
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color].split(' ')[0]}`}>{formatNumber(value)}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function OverviewTab({ file, parsed, profile }: Props) {
  const colTypes = useMemo(() => {
    const numericCols = parsed.columns.filter(col => {
      const s = profile.statistics[col] as ColumnStats;
      return s?.mean !== undefined;
    });
    return { numeric: numericCols.length, text: parsed.columns.length - numericCols.length };
  }, [parsed, profile]);

  const topNullCols = useMemo(() =>
    Object.entries(profile.missingValues)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    [profile]
  );

  const score = profile.qualityScore;
  const scoreColor = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red';
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Work';

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Rows" value={parsed.rowCount} sub="records" />
        <StatCard label="Columns" value={parsed.columnCount} sub={`${colTypes.numeric} numeric, ${colTypes.text} text`} />
        <StatCard label="File Size" value={formatBytes(file.size)} sub={file.name} color="blue" />
        <StatCard label="Quality Score" value={`${score}/100`} sub={scoreLabel} color={scoreColor} />
      </div>

      {/* Quality bar */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Data Quality</span>
          </div>
          <span className={`text-sm font-bold ${score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
            {score}/100
          </span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${score >= 80 ? 'bg-emerald-400' : score >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-2">
          <span>{profile.duplicateRows} duplicate rows</span>
          <span>{Object.values(profile.missingValues).reduce((a, b) => a + b, 0)} missing values</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Missing values */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-200">Top Missing Value Columns</h3>
          </div>
          {topNullCols.length === 0 ? (
            <p className="text-slate-500 text-sm">No missing values detected.</p>
          ) : (
            <div className="space-y-3">
              {topNullCols.map(([col, count]) => {
                const pct = Math.round((count / parsed.rowCount) * 100);
                return (
                  <div key={col}>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span className="truncate max-w-[60%]">{col}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column breakdown */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-200">Column Types</h3>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {parsed.columns.map(col => {
              const s = profile.statistics[col] as ColumnStats;
              const isNumeric = s?.mean !== undefined;
              return (
                <div key={col} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-700/50 last:border-0">
                  <span className="text-slate-300 truncate max-w-[60%]">{col}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isNumeric ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-600/50 text-slate-400'}`}>
                      {isNumeric ? 'number' : 'string'}
                    </span>
                    {(s?.nullCount ?? 0) > 0 && (
                      <span className="text-amber-400">{s.nullCount} nulls</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
