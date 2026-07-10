import { memo, useState, useMemo, useCallback, useEffect } from 'react';
import {
  Wand2, CheckCircle2, AlertTriangle, Loader2, RotateCcw, Sparkles,
  Save, Upload, Trash2, Download, Search, ChevronDown, ChevronUp,
  Plus, X, Check, Filter, BarChart2, ArrowRight, Info, Edit2,
  ChevronsUpDown,
} from 'lucide-react';
import { applyCleaningRules, profileData } from '../../lib/data-processing';
import { callAnalysisWorkerOnce } from '../../hooks/useAnalysisWorker';
import { exportToCSV, exportToXLSX } from '../../lib/export';
import { generateCleaningRecommendations } from '../../lib/ai';
import type { CleaningRule, CleaningRecommendation, CleaningWorkflow } from '../../lib/types';
import { idbGet, idbSet, idbDelete, idbGetAllKeys, STORES } from '../../lib/db';

// ── Types ────────────────────────────────────────────────────────────────────
type RuleCategory = 'all' | 'missing' | 'text' | 'numeric' | 'dates' | 'outliers' | 'columns';

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  /**
   * Profile (statistics/qualityScore/duplicateRows) already computed once
   * for this exact `rows` array — by the upload worker or the parent's
   * cached profile. PERFORMANCE FIX: this tab used to call profileData()
   * itself on every mount (~5-7s on 1M rows) purely to recompute values the
   * app already had. Passing it in eliminates that recompute entirely.
   */
  profile: ReturnType<typeof profileData>;
  datasetName?: string;
  onCleaned: (
    rows: Record<string, unknown>[],
    changes: string[],
    newProfile?: ReturnType<typeof profileData>,
    newColumns?: string[]
  ) => void;
  /** Navigate to the Preview tab using the now-active (cleaned) dataset. */
  onContinueAnalysis?: () => void;
}

// ── Catalogue of creatable rule templates ────────────────────────────────────
interface RuleTemplate {
  type: string;
  label: string;
  category: RuleCategory;
  needsColumn: boolean;
  needsColumns?: boolean; // multi-column select
  params?: Record<string, { label: string; type: 'text' | 'number' | 'select'; options?: string[]; default?: unknown }>;
}

const RULE_TEMPLATES: RuleTemplate[] = [
  // Missing Values
  { type: 'remove_nulls',      label: 'Remove rows where column is null',         category: 'missing', needsColumn: true },
  { type: 'fill_mean',         label: 'Fill nulls with mean',                      category: 'missing', needsColumn: true },
  { type: 'fill_median',       label: 'Fill nulls with median',                    category: 'missing', needsColumn: true },
  { type: 'fill_mode',         label: 'Fill nulls with mode (most frequent)',       category: 'missing', needsColumn: true },
  { type: 'fill_zero',         label: 'Fill nulls with 0',                         category: 'missing', needsColumn: true },
  { type: 'fill_constant',     label: 'Fill nulls with a constant value',          category: 'missing', needsColumn: true,
    params: { value: { label: 'Constant value', type: 'text', default: '' } } },
  { type: 'forward_fill',      label: 'Forward fill (carry previous value down)',  category: 'missing', needsColumn: true },
  { type: 'backward_fill',     label: 'Backward fill (carry next value up)',       category: 'missing', needsColumn: true },
  // Text
  { type: 'trim_whitespace',        label: 'Trim whitespace (all text columns)',  category: 'text', needsColumn: false },
  { type: 'remove_extra_spaces',    label: 'Remove extra spaces',                 category: 'text', needsColumn: true },
  { type: 'remove_special_characters', label: 'Remove special characters',        category: 'text', needsColumn: true },
  { type: 'remove_html_tags',       label: 'Strip HTML tags',                     category: 'text', needsColumn: true },
  { type: 'lowercase',              label: 'Convert to lowercase',                category: 'text', needsColumn: true },
  { type: 'uppercase',              label: 'Convert to UPPERCASE',                category: 'text', needsColumn: true },
  { type: 'title_case',             label: 'Convert to Title Case',               category: 'text', needsColumn: true },
  { type: 'standardize_case',       label: 'Standardize case (choose style)',     category: 'text', needsColumn: true,
    params: { caseType: { label: 'Case style', type: 'select', options: ['lowercase','uppercase','title'], default: 'lowercase' } } },
  { type: 'find_replace',           label: 'Find & Replace text',                 category: 'text', needsColumn: true,
    params: {
      find:    { label: 'Find',    type: 'text', default: '' },
      replace: { label: 'Replace', type: 'text', default: '' },
    }},
  { type: 'regex_replace',          label: 'Regex Replace',                       category: 'text', needsColumn: true,
    params: {
      pattern:     { label: 'Pattern (regex)',  type: 'text', default: '' },
      replacement: { label: 'Replacement',      type: 'text', default: '' },
    }},
  // Dates
  { type: 'standardize_date', label: 'Standardize date format → YYYY-MM-DD', category: 'dates', needsColumn: true },
  // Numeric
  { type: 'round_decimals',    label: 'Round to N decimal places',  category: 'numeric', needsColumn: true,
    params: { decimals: { label: 'Decimal places', type: 'number', default: 2 } } },
  { type: 'replace_infinity',  label: 'Replace Infinity with null', category: 'numeric', needsColumn: true },
  { type: 'clamp_range',       label: 'Clamp values to [min, max]', category: 'numeric', needsColumn: true,
    params: {
      min: { label: 'Min', type: 'number', default: 0 },
      max: { label: 'Max', type: 'number', default: 100 },
    }},
  // Outliers
  { type: 'remove_outliers',              label: 'Remove outlier rows (IQR)',            category: 'outliers', needsColumn: true },
  { type: 'cap_outliers',                 label: 'Cap outliers to IQR bounds',           category: 'outliers', needsColumn: true },
  { type: 'replace_outliers_with_median', label: 'Replace outliers with median',         category: 'outliers', needsColumn: true },
  { type: 'replace_outliers_with_mean',   label: 'Replace outliers with mean',           category: 'outliers', needsColumn: true },
  // Columns
  { type: 'drop_column',   label: 'Drop column',                  category: 'columns', needsColumn: true },
  { type: 'rename_column', label: 'Rename column',                category: 'columns', needsColumn: true,
    params: { newName: { label: 'New column name', type: 'text', default: '' } } },
  { type: 'split_column',  label: 'Split column into two parts',  category: 'columns', needsColumn: true,
    params: {
      delimiter: { label: 'Delimiter', type: 'text', default: ',' },
      col1:      { label: 'Left column name',  type: 'text', default: '' },
      col2:      { label: 'Right column name', type: 'text', default: '' },
    }},
  { type: 'merge_columns', label: 'Merge multiple columns into one', category: 'columns', needsColumn: false, needsColumns: true,
    params: {
      separator: { label: 'Separator', type: 'text', default: ' ' },
      outputCol: { label: 'Output column name', type: 'text', default: '' },
    }},
  { type: 'remove_duplicates',            label: 'Remove all duplicate rows',            category: 'columns', needsColumn: false },
  { type: 'remove_duplicates_by_columns', label: 'Remove duplicates by specific columns', category: 'columns', needsColumn: false, needsColumns: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function getRuleCategory(type: string): RuleCategory {
  const tpl = RULE_TEMPLATES.find(t => t.type === type);
  return tpl?.category ?? 'all';
}

function buildDefaultRules(columns: string[]): CleaningRule[] {
  return [
    { id: 'dup',  type: 'remove_duplicates', enabled: true,  label: 'Remove duplicate rows' },
    { id: 'ws',   type: 'trim_whitespace',   enabled: true,  label: 'Trim whitespace (all text columns)' },
    // Fill-median for first 6 numeric-looking columns — just disabled starters
    ...columns.slice(0, 6).map(col => ({
      id: `median_${col}`, type: 'fill_median', column: col, enabled: false,
      label: `Fill nulls in "${col}" with median`,
    })),
  ];
}

function makeRuleLabel(tpl: RuleTemplate, column?: string, params?: Record<string, unknown>, cols?: string[]): string {
  if (tpl.needsColumns && cols?.length) return `${tpl.label}: ${cols.join(', ')}`;
  if (tpl.needsColumn && column) {
    if (tpl.type === 'find_replace')  return `"${column}": replace "${params?.find}" → "${params?.replace}"`;
    if (tpl.type === 'regex_replace') return `"${column}": regex /${params?.pattern}/ → "${params?.replacement}"`;
    if (tpl.type === 'rename_column') return `Rename "${column}" → "${params?.newName}"`;
    if (tpl.type === 'split_column')  return `Split "${column}" on "${params?.delimiter}"`;
    if (tpl.type === 'clamp_range')   return `Clamp "${column}" [${params?.min}, ${params?.max}]`;
    if (tpl.type === 'round_decimals') return `Round "${column}" to ${params?.decimals ?? 2} decimals`;
    if (tpl.type === 'standardize_case') return `Case "${column}": ${params?.caseType}`;
    if (tpl.type === 'fill_constant') return `Fill nulls in "${column}" with "${params?.value}"`;
    return `${tpl.label}: "${column}"`;
  }
  return tpl.label;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QualityCard({ before, after }: { before: number; after: number }) {
  const diff = after - before;
  const color = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-ink-borderStrong rounded-xl p-5">
      <h4 className="text-sm font-semibold text-paper flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-accent-bright" /> Quality Score Improvement
      </h4>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-paper-dim mb-1">Before</p>
          <p className={`text-2xl font-bold ${color(before)}`}>{before}%</p>
        </div>
        <ArrowRight className="w-5 h-5 text-paper-dim flex-shrink-0" />
        <div className="text-center">
          <p className="text-xs text-paper-dim mb-1">After</p>
          <p className={`text-2xl font-bold ${color(after)}`}>{after}%</p>
        </div>
        <span className={`ml-auto px-3 py-1 rounded-full text-sm font-semibold ${diff > 0 ? 'bg-emerald-500/20 text-emerald-400' : diff === 0 ? 'bg-ink-raised text-paper-dim' : 'bg-red-500/20 text-red-400'}`}>
          {diff > 0 ? '+' : ''}{diff}%
        </span>
      </div>
    </div>
  );
}

// RENDER PERF FIX: wrapped in React.memo so a recommendation card only
// re-renders when its own `rec` prop (or callback identity) changes — see
// the applyRecommendation/dismissRecommendation useCallback wrappers added
// at the call site below, which give onApply/onDismiss stable identities
// instead of a fresh inline arrow function per card per render. Previously
// every recommendation card re-rendered on any unrelated CleanTab state
// change (typing in the rule search box, toggling a different panel, etc.)
// even though this card does no expensive work itself — this satisfies the
// requirement that recommendation cards never rerender due to unrelated UI
// state.
const RecommendationCard = memo(function RecommendationCard({ rec, onApply, onDismiss }: {
  rec: CleaningRecommendation; onApply: (rec: CleaningRecommendation) => void; onDismiss: (rec: CleaningRecommendation) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-accent/5 border border-accent/25 rounded-xl">
      <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4 text-accent-bright" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-paper">{rec.column ?? 'Dataset'}</p>
        <p className="text-xs text-paper-dim mt-0.5">{rec.reason}</p>
        <p className="text-xs text-accent-bright mt-0.5 font-mono">{rec.type}</p>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={() => onApply(rec)} className="px-2 py-1 rounded-lg bg-accent/10 hover:bg-accent/40 text-accent-bright text-xs font-medium transition flex items-center gap-1">
          <Check className="w-3 h-3" /> Apply
        </button>
        <button onClick={() => onDismiss(rec)} className="p-1 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper-dim text-xs transition">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

// ── Inline param editor shown inside a rule row ───────────────────────────────
function RuleParamEditor({
  rule, columns, onChange,
}: {
  rule: CleaningRule;
  columns: string[];
  onChange: (updates: Partial<CleaningRule>) => void;
}) {
  const tpl = RULE_TEMPLATES.find(t => t.type === rule.type);
  if (!tpl) return null;

  const params = rule.params ?? {};

  // Multi-column selector (merge_columns, remove_duplicates_by_columns)
  if (tpl.needsColumns) {
    const selected: string[] = (rule.columns ?? []) as string[];
    return (
      <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
        <p className="text-xs text-paper-dim">Select columns:</p>
        <div className="flex flex-wrap gap-1.5">
          {columns.map(col => {
            const active = selected.includes(col);
            return (
              <button key={col} type="button"
                onClick={() => {
                  const next = active ? selected.filter(c => c !== col) : [...selected, col];
                  onChange({ columns: next, label: makeRuleLabel(tpl, undefined, params, next) });
                }}
                className={`px-2 py-0.5 rounded-full text-xs border transition ${active ? 'bg-accent border-accent text-ink' : 'bg-ink-raised border-ink-borderStrong text-paper-dim hover:border-ink-borderStrong'}`}
              >{col}</button>
            );
          })}
        </div>
        {tpl.params && Object.entries(tpl.params).map(([key, spec]) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs text-paper-dim w-28 flex-shrink-0">{spec.label}</label>
            <input type={spec.type === 'number' ? 'number' : 'text'}
              value={String(params[key] ?? spec.default ?? '')}
              onChange={e => {
                const newParams = { ...params, [key]: spec.type === 'number' ? Number(e.target.value) : e.target.value };
                onChange({ params: newParams, label: makeRuleLabel(tpl, rule.column, newParams, rule.columns) });
              }}
              className="flex-1 bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-xs text-paper focus:outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>
    );
  }

  if (!tpl.params) return null;

  return (
    <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
      {Object.entries(tpl.params).map(([key, spec]) => (
        <div key={key} className="flex items-center gap-2">
          <label className="text-xs text-paper-dim w-28 flex-shrink-0">{spec.label}</label>
          {spec.type === 'select' ? (
            <select
              value={String(params[key] ?? spec.default ?? '')}
              onChange={e => {
                const newParams = { ...params, [key]: e.target.value };
                onChange({ params: newParams, label: makeRuleLabel(tpl, rule.column, newParams) });
              }}
              className="flex-1 bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-xs text-paper focus:outline-none focus:border-accent"
            >
              {spec.options?.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={spec.type === 'number' ? 'number' : 'text'}
              value={String(params[key] ?? spec.default ?? '')}
              onChange={e => {
                const newParams = { ...params, [key]: spec.type === 'number' ? Number(e.target.value) : e.target.value };
                onChange({ params: newParams, label: makeRuleLabel(tpl, rule.column, newParams) });
              }}
              className="flex-1 bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-xs text-paper focus:outline-none focus:border-accent"
              placeholder={String(spec.default ?? '')}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Add Rule Panel ────────────────────────────────────────────────────────────
function AddRulePanel({ columns, onAdd, onClose }: {
  columns: string[];
  onAdd: (rule: CleaningRule) => void;
  onClose: () => void;
}) {
  const [filterCat, setFilterCat] = useState<RuleCategory>('all');
  const [search, setSearch] = useState('');
  const [selectedTpl, setSelectedTpl] = useState<RuleTemplate | null>(null);
  const [selectedCol, setSelectedCol] = useState('');
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (selectedTpl?.params) {
      const defaults: Record<string, unknown> = {};
      Object.entries(selectedTpl.params).forEach(([k, v]) => { defaults[k] = v.default ?? ''; });
      setParamValues(defaults);
    } else {
      setParamValues({});
    }
    setSelectedCol('');
    setSelectedCols([]);
  }, [selectedTpl]);

  const visible = RULE_TEMPLATES.filter(t =>
    (filterCat === 'all' || t.category === filterCat) &&
    (search === '' || t.label.toLowerCase().includes(search.toLowerCase()))
  );

  const CATS: { id: RuleCategory; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'missing', label: 'Missing' },
    { id: 'text', label: 'Text' }, { id: 'numeric', label: 'Numeric' },
    { id: 'dates', label: 'Dates' }, { id: 'outliers', label: 'Outliers' },
    { id: 'columns', label: 'Columns' },
  ];

  function handleAdd() {
    if (!selectedTpl) return;
    if (selectedTpl.needsColumn && !selectedCol) return;
    if (selectedTpl.needsColumns && selectedCols.length < 1) return;
    const id = `custom_${selectedTpl.type}_${Date.now()}`;
    const rule: CleaningRule = {
      id,
      type: selectedTpl.type,
      column: selectedTpl.needsColumn ? selectedCol : undefined,
      columns: selectedTpl.needsColumns ? selectedCols : undefined,
      enabled: true,
      params: Object.keys(paramValues).length > 0 ? paramValues : undefined,
      label: makeRuleLabel(selectedTpl, selectedTpl.needsColumn ? selectedCol : undefined, paramValues, selectedCols),
    };
    // For fill_constant, wire value from params
    if (selectedTpl.type === 'fill_constant') rule.value = paramValues['value'] as string | number | undefined;
    onAdd(rule);
    onClose();
  }

  const canAdd = selectedTpl && (!selectedTpl.needsColumn || selectedCol) && (!selectedTpl.needsColumns || selectedCols.length > 0);

  return (
    <div className="bg-ink-surface border border-accent/30 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-border">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-accent-bright" />
          <span className="text-sm font-semibold text-paper">Add Cleaning Rule</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-ink-borderStrong rounded text-paper-dim">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-paper-dim" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rule types..."
            className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg pl-8 pr-3 py-1.5 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap">
          {CATS.map(c => (
            <button key={c.id} onClick={() => setFilterCat(c.id)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${filterCat === c.id ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim border border-ink-borderStrong hover:text-paper'}`}
            >{c.label}</button>
          ))}
        </div>

        {/* Rule type list */}
        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
          {visible.map(tpl => (
            <button key={tpl.type} onClick={() => setSelectedTpl(tpl)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${selectedTpl?.type === tpl.type ? 'bg-accent/10 border border-accent/40 text-paper' : 'bg-ink-raised/50 border border-transparent text-paper/90 hover:bg-ink-raised hover:text-paper'}`}
            >
              <span>{tpl.label}</span>
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                tpl.category === 'missing' ? 'bg-purple-500/20 text-purple-400' :
                tpl.category === 'text'    ? 'bg-accent/15 text-accent-bright' :
                tpl.category === 'numeric' ? 'bg-amber-500/20 text-amber-400' :
                tpl.category === 'dates'   ? 'bg-cyan-500/20 text-cyan-400' :
                tpl.category === 'outliers'? 'bg-red-500/20 text-red-400' :
                'bg-ink-raised text-paper-dim'
              }`}>{tpl.category}</span>
            </button>
          ))}
          {visible.length === 0 && <p className="text-xs text-paper-dim p-2">No rules match.</p>}
        </div>

        {/* Config area */}
        {selectedTpl && (
          <div className="border-t border-ink-border pt-3 space-y-2">
            {/* Column selector */}
            {selectedTpl.needsColumn && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-paper-dim w-28 flex-shrink-0">Column</label>
                <select value={selectedCol} onChange={e => setSelectedCol(e.target.value)}
                  className="flex-1 bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-sm text-paper focus:outline-none focus:border-accent">
                  <option value="">— select column —</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {/* Multi-column selector */}
            {selectedTpl.needsColumns && (
              <div className="space-y-1">
                <label className="text-xs text-paper-dim">Select columns:</label>
                <div className="flex flex-wrap gap-1.5">
                  {columns.map(col => {
                    const active = selectedCols.includes(col);
                    return (
                      <button key={col} type="button"
                        onClick={() => setSelectedCols(prev => active ? prev.filter(c => c !== col) : [...prev, col])}
                        className={`px-2 py-0.5 rounded-full text-xs border transition ${active ? 'bg-accent border-accent text-ink' : 'bg-ink-raised border-ink-borderStrong text-paper-dim hover:border-ink-borderStrong'}`}
                      >{col}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Params */}
            {selectedTpl.params && Object.entries(selectedTpl.params).map(([key, spec]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-xs text-paper-dim w-28 flex-shrink-0">{spec.label}</label>
                {spec.type === 'select' ? (
                  <select value={String(paramValues[key] ?? spec.default ?? '')}
                    onChange={e => setParamValues(p => ({ ...p, [key]: e.target.value }))}
                    className="flex-1 bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-sm text-paper focus:outline-none focus:border-accent">
                    {spec.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={spec.type === 'number' ? 'number' : 'text'}
                    value={String(paramValues[key] ?? spec.default ?? '')}
                    onChange={e => setParamValues(p => ({ ...p, [key]: spec.type === 'number' ? Number(e.target.value) : e.target.value }))}
                    className="flex-1 bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-sm text-paper focus:outline-none focus:border-accent"
                    placeholder={String(spec.default ?? '')}
                  />
                )}
              </div>
            ))}

            <button onClick={handleAdd} disabled={!canAdd}
              className="w-full py-2 rounded-lg bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed text-ink text-sm font-medium transition flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add Rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rule Row ──────────────────────────────────────────────────────────────────
function RuleRow({ rule, columns, onToggle, onRemove, onChange }: {
  rule: CleaningRule;
  columns: string[];
  onToggle: () => void;
  onRemove: () => void;
  onChange: (updates: Partial<CleaningRule>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tpl = RULE_TEMPLATES.find(t => t.type === rule.type);
  const hasParams = tpl && (tpl.params || tpl.needsColumns);
  const cat = getRuleCategory(rule.type);

  const catColor: Record<string, string> = {
    missing: 'bg-purple-500/20 text-purple-400',
    text: 'bg-accent/15 text-accent-bright',
    numeric: 'bg-amber-500/20 text-amber-400',
    dates: 'bg-cyan-500/20 text-cyan-400',
    outliers: 'bg-red-500/20 text-red-400',
    columns: 'bg-ink-raised text-paper-dim',
    all: 'bg-ink-raised text-paper-dim',
  };

  return (
    <div className={`rounded-xl border transition-all ${rule.enabled ? 'bg-accent/5 border-accent/25' : 'bg-ink-raised/40 border-ink-borderStrong/50'}`}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <input type="checkbox" checked={rule.enabled} onChange={onToggle}
          className="w-4 h-4 accent-blue-500 rounded flex-shrink-0 cursor-pointer" />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <p className="text-sm text-paper truncate">{rule.label ?? rule.type}</p>
          <span className={`inline-block text-xs px-1.5 py-0.5 rounded mt-0.5 ${catColor[cat] ?? catColor.all}`}>{cat}</span>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {hasParams && (
            <button onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg hover:bg-ink-borderStrong text-paper-dim hover:text-paper/90 transition" title="Edit params">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-ink-borderStrong text-paper-dimmer hover:text-red-400 transition" title="Remove">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {expanded && hasParams && (
        <div className="px-4 pb-3 border-t border-ink-borderStrong/50 pt-2">
          <RuleParamEditor rule={rule} columns={columns} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ── Main CleanTab ─────────────────────────────────────────────────────────────
// RENDER PERF FIX: `columns`/`rows` come from `parsed` (stable), `profile`
// is the original profile object from props (stable unless a new file is
// uploaded), and `onCleaned`/`onContinueAnalysis` are now both stable
// useCallback references from DataFlowApp (see `continueToPreview` above).
// Wrapping in React.memo lets this whole tab — including its internal
// RecommendationCard list — skip re-rendering on unrelated parent state
// changes.
function CleanTab({ columns, rows, profile, datasetName, onCleaned, onContinueAnalysis }: Props) {
  const [rules, setRules] = useState<CleaningRule[]>(() => buildDefaultRules(columns));
  const [applied, setApplied] = useState(false);
  const [changes, setChanges] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [beforeScore, setBeforeScore] = useState<number | null>(null);
  const [afterScore, setAfterScore] = useState<number | null>(null);
  const [cleanedRowsResult, setCleanedRowsResult] = useState<Record<string, unknown>[]>([]);
  const [cleanedColumnsResult, setCleanedColumnsResult] = useState<string[]>([]);
  const [replaced, setReplaced] = useState(false);

  const [recommendations, setRecommendations] = useState<CleaningRecommendation[]>([]);
  const [dismissedRecs, setDismissedRecs] = useState<Set<string>>(new Set());
  const [recsExpanded, setRecsExpanded] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<RuleCategory>('all');

  const [showAddPanel, setShowAddPanel] = useState(false);

  const [workflows, setWorkflows] = useState<CleaningWorkflow[]>([]);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowsExpanded, setWorkflowsExpanded] = useState(false);
  const [workflowImportJson, setWorkflowImportJson] = useState('');
  const [showImportInput, setShowImportInput] = useState(false);

  // Load workflows
  useEffect(() => {
    idbGetAllKeys(STORES.WORKFLOWS).then(keys =>
      Promise.all(keys.map(k => idbGet<CleaningWorkflow>(STORES.WORKFLOWS, k)))
    ).then(loaded => setWorkflows(loaded.filter(Boolean) as CleaningWorkflow[])).catch(() => {});
  }, []);

  // Generate recommendations.
  // PERFORMANCE FIX: this used to call profileData(columns, rows) here on
  // every mount (i.e. every time the user switched to the Clean tab),
  // fully re-running computeStatistics + duplicate-row detection over the
  // whole dataset (~5-7s measured on 1,000,000 rows) even though `profile`
  // was already computed once, upstream, for this exact `rows` array.
  // generateCleaningRecommendations only reads the statistics object and
  // row counts — it doesn't scan `rows` itself — so this is now effectively
  // free (no full-dataset pass at all).
  useEffect(() => {
    if (rows.length === 0) return;
    setBeforeScore(profile.qualityScore);
    setRecommendations(generateCleaningRecommendations(columns, rows, profile.statistics, profile.duplicateRows));
  }, [columns, rows, profile]);

  const filteredRules = useMemo(() =>
    rules.filter(r => {
      const matchCat = activeCategory === 'all' || getRuleCategory(r.type) === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchSearch = q === '' ||
        (r.label ?? r.type).toLowerCase().includes(q) ||
        (r.column ?? '').toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q);
      return matchCat && matchSearch;
    }),
  [rules, activeCategory, searchQuery]);

  const enabledCount = rules.filter(r => r.enabled).length;

  async function handleApply() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 0));
    // Root cause of the quality-score-resets-to-0% bug: rules like drop_column,
    // rename_column, and split_column change the effective column set, but this
    // used to re-profile the cleaned rows against the ORIGINAL `columns` prop.
    // Any column that got dropped or renamed no longer exists as a key on the
    // cleaned rows, so profileData/computeStatistics saw it as 100% null for
    // every row — tanking nullRatio and crushing the score toward 0. Using the
    // `columns` returned by applyCleaningRules (which tracks drops/renames/splits
    // as it runs) fixes the mismatch at the source.
    const { rows: cleaned, changes: log, columns: newColumns } = applyCleaningRules(rows, columns, rules.filter(r => r.enabled));
    // PERFORMANCE FIX: profiling the cleaned result is a genuinely fresh
    // computation (the data changed), so it can't be served from cache —
    // but it's still a multi-second synchronous call on large datasets.
    // Route it through the shared analysis worker so "Apply" doesn't
    // freeze the tab while it runs; `loading` (already tracked above)
    // covers the wait.
    const newProfile = await callAnalysisWorkerOnce<ReturnType<typeof profileData>>(newColumns, cleaned, {
      type: 'profile',
    });
    setAfterScore(newProfile.qualityScore);
    setChanges(log);
    setApplied(true);
    setLoading(false);
    setCleanedRowsResult(cleaned);
    setCleanedColumnsResult(newColumns);
    setReplaced(false);
    onCleaned(cleaned, log, newProfile, newColumns);
  }

  function handleReset() {
    setRules(buildDefaultRules(columns));
    setApplied(false);
    setChanges([]);
    setBeforeScore(null);
    setAfterScore(null);
    setCleanedRowsResult([]);
    setCleanedColumnsResult([]);
    setReplaced(false);
    // Pass undefined explicitly for columns so DataFlowApp's handleCleaned
    // clears cleanedProfile/cleanedColumns entirely (falling back to the
    // original, correctly-computed profile) instead of leaving a stale
    // quality score from the cleaning state that's being reset.
    onCleaned(rows, [], undefined, undefined);
  }

  function updateRule(id: string, updates: Partial<CleaningRule>) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  function selectAll() {
    setRules(prev => prev.map(r => filteredRules.find(f => f.id === r.id) ? { ...r, enabled: true } : r));
  }
  function deselectAll() {
    setRules(prev => prev.map(r => filteredRules.find(f => f.id === r.id) ? { ...r, enabled: false } : r));
  }

  const applyRecommendation = useCallback((rec: CleaningRecommendation) => {
    const id = `rec_${rec.type}_${rec.column ?? 'all'}_${Date.now()}`;
    const tpl = RULE_TEMPLATES.find(t => t.type === rec.type);
    const defaultParams: Record<string, unknown> = {};
    if (tpl?.params) Object.entries(tpl.params).forEach(([k, v]) => { defaultParams[k] = v.default ?? ''; });
    setRules(prev => [...prev, {
      id, type: rec.type, column: rec.column, enabled: true,
      label: `✨ ${rec.column ? `"${rec.column}": ` : ''}${rec.type.replace(/_/g, ' ')}`,
      params: Object.keys(defaultParams).length > 0 ? defaultParams : rec.params,
    }]);
    setDismissedRecs(prev => new Set([...prev, `${rec.type}_${rec.column}`]));
  }, []);

  // RENDER PERF FIX: stable callback (empty deps, just like applyRecommendation
  // above) so RecommendationCard can take `rec` + this function directly as
  // props instead of the parent creating a brand-new `() =>
  // setDismissedRecs(...)` closure per card per render — that inline-closure
  // pattern was the one thing still defeating RecommendationCard's
  // React.memo despite the card itself being wrapped.
  const dismissRecommendation = useCallback((rec: CleaningRecommendation) => {
    setDismissedRecs(prev => new Set([...prev, `${rec.type}_${rec.column}`]));
  }, []);

  const applyAllRecommendations = useCallback(() => {
    const visible = recommendations.filter(r => !dismissedRecs.has(`${r.type}_${r.column}`));
    const newRules: CleaningRule[] = visible.map((rec, i) => {
      const tpl = RULE_TEMPLATES.find(t => t.type === rec.type);
      const defaultParams: Record<string, unknown> = {};
      if (tpl?.params) Object.entries(tpl.params).forEach(([k, v]) => { defaultParams[k] = v.default ?? ''; });
      return {
        id: `rec_all_${i}_${Date.now()}`, type: rec.type, column: rec.column, enabled: true,
        label: `✨ ${rec.column ? `"${rec.column}": ` : ''}${rec.type.replace(/_/g, ' ')}`,
        params: Object.keys(defaultParams).length > 0 ? defaultParams : rec.params,
      };
    });
    setRules(prev => [...prev, ...newRules]);
    setDismissedRecs(new Set(recommendations.map(r => `${r.type}_${r.column}`)));
  }, [recommendations, dismissedRecs]);

  async function saveWorkflow() {
    if (!workflowName.trim()) return;
    const wf: CleaningWorkflow = {
      id: `wf_${Date.now()}`, name: workflowName.trim(),
      rules: rules.filter(r => r.enabled),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    await idbSet(STORES.WORKFLOWS, wf.id, wf);
    setWorkflows(prev => [...prev, wf]);
    setWorkflowName('');
  }

  function loadWorkflow(wf: CleaningWorkflow) {
    const existing = new Set(rules.map(r => r.id));
    const newRules = wf.rules.filter(r => !existing.has(r.id)).map(r => ({ ...r, enabled: true }));
    setRules(prev => [...prev, ...newRules]);
  }

  async function deleteWorkflow(id: string) {
    await idbDelete(STORES.WORKFLOWS, id);
    setWorkflows(prev => prev.filter(w => w.id !== id));
  }

  function exportWorkflow(wf: CleaningWorkflow) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' }));
    a.download = `${wf.name.replace(/\s+/g, '_')}_workflow.json`;
    a.click();
  }

  async function importWorkflow() {
    try {
      const wf = JSON.parse(workflowImportJson) as CleaningWorkflow;
      wf.id = `wf_${Date.now()}`; wf.updatedAt = Date.now();
      await idbSet(STORES.WORKFLOWS, wf.id, wf);
      setWorkflows(prev => [...prev, wf]);
      setWorkflowImportJson(''); setShowImportInput(false);
    } catch { alert('Invalid workflow JSON'); }
  }

  const visibleRecs = recommendations.filter(r => !dismissedRecs.has(`${r.type}_${r.column}`));

  const CATEGORIES: { id: RuleCategory; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'missing', label: 'Missing' },
    { id: 'text', label: 'Text' }, { id: 'numeric', label: 'Numeric' },
    { id: 'dates', label: 'Dates' }, { id: 'outliers', label: 'Outliers' },
    { id: 'columns', label: 'Columns' },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-paper">Cleaning Rules</h3>
          <p className="text-paper-dim text-xs mt-0.5">{enabledCount} rule{enabledCount !== 1 ? 's' : ''} active · {rules.length} total</p>
        </div>
        <div className="flex gap-2">
          {applied && (
            <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={loading || enabledCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-bright disabled:opacity-50 disabled:cursor-not-allowed text-ink text-sm font-medium transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Apply Rules
          </button>
        </div>
      </div>

      {/* ── Quality card ── */}
      {applied && beforeScore !== null && afterScore !== null && (
        <QualityCard before={beforeScore} after={afterScore} />
      )}

      {/* ── Change log ── */}
      {applied && changes.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">Cleaning Applied — {changes.length} operation{changes.length !== 1 ? 's' : ''}</span>
          </div>
          <ul className="space-y-0.5">
            {changes.map((c, i) => (
              <li key={i} className="text-sm text-paper/90 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">✓</span>{c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {applied && changes.length === 0 && (
        <div className="bg-ink-raised/50 border border-ink-borderStrong/50 rounded-xl p-4 flex items-center gap-3 text-paper-dim text-sm">
          <AlertTriangle className="w-4 h-4" /> No changes were made — data may already be clean.
        </div>
      )}

      {/* ── Post-cleaning actions ── */}
      {applied && (
        <div className="bg-ink-surface border border-ink-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-paper">Cleaning completed</span>
          </div>
          <p className="text-xs text-paper-dim">
            {changes.length} operation{changes.length !== 1 ? 's' : ''} applied
            {beforeScore !== null && afterScore !== null && afterScore >= beforeScore
              ? ' · Quality improved' : ''}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => exportToCSV(cleanedRowsResult, cleanedColumnsResult, `${datasetName ?? 'dataset'}_cleaned`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition"
            >
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
            <button
              onClick={() => exportToXLSX(cleanedRowsResult, cleanedColumnsResult, `${datasetName ?? 'dataset'}_cleaned`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition"
            >
              <Download className="w-3.5 h-3.5" /> Download Excel (.xlsx)
            </button>

            {/* The cleaned dataset is already the app's working dataset as soon
                as Apply Rules runs (onCleaned updates the parent's cleanedRows/
                cleanedColumns state, which Preview/Charts/SQL/Dashboard/Filters/
                Statistics all read via currentRows/currentColumns). This button
                confirms that to the user rather than performing a second,
                redundant write. */}
            <button
              onClick={() => setReplaced(true)}
              disabled={replaced}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong disabled:opacity-60 text-paper/90 text-sm transition"
            >
              {replaced ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
              {replaced ? 'Working Dataset Updated' : 'Replace Current Dataset'}
            </button>

            {onContinueAnalysis && (
              <button
                onClick={onContinueAnalysis}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent-bright text-ink text-sm font-medium transition ml-auto"
              >
                Continue Analysis <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Smart Recommendations ── */}
      {visibleRecs.length > 0 && (
        <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
          <button onClick={() => setRecsExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink-raised/40 transition">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-bright" />
              <span className="text-sm font-semibold text-paper">✨ Smart Cleaning Recommendations</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent-bright">{visibleRecs.length}</span>
            </div>
            {recsExpanded ? <ChevronUp className="w-4 h-4 text-paper-dim" /> : <ChevronDown className="w-4 h-4 text-paper-dim" />}
          </button>
          {recsExpanded && (
            <div className="px-4 pb-4 space-y-2">
              <div className="flex justify-end">
                <button onClick={applyAllRecommendations}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/40 text-accent-bright border border-accent/25 transition">
                  Apply All
                </button>
              </div>
              {visibleRecs.map((rec, i) => (
                <RecommendationCard key={i} rec={rec}
                  onApply={applyRecommendation}
                  onDismiss={dismissRecommendation} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Workflows ── */}
      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        <button onClick={() => setWorkflowsExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink-raised/40 transition">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-paper-dim" />
            <span className="text-sm font-semibold text-paper">Cleaning Workflows</span>
            {workflows.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-ink-raised text-paper-dim">{workflows.length}</span>}
          </div>
          {workflowsExpanded ? <ChevronUp className="w-4 h-4 text-paper-dim" /> : <ChevronDown className="w-4 h-4 text-paper-dim" />}
        </button>
        {workflowsExpanded && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex gap-2">
              <input type="text" value={workflowName} onChange={e => setWorkflowName(e.target.value)}
                placeholder='e.g. "HR Dataset Cleanup"'
                className="flex-1 bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
              <button onClick={saveWorkflow} disabled={!workflowName.trim() || enabledCount === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent/10 hover:bg-accent/40 text-accent-bright text-sm disabled:opacity-40 disabled:cursor-not-allowed transition">
                <Plus className="w-4 h-4" /> Save
              </button>
              <button onClick={() => setShowImportInput(e => !e)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition">
                <Upload className="w-4 h-4" /> Import
              </button>
            </div>
            {showImportInput && (
              <div className="space-y-2">
                <textarea value={workflowImportJson} onChange={e => setWorkflowImportJson(e.target.value)}
                  placeholder="Paste workflow JSON here..." rows={3}
                  className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-xs text-paper/90 placeholder-paper-dimmer focus:outline-none focus:border-accent resize-none font-mono" />
                <button onClick={importWorkflow}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent text-ink hover:bg-accent-bright transition">
                  Import Workflow
                </button>
              </div>
            )}
            {workflows.length === 0 ? (
              <p className="text-xs text-paper-dim py-1">No saved workflows yet. Enable rules and save them.</p>
            ) : (
              <div className="space-y-2">
                {workflows.map(wf => (
                  <div key={wf.id} className="flex items-center gap-3 p-3 bg-ink-raised/50 border border-ink-borderStrong/50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-paper">{wf.name}</p>
                      <p className="text-xs text-paper-dim">{wf.rules.length} rule{wf.rules.length !== 1 ? 's' : ''} · {new Date(wf.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => loadWorkflow(wf)} className="p-1.5 rounded-lg hover:bg-ink-borderStrong text-paper-dim hover:text-accent-bright transition" title="Load workflow">
                        <ChevronsUpDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => exportWorkflow(wf)} className="p-1.5 rounded-lg hover:bg-ink-borderStrong text-paper-dim hover:text-emerald-400 transition" title="Export JSON">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteWorkflow(wf.id)} className="p-1.5 rounded-lg hover:bg-ink-borderStrong text-paper-dim hover:text-red-400 transition" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Rule Panel ── */}
      {showAddPanel ? (
        <AddRulePanel columns={columns} onAdd={rule => setRules(prev => [...prev, rule])} onClose={() => setShowAddPanel(false)} />
      ) : (
        <button onClick={() => setShowAddPanel(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-ink-borderStrong hover:border-accent/50 text-paper-dim hover:text-accent-bright text-sm transition">
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      )}

      {/* ── Bulk + Search + Filter ── */}
      <div className="space-y-2.5">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search rules..."
              className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg pl-9 pr-8 py-2 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-paper-dim" />
              </button>
            )}
          </div>
          <button onClick={selectAll} className="px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition flex items-center gap-1.5 whitespace-nowrap">
            <Check className="w-3.5 h-3.5" /> All
          </button>
          <button onClick={deselectAll} className="px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition flex items-center gap-1.5 whitespace-nowrap">
            <X className="w-3.5 h-3.5" /> None
          </button>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <Filter className="w-3.5 h-3.5 text-paper-dim flex-shrink-0" />
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${activeCategory === cat.id ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper border border-ink-borderStrong'}`}>
              {cat.label}
            </button>
          ))}
          {(searchQuery || activeCategory !== 'all') && (
            <span className="text-xs text-paper-dim ml-1">{filteredRules.length} shown</span>
          )}
        </div>
      </div>

      {/* ── Rules list ── */}
      <div className="space-y-1.5">
        {filteredRules.length === 0 ? (
          <div className="flex items-center gap-3 p-4 text-paper-dim text-sm">
            <Info className="w-4 h-4" /> No rules match your filter.
          </div>
        ) : (
          filteredRules.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              columns={columns}
              onToggle={() => updateRule(rule.id, { enabled: !rule.enabled })}
              onRemove={() => removeRule(rule.id)}
              onChange={updates => updateRule(rule.id, updates)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(CleanTab);
