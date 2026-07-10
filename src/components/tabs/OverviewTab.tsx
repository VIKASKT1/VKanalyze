import { memo, useMemo } from 'react';
import { Database, AlertTriangle, CheckCircle, Copy, Rows, Columns2, HardDrive, Hash, Type, Star } from 'lucide-react';
import type { ParsedData } from '../../lib/data-processing';
import type { ProfileData, ColumnStats } from '../../lib/types';
import { formatBytes } from '../../lib/utils';

interface Props {
  file: File;
  parsed: ParsedData;
  profile: ProfileData;
}

interface KPIProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'sky' | 'rose';
}

const COLORS: Record<KPIProps['color'], { text: string; bg: string; border: string }> = {
  blue:   { text: 'text-accent-bright',   bg: 'bg-accent/10',   border: 'border-accent/25' },
  emerald:{ text: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20' },
  amber:  { text: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  red:    { text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  purple: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  sky:    { text: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' },
  rose:   { text: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20' },
};

function KPICard({ label, value, sub, icon: Icon, color }: KPIProps) {
  const c = COLORS[color];
  return (
    <div className={`flex items-center gap-4 p-4 bg-ink-surface border ${c.border} rounded-xl`}>
      <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.text}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-paper-dim uppercase tracking-wide truncate">{label}</p>
        <p className={`text-xl font-bold ${c.text} leading-tight`}>{value}</p>
        {sub && <p className="text-xs text-paper-dim truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// RENDER PERF FIX: `parsed`/`profile` are now stable references from the
// parent (see DataFlowApp's `currentParsed`/`activeProfile` memoization), so
// React.memo lets this component skip re-rendering entirely when unrelated
// parent state changes (menus, notifications, other tabs' local state).
function OverviewTab({ file, parsed, profile }: Props) {
  const colTypes = useMemo(() => {
    const numericCols = parsed.columns.filter(col => {
      const s = profile.statistics[col] as ColumnStats;
      return s?.mean !== undefined;
    });
    return { numeric: numericCols.length, text: parsed.columns.length - numericCols.length };
  }, [parsed, profile]);

  const totalMissing = useMemo(() =>
    Object.values(profile.missingValues).reduce((a, b) => a + b, 0),
    [profile]
  );

  const topNullCols = useMemo(() =>
    Object.entries(profile.missingValues)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    [profile]
  );

  const score = profile.qualityScore;
  const scoreColor: KPIProps['color'] = score >= 80 ? 'emerald' : score >= 60 ? 'amber' : 'red';
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Work';

  const kpis: KPIProps[] = [
    { label: 'Total Rows',       value: parsed.rowCount.toLocaleString(),       sub: 'records',                          icon: Rows,     color: 'blue' },
    { label: 'Total Columns',    value: parsed.columnCount.toLocaleString(),     sub: `${colTypes.numeric} num, ${colTypes.text} text`, icon: Columns2, color: 'sky' },
    { label: 'Missing Values',   value: totalMissing.toLocaleString(),           sub: `across ${parsed.columnCount} cols`, icon: AlertTriangle, color: totalMissing === 0 ? 'emerald' : 'amber' },
    { label: 'Duplicate Rows',   value: profile.duplicateRows.toLocaleString(),  sub: profile.duplicateRows === 0 ? 'none found' : 'rows to remove', icon: Copy, color: profile.duplicateRows === 0 ? 'emerald' : 'red' },
    { label: 'Numeric Columns',  value: colTypes.numeric.toLocaleString(),        sub: 'numeric / float',                  icon: Hash,     color: 'purple' },
    { label: 'Text Columns',     value: colTypes.text.toLocaleString(),           sub: 'string / categorical',             icon: Type,     color: 'rose' },
    { label: 'Quality Score',    value: `${score}/100`,                           sub: scoreLabel,                         icon: Star,     color: scoreColor },
    { label: 'File Size',        value: formatBytes(file.size),                   sub: file.name.length > 24 ? file.name.slice(0, 24) + '…' : file.name, icon: HardDrive, color: 'blue' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Dashboard */}
      <div>
        <h3 className="text-xs font-semibold text-paper-dim uppercase tracking-wide mb-3">KPI Dashboard</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map(kpi => <KPICard key={kpi.label} {...kpi} />)}
        </div>
      </div>

      {/* Quality bar */}
      <div className="bg-ink-surface border border-ink-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-paper-dim" />
            <span className="text-sm font-medium text-paper/90">Data Quality Overview</span>
          </div>
          <span className={`text-sm font-bold ${score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
            {score}/100 — {scoreLabel}
          </span>
        </div>
        <div className="h-2.5 bg-ink-raised rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${score >= 80 ? 'bg-emerald-400' : score >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-paper-dim mt-2">
          <span>{profile.duplicateRows} duplicate row{profile.duplicateRows !== 1 ? 's' : ''}</span>
          <span>{totalMissing} missing value{totalMissing !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Missing values */}
        <div className="bg-ink-surface border border-ink-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-paper">Top Missing Value Columns</h3>
          </div>
          {topNullCols.length === 0 ? (
            <p className="text-paper-dim text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" /> No missing values detected.
            </p>
          ) : (
            <div className="space-y-3">
              {topNullCols.map(([col, count]) => {
                const pct = Math.round((count / parsed.rowCount) * 100);
                return (
                  <div key={col}>
                    <div className="flex justify-between text-xs text-paper-dim mb-1">
                      <span className="truncate max-w-[60%]">{col}</span>
                      <span>{count.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-ink-raised rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column breakdown */}
        <div className="bg-ink-surface border border-ink-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-accent-bright" />
            <h3 className="text-sm font-semibold text-paper">Column Types</h3>
          </div>
          <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {parsed.columns.map(col => {
              const s = profile.statistics[col] as ColumnStats;
              const isNumeric = s?.mean !== undefined;
              const nullPct = s ? Math.round((s.nullCount / parsed.rowCount) * 100) : 0;
              return (
                <div key={col} className="flex items-center justify-between text-xs py-1.5 border-b border-ink-border last:border-0">
                  <span className="text-paper/90 truncate max-w-[55%]">{col}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isNumeric ? 'bg-accent/15 text-accent-bright' : 'bg-ink-raised text-paper-dim'}`}>
                      {isNumeric ? 'number' : 'string'}
                    </span>
                    {nullPct > 0 && (
                      <span className="text-amber-400">{nullPct}% null</span>
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

export default memo(OverviewTab);
