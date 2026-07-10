import { useState, useMemo, useEffect } from 'react';
import { Filter, X, Plus, Download } from 'lucide-react';
import { saveFilterConfig, loadFilterConfig } from '../../lib/session-store';

interface Props {
  datasetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  onFiltered: (rows: Record<string, unknown>[]) => void;
}

type Operator =
  | 'equals' | 'not_equals'
  | 'contains' | 'starts_with' | 'ends_with'
  | 'gt' | 'lt' | 'between'
  | 'date_range';

interface FilterRule {
  id: string;
  column: string;
  operator: Operator;
  value: string;
  value2: string;
  enabled: boolean;
}

const OPERATORS: { id: Operator; label: string; needsTwo?: boolean }[] = [
  { id: 'equals',      label: 'Equals' },
  { id: 'not_equals',  label: 'Not Equals' },
  { id: 'contains',    label: 'Contains' },
  { id: 'starts_with', label: 'Starts With' },
  { id: 'ends_with',   label: 'Ends With' },
  { id: 'gt',          label: 'Greater Than' },
  { id: 'lt',          label: 'Less Than' },
  { id: 'between',     label: 'Between', needsTwo: true },
  { id: 'date_range',  label: 'Date Range', needsTwo: true },
];

function applyRule(row: Record<string, unknown>, rule: FilterRule): boolean {
  const raw = row[rule.column];
  const cell = String(raw ?? '').toLowerCase();
  const val = rule.value.toLowerCase();
  const val2 = rule.value2.toLowerCase();
  const num = Number(raw);
  const numVal = Number(rule.value);
  const numVal2 = Number(rule.value2);

  switch (rule.operator) {
    case 'equals':      return cell === val;
    case 'not_equals':  return cell !== val;
    case 'contains':    return cell.includes(val);
    case 'starts_with': return cell.startsWith(val);
    case 'ends_with':   return cell.endsWith(val);
    case 'gt':          return !isNaN(num) ? num > numVal : cell > val;
    case 'lt':          return !isNaN(num) ? num < numVal : cell < val;
    case 'between':
      if (!isNaN(num) && !isNaN(numVal) && !isNaN(numVal2))
        return num >= numVal && num <= numVal2;
      return cell >= val && cell <= val2;
    case 'date_range': {
      const d = new Date(String(raw ?? ''));
      const d1 = new Date(rule.value);
      const d2 = new Date(rule.value2);
      return !isNaN(d.getTime()) && d >= d1 && d <= d2;
    }
    default: return true;
  }
}

function uid() { return Math.random().toString(36).slice(2); }

export default function AdvancedFilterTab({ datasetName, columns, rows, onFiltered }: Props) {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [applied, setApplied] = useState(false);

  // Restore rules/logic for this dataset on mount (covers a hard refresh —
  // SPA navigation already keeps this component mounted and its state intact).
  useEffect(() => {
    let cancelled = false;
    loadFilterConfig(datasetName).then(cfg => {
      if (cancelled || !cfg) return;
      setRules(cfg.rules as FilterRule[]);
      setLogic(cfg.logic);
    });
    return () => { cancelled = true; };
  }, [datasetName]);

  // Persist whenever rules/logic change so an in-progress (not-yet-applied)
  // filter configuration survives a reload too.
  useEffect(() => {
    const t = setTimeout(() => { saveFilterConfig(datasetName, { rules, logic }); }, 400);
    return () => clearTimeout(t);
  }, [datasetName, rules, logic]);

  const filtered = useMemo(() => {
    const active = rules.filter(r => r.enabled && r.column && r.value);
    if (active.length === 0) return rows;
    return rows.filter(row => {
      if (logic === 'AND') return active.every(r => applyRule(row, r));
      return active.some(r => applyRule(row, r));
    });
  }, [rules, rows, logic]);

  function addRule() {
    setRules(prev => [...prev, {
      id: uid(),
      column: columns[0] ?? '',
      operator: 'contains',
      value: '',
      value2: '',
      enabled: true,
    }]);
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  function updateRule(id: string, patch: Partial<FilterRule>) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function applyFilters() {
    onFiltered(filtered);
    setApplied(true);
  }

  function clearAll() {
    setRules([]);
    onFiltered(rows);
    setApplied(false);
  }

  function exportCSV() {
    if (filtered.length === 0) return;
    const header = columns.join(',');
    const body = filtered.map(r => columns.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'filtered.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const activeCount = rules.filter(r => r.enabled && r.column && r.value).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-paper">Advanced Filters</h2>
          <p className="text-sm text-paper-dim mt-0.5">
            {activeCount > 0
              ? `${activeCount} active filter${activeCount > 1 ? 's' : ''} — ${filtered.length.toLocaleString()} / ${rows.length.toLocaleString()} rows match`
              : `${rows.length.toLocaleString()} rows`}
          </p>
        </div>
        <div className="flex gap-2">
          {rules.length > 0 && (
            <button onClick={clearAll} className="flex items-center gap-2 px-3 py-2 bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong text-paper/90 text-sm rounded-lg transition">
              <X className="w-4 h-4" /> Clear All
            </button>
          )}
          {filtered.length > 0 && filtered !== rows && (
            <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-paper text-sm rounded-lg transition">
              <Download className="w-4 h-4" /> Export Filtered
            </button>
          )}
          <button onClick={addRule} className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-bright text-ink text-sm rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Filter
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Filter className="w-10 h-10 text-paper-dimmer mb-3" />
          <p className="text-paper-dim font-medium">No filters applied</p>
          <p className="text-paper-dim text-sm mt-1">Click "Add Filter" to start filtering your data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Logic toggle */}
          {rules.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-paper-dim">Match</span>
              {(['AND', 'OR'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLogic(l)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition ${logic === l ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}
                >
                  {l === 'AND' ? 'ALL filters (AND)' : 'ANY filter (OR)'}
                </button>
              ))}
            </div>
          )}

          {rules.map((rule, idx) => {
            const opMeta = OPERATORS.find(o => o.id === rule.operator);
            return (
              <div key={rule.id} className="flex items-center gap-2 flex-wrap p-3 bg-ink-surface border border-ink-border rounded-xl">
                <span className="text-xs text-paper-dim w-6 text-center">{idx + 1}</span>

                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={e => updateRule(rule.id, { enabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-blue-500"
                />

                <select
                  value={rule.column}
                  onChange={e => updateRule(rule.id, { column: e.target.value })}
                  className="bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select
                  value={rule.operator}
                  onChange={e => updateRule(rule.id, { operator: e.target.value as Operator })}
                  className="bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>

                {rule.operator === 'date_range' ? (
                  <>
                    <input type="date" value={rule.value} onChange={e => updateRule(rule.id, { value: e.target.value })}
                      className="bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent" />
                    <span className="text-paper-dim text-xs">to</span>
                    <input type="date" value={rule.value2} onChange={e => updateRule(rule.id, { value2: e.target.value })}
                      className="bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent" />
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      value={rule.value}
                      placeholder="Value…"
                      onChange={e => updateRule(rule.id, { value: e.target.value })}
                      className="bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-2 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {opMeta?.needsTwo && (
                      <>
                        <span className="text-paper-dim text-xs">and</span>
                        <input
                          type="text"
                          value={rule.value2}
                          placeholder="Value 2…"
                          onChange={e => updateRule(rule.id, { value2: e.target.value })}
                          className="bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-2 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </>
                    )}
                  </>
                )}

                <button onClick={() => removeRule(rule.id)} className="ml-auto text-paper-dim hover:text-red-400 transition p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          <div className="flex gap-3 pt-2">
            <button
              onClick={applyFilters}
              className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-bright text-ink text-sm font-medium rounded-lg transition"
            >
              <Filter className="w-4 h-4" />
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {applied && rules.length > 0 && (
        <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-border flex items-center justify-between">
            <span className="text-sm font-medium text-paper">Filter Results</span>
            <span className="text-xs text-paper-dim">{filtered.length.toLocaleString()} rows</span>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ink-raised">
                <tr>
                  {columns.slice(0, 8).map(c => (
                    <th key={c} className="text-left px-3 py-2 text-paper-dim font-medium whitespace-nowrap">{c}</th>
                  ))}
                  {columns.length > 8 && <th className="px-3 py-2 text-paper-dim">+{columns.length - 8} more</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-t border-ink-border/50 hover:bg-ink-raised/30">
                    {columns.slice(0, 8).map(c => (
                      <td key={c} className="px-3 py-2 text-paper/90 whitespace-nowrap max-w-[200px] truncate">
                        {String(row[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 100 && (
            <div className="px-4 py-2 border-t border-ink-border text-xs text-paper-dim">
              Showing first 100 of {filtered.length.toLocaleString()} rows
            </div>
          )}
        </div>
      )}
    </div>
  );
}
