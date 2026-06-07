import { useState } from 'react';
import { Wand2, CheckCircle2, AlertTriangle, Loader2, RotateCcw, Download } from 'lucide-react';
import { applyCleaningRules } from '../../lib/data-processing';
import type { CleaningRule } from '../../lib/types';

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  onCleaned: (rows: Record<string, unknown>[], changes: string[]) => void;
}

function defaultRules(columns: string[]): CleaningRule[] {
  const rules: CleaningRule[] = [
    { id: 'dup', type: 'remove_duplicates', enabled: true, label: 'Remove duplicate rows' },
    { id: 'ws', type: 'trim_whitespace', enabled: true, label: 'Trim whitespace in text columns' },
  ];
  for (const col of columns.slice(0, 6)) {
    rules.push({ id: `null_${col}`, type: 'remove_nulls', column: col, enabled: false, label: `Remove rows where "${col}" is null` });
    rules.push({ id: `mean_${col}`, type: 'fill_mean', column: col, enabled: false, label: `Fill nulls in "${col}" with mean` });
  }
  return rules;
}

export default function CleanTab({ columns, rows, onCleaned }: Props) {
  const [rules, setRules] = useState<CleaningRule[]>(() => defaultRules(columns));
  const [applied, setApplied] = useState(false);
  const [changes, setChanges] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleanedRows, setCleanedRows] = useState<Record<string, unknown>[] | null>(null);

  function toggleRule(id: string) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  }

  async function handleApply() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 0));
    const enabledRules = rules.filter(r => r.enabled);
    const { rows: cleaned, changes: log } = applyCleaningRules(rows, columns, enabledRules);
    setChanges(log);
    setApplied(true);
    setLoading(false);
    setCleanedRows(cleaned);
    onCleaned(cleaned, log);
  }

  function handleReset() {
    setRules(defaultRules(columns));
    setApplied(false);
    setChanges([]);
    setCleanedRows(null);
    onCleaned(rows, []);
  }

  function handleExport() {
    const data = cleanedRows ?? rows;
    const header = columns.join(',');
    const body = data.map(row =>
      columns.map(col => {
        const val = row[col] ?? '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(',')
    ).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cleaned_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Cleaning Rules</h3>
          <p className="text-slate-500 text-xs mt-0.5">{enabledCount} rule{enabledCount !== 1 ? 's' : ''} selected</p>
        </div>
        <div className="flex gap-2">
          {applied && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          )}
          {applied && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition"
            >
              <Download className="w-4 h-4" /> Export Cleaned CSV
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={loading || enabledCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Apply Rules
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {rules.map(rule => (
          <label
            key={rule.id}
            className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${rule.enabled ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'}`}
          >
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={() => toggleRule(rule.id)}
              className="w-4 h-4 accent-blue-500 rounded"
            />
            <div>
              <p className="text-sm text-slate-200">{rule.label ?? rule.type}</p>
              {rule.column && (
                <p className="text-xs text-slate-500 mt-0.5">Column: {rule.column}</p>
              )}
            </div>
          </label>
        ))}
      </div>

      {applied && changes.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">Cleaning Applied</span>
          </div>
          <ul className="space-y-1">
            {changes.map((c, i) => (
              <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">•</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {applied && changes.length === 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3 text-slate-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          No changes were made — data may already be clean.
        </div>
      )}
    </div>
  );
}